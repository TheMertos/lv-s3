import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MultipartUploadEntity } from '../../entities/multipart-upload.entity';
import { MultipartPartEntity } from '../../entities/multipart-part.entity';
import { StorageService } from '../storage/storage.service';
import { uniqueSiblingTempPath } from '../../common/atomic-file';
import { md5HexOfFile } from '../../common/file-md5';
import { STREAM_UPLOAD_VALIDATION } from '../../common/upload-validation';
import { streamToFile } from '../../common/stream-to-file';
import {
  s3MultipartMaxPartBytes,
  s3MultipartMinPartBytes,
} from '../../config/s3-upload-limits';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class MultipartService {
  constructor(
    @InjectRepository(MultipartUploadEntity)
    private readonly uploads: Repository<MultipartUploadEntity>,
    @InjectRepository(MultipartPartEntity)
    private readonly parts: Repository<MultipartPartEntity>,
    private readonly storage: StorageService,
  ) {}

  /**
   * Starts a multipart upload session.
   */
  async initiate(
    bucket: string,
    key: string,
    partSize?: number,
    totalSize?: number,
  ): Promise<MultipartUploadEntity> {
    const exists = await this.storage.bucketExistsOnDisk(bucket);
    if (!exists) throw new NotFoundException('Bucket not found');
    const k = key.replace(/^\/+/, '');
    if (!k) throw new BadRequestException('key required');
    const upload = this.uploads.create({
      uploadId: crypto.randomUUID().replace(/-/g, ''),
      bucket,
      objectKey: k,
      status: 'in_progress',
      partSize: partSize ?? null,
      totalSize: totalSize ?? null,
    });
    return this.uploads.save(upload);
  }

  /**
   * Stores one uploaded part for an upload session.
   */
  async uploadPart(
    bucket: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<{ etag: string; size: number }> {
    return this.uploadPartFromStream(
      bucket,
      uploadId,
      partNumber,
      Readable.from(body),
      body.length,
    );
  }

  /**
   * Streams one bounded part to disk and stores its multipart metadata.
   * @param bucket - Bucket containing the multipart upload.
   * @param uploadId - Active multipart upload identifier.
   * @param partNumber - One-based part number from 1 through 10000.
   * @param source - Readable part payload.
   * @param declaredContentLength - Optional Content-Length for early validation.
   * @returns Stored part ETag and byte size.
   */
  async uploadPartFromStream(
    bucket: string,
    uploadId: string,
    partNumber: number,
    source: NodeJS.ReadableStream,
    declaredContentLength?: number,
  ): Promise<{ etag: string; size: number }> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      throw new BadRequestException('partNumber must be 1..10000');
    }
    if (declaredContentLength !== undefined) {
      this.assertAllowedPartSize(declaredContentLength);
    }
    const up = await this.getActiveUpload(bucket, uploadId);
    const partDir = this.partDir(uploadId);
    await fs.mkdir(partDir, { recursive: true });
    const partPath = path.join(partDir, `${partNumber}.part`);
    const { bytesWritten } = await streamToFile(
      source,
      partPath,
      s3MultipartMaxPartBytes(),
      partNumber === 1 ? STREAM_UPLOAD_VALIDATION : undefined,
    );
    if (bytesWritten === 0) {
      await fs.unlink(partPath).catch(() => {});
      throw new BadRequestException('part is empty');
    }
    const etag = await md5HexOfFile(partPath);
    const existing = await this.parts.findOne({
      where: { uploadRefId: up.id, partNumber },
    });
    if (existing) {
      existing.size = bytesWritten;
      existing.etag = etag;
      existing.partPath = partPath;
      await this.parts.save(existing);
    } else {
      await this.parts.save(
        this.parts.create({
          uploadRefId: up.id,
          partNumber,
          size: bytesWritten,
          etag,
          partPath,
        }),
      );
    }
    return { etag, size: bytesWritten };
  }

  /**
   * Lists uploaded parts for one upload session.
   */
  async listParts(
    bucket: string,
    uploadId: string,
  ): Promise<{ upload: MultipartUploadEntity; parts: MultipartPartEntity[] }> {
    const up = await this.getUpload(bucket, uploadId);
    const parts = await this.parts.find({
      where: { uploadRefId: up.id },
      order: { partNumber: 'ASC' },
    });
    return { upload: up, parts };
  }

  /**
   * Completes multipart upload by stitching parts and writing final object.
   */
  async complete(
    bucket: string,
    uploadId: string,
    key: string,
    orderedPartNumbers: number[],
  ): Promise<{ key: string; size: number; etag: string }> {
    const up = await this.getActiveUpload(bucket, uploadId);
    if (up.objectKey !== key.replace(/^\/+/, '')) {
      throw new BadRequestException('key mismatch');
    }
    const rows = await this.parts.find({
      where: { uploadRefId: up.id },
      order: { partNumber: 'ASC' },
    });
    if (!rows.length) throw new BadRequestException('no parts uploaded');
    const nums = rows.map((p) => p.partNumber);
    if (
      orderedPartNumbers.length !== nums.length ||
      orderedPartNumbers.some((n, i) => n !== nums[i])
    ) {
      throw new BadRequestException('partNumbers mismatch');
    }
    const fullPath = this.storage.resolveSafe(bucket, up.objectKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const plainTempPath = uniqueSiblingTempPath(fullPath, 'multipart');
    const hash = crypto.createHash('md5');
    let total: number;
    try {
      const result = await streamToFile(
        Readable.from(this.readPartChunks(rows, hash)),
        plainTempPath,
        Number.MAX_SAFE_INTEGER,
        STREAM_UPLOAD_VALIDATION,
      );
      total = result.bytesWritten;
      await this.storage.publishPlaintextTemp(
        bucket,
        up.objectKey,
        plainTempPath,
      );
    } catch (error) {
      await fs.unlink(plainTempPath).catch(() => {});
      throw error;
    }
    up.status = 'completed';
    await this.uploads.save(up);
    await this.cleanupUploadParts(up.id, uploadId);
    return { key: up.objectKey, size: total, etag: hash.digest('hex') };
  }

  /**
   * Streams ordered part files while updating the completed-object MD5 digest.
   * @param rows - Multipart part metadata in completion order.
   * @param hash - Incremental MD5 hash for the completed plaintext object.
   * @returns Async sequence of bounded file chunks.
   */
  private async *readPartChunks(
    rows: MultipartPartEntity[],
    hash: crypto.Hash,
  ): AsyncGenerator<Buffer> {
    for (const part of rows) {
      for await (const chunk of fsSync.createReadStream(part.partPath)) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        yield buffer;
      }
    }
  }

  /**
   * Aborts multipart upload and removes temporary parts.
   */
  async abort(bucket: string, uploadId: string): Promise<void> {
    const up = await this.getUpload(bucket, uploadId);
    up.status = 'aborted';
    await this.uploads.save(up);
    await this.cleanupUploadParts(up.id, uploadId);
  }

  /**
   * Lists active uploads for one bucket.
   */
  async listActiveUploads(bucket: string): Promise<MultipartUploadEntity[]> {
    return this.uploads.find({
      where: { bucket, status: 'in_progress' },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Aborts stale in-progress uploads.
   */
  async abortOlderThan(days: number): Promise<number> {
    if (days < 1) return 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stale = await this.uploads
      .createQueryBuilder('u')
      .where('u.status = :status', { status: 'in_progress' })
      .andWhere('u.created_at < :cutoff', { cutoff: cutoff.toISOString() })
      .getMany();
    for (const up of stale) {
      up.status = 'aborted';
      await this.uploads.save(up);
      await this.cleanupUploadParts(up.id, up.uploadId);
    }
    return stale.length;
  }

  /**
   * Returns one active upload in bucket.
   */
  private async getActiveUpload(
    bucket: string,
    uploadId: string,
  ): Promise<MultipartUploadEntity> {
    const up = await this.getUpload(bucket, uploadId);
    if (up.status !== 'in_progress') {
      throw new BadRequestException(`upload is ${up.status}`);
    }
    return up;
  }

  /**
   * Returns one upload in bucket.
   */
  private async getUpload(
    bucket: string,
    uploadId: string,
  ): Promise<MultipartUploadEntity> {
    const up = await this.uploads.findOne({ where: { bucket, uploadId } });
    if (!up) throw new NotFoundException('Upload not found');
    return up;
  }

  /**
   * Returns temporary directory path for one upload id.
   */
  private partDir(uploadId: string): string {
    return path.join(this.storage.getRoot(), '.lv-s3', 'multipart', uploadId);
  }

  /**
   * Rejects non-positive or over-limit part sizes while allowing small final parts.
   * @param size - Declared multipart part size in bytes.
   * @returns Nothing when the size is allowed.
   */
  private assertAllowedPartSize(size: number): void {
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new BadRequestException('part size must be a positive integer');
    }
    const maximum = s3MultipartMaxPartBytes();
    if (size > maximum) {
      throw new BadRequestException(
        `part size exceeds maximum of ${maximum} bytes`,
      );
    }
    if (size < s3MultipartMinPartBytes()) {
      return;
    }
  }

  /**
   * Deletes temporary parts and rows for one upload.
   */
  private async cleanupUploadParts(
    uploadRefId: number,
    uploadId: string,
  ): Promise<void> {
    await this.parts.delete({ uploadRefId });
    await fs.rm(this.partDir(uploadId), { recursive: true, force: true });
  }
}
