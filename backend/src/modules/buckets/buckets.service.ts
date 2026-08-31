import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

/**
 * Lists buckets with visibility; updates public/private; admin file browser ops.
 */
@Injectable()
export class BucketsService {
  constructor(private readonly storage: StorageService) {}

  async listWithVisibility(): Promise<
    { name: string; publicRead: boolean; encryptAtRest: boolean }[]
  > {
    const buckets = await this.storage.listBuckets();
    const out: { name: string; publicRead: boolean; encryptAtRest: boolean }[] =
      [];
    for (const b of buckets) {
      const { publicRead, encryptAtRest } =
        await this.storage.getBucketVisibility(b.name);
      out.push({ name: b.name, publicRead, encryptAtRest });
    }
    return out;
  }

  async setVisibility(name: string, publicRead: boolean): Promise<void> {
    const ok = await this.storage.bucketExistsOnDisk(name);
    if (!ok) throw new NotFoundException('Bucket not found');
    if (publicRead && (await this.storage.isBucketEncryptAtRest(name))) {
      throw new BadRequestException(
        'Encrypted buckets cannot be made publicly readable',
      );
    }
    await this.storage.setBucketPublicRead(name, publicRead);
  }

  /**
   * Creates a new bucket (admin UI).
   */
  async createBucket(
    name: string,
    opts?: { encryptAtRest?: boolean },
  ): Promise<void> {
    const exists = await this.storage.bucketExistsOnDisk(name);
    if (exists) throw new BadRequestException('Bucket already exists');
    await this.storage.createBucket(name, opts);
  }

  /**
   * Deletes a bucket only if it has no objects.
   */
  async deleteBucket(name: string): Promise<void> {
    const exists = await this.storage.bucketExistsOnDisk(name);
    if (!exists) throw new NotFoundException('Bucket not found');
    const empty = await this.storage.isBucketEmpty(name);
    if (!empty) throw new BadRequestException('Bucket not empty');
    await this.storage.deleteBucket(name);
  }

  /**
   * Lists folders (common prefixes) and files under prefix.
   */
  async browse(
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ): Promise<{
    prefixes: string[];
    objects: { key: string; size: number; lastModified: string }[];
    isTruncated: boolean;
    nextContinuationToken?: string;
  }> {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    const p = (prefix ?? '').replace(/^\/+/, '');
    const norm = p && !p.endsWith('/') ? p + '/' : p;
    const { objects, commonPrefixes, isTruncated, nextContinuationToken } =
      await this.storage.listObjects(bucket, {
        prefix: norm,
        delimiter: '/',
        maxKeys: 500,
        startAfter: continuationToken || undefined,
      });
    return {
      prefixes: commonPrefixes,
      objects: objects.map((o) => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified.toISOString(),
      })),
      isTruncated,
      nextContinuationToken,
    };
  }

  /**
   * Creates an empty folder (mkdir under bucket).
   */
  async createFolder(bucket: string, path: string): Promise<void> {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) throw new BadRequestException('path required');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((s) => s === '..' || s === '.')) {
      throw new BadRequestException('path must not contain . or .. segments');
    }
    await this.storage.mkdirPrefix(bucket, normalized);
  }

  /**
   * Deletes an empty folder (no files, no subfolders).
   */
  async deleteFolder(bucket: string, folderPath: string): Promise<void> {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) throw new BadRequestException('path required');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((s) => s === '..' || s === '.')) {
      throw new BadRequestException('invalid path');
    }
    try {
      await this.storage.deleteFolder(bucket, normalized);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'Folder not found') throw new NotFoundException(msg);
      if (msg === 'Not a folder' || msg === 'Folder not empty') {
        throw new BadRequestException(msg);
      }
      throw new BadRequestException(msg || 'Delete folder failed');
    }
  }

  /**
   * Uploads one object (admin UI).
   */
  async putObject(bucket: string, key: string, body: Buffer): Promise<void> {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    const k = key.replace(/^\/+/, '');
    if (!k) throw new BadRequestException('key required');
    await this.storage.putObject(bucket, k, body);
  }

  /**
   * Opens object for download stream (admin).
   */
  async openObjectStream(bucket: string, key: string) {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    const k = key.replace(/^\/+/, '');
    if (!k) throw new BadRequestException('key required');
    try {
      return await this.storage.getObjectStream(bucket, k);
    } catch {
      throw new NotFoundException('Object not found');
    }
  }

  /**
   * Deletes one object key.
   */
  async deleteObjectKey(bucket: string, key: string): Promise<void> {
    const ok = await this.storage.bucketExistsOnDisk(bucket);
    if (!ok) throw new NotFoundException('Bucket not found');
    await this.storage.deleteObject(bucket, key.replace(/^\/+/, ''));
  }
}
