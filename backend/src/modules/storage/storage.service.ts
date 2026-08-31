import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniqueSiblingTempPath } from '../../common/atomic-file';
import {
  AT_REST_MAGIC,
  deriveAtRestKeys,
  isSealedBlobPrefix,
  logicalSizeFromSealedPrefix,
  openVerifiedPlaintextReadStream,
  sealPlaintextFileToSealedFile,
} from '../../common/object-at-rest';
import { md5HexOfFile } from '../../common/file-md5';
import { streamToFile } from '../../common/stream-to-file';
import { STREAM_UPLOAD_VALIDATION } from '../../common/upload-validation';
import { MalwareGate } from '../malware/malware-gate.service';
import { walkBucketObjects } from './list-objects.util';

/** Hidden config per bucket (not exposed as S3 object). */
export const BUCKET_META_FILENAME = '.lv-s3-bucket.json';

export type BucketLifecycleRule = {
  id: string;
  enabled: boolean;
  prefix?: string;
  expirationDays?: number;
  abortMultipartAfterDays?: number;
};

type BucketMeta = {
  publicRead: boolean;
  lifecycleRules?: BucketLifecycleRule[];
  /** When true, object bytes on disk are sealed; immutable after create. */
  encryptAtRest?: boolean;
};

/**
 * Filesystem layout: STORAGE_ROOT / bucket / key (key may contain subdirs).
 * Bucket policy: BUCKET_META_FILENAME in bucket root { "publicRead": boolean }.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private static readonly BUCKET_NAME_RE =
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$|^[a-z0-9]$/i;

  constructor(
    private readonly config: ConfigService,
    private readonly malwareGate: MalwareGate,
  ) {}

  private async readBucketMeta(bucket: string): Promise<BucketMeta> {
    const p = path.join(this.bucketPath(bucket), BUCKET_META_FILENAME);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const j = JSON.parse(raw) as Partial<BucketMeta>;
      return {
        publicRead: j.publicRead === true,
        lifecycleRules: Array.isArray(j.lifecycleRules) ? j.lifecycleRules : [],
        encryptAtRest: j.encryptAtRest === true,
      };
    } catch {
      return { publicRead: false, lifecycleRules: [] };
    }
  }

  private async writeBucketMeta(
    bucket: string,
    meta: BucketMeta,
  ): Promise<void> {
    const dir = this.bucketPath(bucket);
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, BUCKET_META_FILENAME);
    await fs.writeFile(
      p,
      JSON.stringify(
        {
          publicRead: meta.publicRead === true,
          lifecycleRules: meta.lifecycleRules ?? [],
          ...(meta.encryptAtRest === true ? { encryptAtRest: true } : {}),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }

  getRoot(): string {
    return path.resolve(
      this.config.get<string>('STORAGE_ROOT', './data/storage'),
    );
  }

  resolveSafe(bucket: string, key: string = ''): string {
    const root = this.getRoot();
    if (!StorageService.BUCKET_NAME_RE.test(bucket)) {
      throw new Error('Invalid bucket name');
    }
    const safeKey = key
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean)
      .join(path.sep);
    const keyS3 = safeKey.split(path.sep).join('/');
    if (keyS3 === BUCKET_META_FILENAME || keyS3.startsWith('.lv-s3/')) {
      throw new Error('Reserved key');
    }
    const full = path.normalize(path.join(root, bucket, safeKey));
    const rootNorm = path.normalize(root + path.sep);
    if (
      !full.startsWith(rootNorm) &&
      full !== path.normalize(path.join(root, bucket))
    ) {
      throw new Error('Path escapes storage root');
    }
    return full;
  }

  bucketPath(bucket: string): string {
    return this.resolveSafe(bucket, '');
  }

  async listBuckets(): Promise<{ name: string; creationDate: Date }[]> {
    const root = this.getRoot();
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    const out: { name: string; creationDate: Date }[] = [];
    for (const e of entries) {
      if (e.isDirectory() && StorageService.BUCKET_NAME_RE.test(e.name)) {
        const stat = await fs.stat(path.join(root, e.name));
        out.push({ name: e.name, creationDate: stat.birthtime });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Creates bucket directory and metadata. encryptAtRest is only allowed for new private buckets.
   */
  async createBucket(
    name: string,
    opts?: { encryptAtRest?: boolean },
  ): Promise<void> {
    await fs.mkdir(this.bucketPath(name), { recursive: true });
    await this.writeBucketMeta(name, {
      publicRead: false,
      lifecycleRules: [],
      ...(opts?.encryptAtRest === true ? { encryptAtRest: true } : {}),
    });
  }

  /**
   * Reads public-read and encrypt-at-rest flags from bucket metadata (single disk read).
   */
  async getBucketVisibility(bucket: string): Promise<{
    publicRead: boolean;
    encryptAtRest: boolean;
  }> {
    const meta = await this.readBucketMeta(bucket);
    return {
      publicRead: meta.publicRead === true,
      encryptAtRest: meta.encryptAtRest === true,
    };
  }

  /**
   * @returns true if object bytes are stored sealed on disk for this bucket.
   */
  async isBucketEncryptAtRest(bucket: string): Promise<boolean> {
    return (await this.getBucketVisibility(bucket)).encryptAtRest;
  }

  /**
   * @returns true if anonymous GET/HEAD/ListObjects allowed for this bucket.
   */
  async isBucketPublicRead(bucket: string): Promise<boolean> {
    return (await this.getBucketVisibility(bucket)).publicRead;
  }

  /**
   * Persists public/private read policy (writes still require SigV4).
   */
  async setBucketPublicRead(
    bucket: string,
    publicRead: boolean,
  ): Promise<void> {
    const meta = await this.readBucketMeta(bucket);
    meta.publicRead = publicRead;
    await this.writeBucketMeta(bucket, meta);
  }

  /**
   * Returns lifecycle configuration for one bucket.
   */
  async getBucketLifecycleRules(
    bucket: string,
  ): Promise<BucketLifecycleRule[]> {
    const meta = await this.readBucketMeta(bucket);
    return meta.lifecycleRules ?? [];
  }

  /**
   * Replaces lifecycle rules for one bucket.
   */
  async setBucketLifecycleRules(
    bucket: string,
    rules: BucketLifecycleRule[],
  ): Promise<void> {
    const meta = await this.readBucketMeta(bucket);
    meta.lifecycleRules = rules;
    await this.writeBucketMeta(bucket, meta);
  }

  /** @returns whether bucket directory exists */
  async bucketExistsOnDisk(bucket: string): Promise<boolean> {
    try {
      const st = await fs.stat(this.bucketPath(bucket));
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Returns true when bucket has no objects (files).
   * Matches Object Browser: empty folders do not block deletion.
   */
  async isBucketEmpty(name: string): Promise<boolean> {
    const { objects } = await this.listObjects(name, { maxKeys: 1 });
    return objects.length === 0;
  }

  /**
   * Deletes bucket directory including internal metadata files.
   */
  async deleteBucket(name: string): Promise<void> {
    await fs.rm(this.bucketPath(name), { recursive: true, force: true });
  }

  /**
   * Recursive file list under bucket with S3-style prefix and delimiter.
   */
  /**
   * Logical object size + mtime for listings (plaintext length when sealed on disk).
   */
  private async storedObjectListEntry(
    fullPath: string,
    encryptAtRest: boolean,
  ): Promise<{ size: number; mtime: Date; etag: string }> {
    const etag = await md5HexOfFile(fullPath);
    const st = await fs.stat(fullPath);
    if (!encryptAtRest) return { size: st.size, mtime: st.mtime, etag };
    if (st.size < 13) return { size: st.size, mtime: st.mtime, etag };
    const fh = await fs.open(fullPath, 'r');
    const prefix = Buffer.alloc(13);
    try {
      await fh.read(prefix, 0, 13, 0);
    } finally {
      await fh.close();
    }
    if (isSealedBlobPrefix(prefix)) {
      return {
        size: logicalSizeFromSealedPrefix(prefix),
        mtime: st.mtime,
        etag,
      };
    }
    return { size: st.size, mtime: st.mtime, etag };
  }

  async listObjects(
    bucket: string,
    opts: {
      prefix?: string;
      delimiter?: string;
      maxKeys?: number;
      startAfter?: string;
    },
  ): Promise<{
    objects: { key: string; size: number; lastModified: Date; etag: string }[];
    commonPrefixes: string[];
    isTruncated: boolean;
    nextContinuationToken?: string;
  }> {
    const encryptAtRest =
      (await this.readBucketMeta(bucket)).encryptAtRest === true;
    const base = this.bucketPath(bucket);
    return walkBucketObjects(
      base,
      { ...opts, bucketMetaFilename: BUCKET_META_FILENAME },
      (fullPath) => this.storedObjectListEntry(fullPath, encryptAtRest),
    );
  }

  /**
   * Writes a buffered object to a plaintext temp, then scans and publishes.
   * @param bucket - Destination bucket name.
   * @param key - Destination object key.
   * @param body - Complete plaintext object bytes.
   * @returns Promise resolved after malware gate and atomic publication.
   */
  async putObject(bucket: string, key: string, body: Buffer): Promise<void> {
    const full = this.resolveSafe(bucket, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const temporaryPath = uniqueSiblingTempPath(full, 'buffer');
    try {
      await fs.writeFile(temporaryPath, body);
      await this.publishPlaintextTemp(bucket, key, temporaryPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Streams an object to disk while enforcing a plaintext byte limit.
   * @param bucket - Destination bucket name.
   * @param key - Destination object key.
   * @param source - Readable plaintext object stream.
   * @param maxBytes - Maximum accepted plaintext size in bytes.
   * @returns The number of plaintext bytes stored.
   */
  async putObjectFromStream(
    bucket: string,
    key: string,
    source: NodeJS.ReadableStream,
    maxBytes: number,
  ): Promise<{ size: number }> {
    const full = this.resolveSafe(bucket, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const plainTempPath = uniqueSiblingTempPath(full, 'plain');
    try {
      const { bytesWritten } = await streamToFile(
        source,
        plainTempPath,
        maxBytes,
        STREAM_UPLOAD_VALIDATION,
      );
      await this.publishPlaintextTemp(bucket, key, plainTempPath);
      return { size: bytesWritten };
    } catch (error) {
      await fs.unlink(plainTempPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Scans plaintext temp then seals or renames into the final object path.
   * Used by putObject, putObjectFromStream, and CompleteMultipart.
   * @param bucket - Destination bucket name.
   * @param key - Destination object key.
   * @param plainTempPath - Absolute path to assembled plaintext temp file.
   * @returns Promise resolved after malware gate and atomic publish.
   */
  async publishPlaintextTemp(
    bucket: string,
    key: string,
    plainTempPath: string,
  ): Promise<void> {
    await this.malwareGate.assertClean(plainTempPath, { bucket, key });
    const seal = (await this.readBucketMeta(bucket)).encryptAtRest === true;
    if (seal) {
      await this.sealPlaintextTempAsObject(bucket, key, plainTempPath);
      return;
    }
    const full = this.resolveSafe(bucket, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.rename(plainTempPath, full);
  }

  /**
   * Seals and atomically publishes a plaintext temporary file.
   * @param bucket - Destination bucket name.
   * @param key - Destination object key.
   * @param plainTempPath - Unique plaintext temporary file to seal.
   * @returns Promise resolved after publication and temporary-file cleanup.
   */
  async sealPlaintextTempAsObject(
    bucket: string,
    key: string,
    plainTempPath: string,
  ): Promise<void> {
    const full = this.resolveSafe(bucket, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const master = this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY');
    const { encKey, macKey } = deriveAtRestKeys(master, bucket);
    const sealedTempPath = uniqueSiblingTempPath(full, 'sealed');
    try {
      await sealPlaintextFileToSealedFile(
        plainTempPath,
        sealedTempPath,
        encKey,
        macKey,
      );
      await fs.rename(sealedTempPath, full);
    } finally {
      await Promise.all([
        fs.unlink(sealedTempPath).catch(() => {}),
        fs.unlink(plainTempPath).catch(() => {}),
      ]);
    }
  }

  async getObjectStream(
    bucket: string,
    key: string,
  ): Promise<{ stream: Readable; size: number; mtime: Date }> {
    const full = this.resolveSafe(bucket, key);
    const st = await fs.stat(full);
    if (!st.isFile()) throw new Error('Not a file');
    const encryptAtRest =
      (await this.readBucketMeta(bucket)).encryptAtRest === true;
    if (encryptAtRest) {
      const magicPeek = Buffer.alloc(4);
      const fh = await fs.open(full, 'r');
      try {
        await fh.read(magicPeek, 0, 4, 0);
      } finally {
        await fh.close();
      }
      if (!magicPeek.equals(AT_REST_MAGIC)) {
        throw new Error('Encrypted bucket object is not sealed');
      }
      const master = this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY');
      const { encKey, macKey } = deriveAtRestKeys(master, bucket);
      return openVerifiedPlaintextReadStream(full, encKey, macKey);
    }
    return {
      stream: fsSync.createReadStream(full),
      size: st.size,
      mtime: st.mtime,
    };
  }

  async headObject(
    bucket: string,
    key: string,
  ): Promise<{ size: number; mtime: Date }> {
    const full = this.resolveSafe(bucket, key);
    const st = await fs.stat(full);
    if (!st.isFile()) throw new Error('Not a file');
    const encryptAtRest =
      (await this.readBucketMeta(bucket)).encryptAtRest === true;
    if (encryptAtRest) {
      if (st.size < 13) throw new Error('Invalid sealed object');
      const fh = await fs.open(full, 'r');
      const prefix = Buffer.alloc(13);
      try {
        await fh.read(prefix, 0, 13, 0);
      } finally {
        await fh.close();
      }
      if (!isSealedBlobPrefix(prefix)) throw new Error('Invalid sealed object');
      return { size: logicalSizeFromSealedPrefix(prefix), mtime: st.mtime };
    }
    return { size: st.size, mtime: st.mtime };
  }

  /**
   * Returns true if directory has no user-visible content (ignores .DS_Store, Thumbs.db, etc.).
   */
  private isDirEmptyForCleanup(dir: string, entries: string[]): boolean {
    const ignore = new Set([BUCKET_META_FILENAME, '.DS_Store', 'Thumbs.db']);
    return entries.every((e) => e.startsWith('.lv-s3') || ignore.has(e));
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const full = this.resolveSafe(bucket, key);
    await fs.unlink(full).catch(() => {});
    const bucketRoot = path.normalize(this.bucketPath(bucket) + path.sep);
    let cur = path.dirname(full);
    while (true) {
      const curNorm = path.normalize(cur) + path.sep;
      if (curNorm === bucketRoot || !curNorm.startsWith(bucketRoot)) break;
      try {
        const entries = await fs.readdir(cur);
        if (!this.isDirEmptyForCleanup(cur, entries)) break;
        await fs.rmdir(cur);
        cur = path.dirname(cur);
      } catch {
        break;
      }
    }
  }

  /**
   * Removes an empty folder (only optional .DS_Store / Thumbs.db / .lv-s3* inside).
   */
  async deleteFolder(bucket: string, folderPath: string): Promise<void> {
    const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) throw new Error('path required');
    this.resolveSafe(bucket, normalized + '/x');
    const full = path.join(this.bucketPath(bucket), ...normalized.split('/'));
    const rootNorm = path.normalize(this.bucketPath(bucket) + path.sep);
    if (
      !full.startsWith(rootNorm) ||
      full === path.normalize(this.bucketPath(bucket))
    ) {
      throw new Error('Path escapes storage root');
    }
    let st: import('fs').Stats;
    try {
      st = await fs.stat(full);
    } catch {
      throw new Error('Folder not found');
    }
    if (!st.isDirectory()) throw new Error('Not a folder');
    const entries = await fs.readdir(full, { withFileTypes: true });
    const ignore = new Set(['.DS_Store', 'Thumbs.db', BUCKET_META_FILENAME]);
    for (const e of entries) {
      if (e.name.startsWith('.lv-s3') || ignore.has(e.name)) {
        await fs.unlink(path.join(full, e.name)).catch(() => {});
        continue;
      }
      if (e.isDirectory()) throw new Error('Folder not empty');
      throw new Error('Folder not empty');
    }
    await fs.rmdir(full);
  }

  /**
   * Creates a directory prefix under the bucket (filesystem folders).
   */
  async mkdirPrefix(bucket: string, prefix: string): Promise<void> {
    const normalized = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) return;
    this.resolveSafe(bucket, normalized + '/x');
    const full = path.join(this.bucketPath(bucket), ...normalized.split('/'));
    const rootNorm = path.normalize(this.bucketPath(bucket) + path.sep);
    if (
      !full.startsWith(rootNorm) &&
      full !== path.normalize(this.bucketPath(bucket))
    ) {
      throw new Error('Path escapes storage root');
    }
    await fs.mkdir(full, { recursive: true });
  }
}
