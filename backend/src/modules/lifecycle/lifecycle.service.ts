import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StorageService,
  BucketLifecycleRule,
} from '../storage/storage.service';
import { MultipartService } from '../multipart/multipart.service';

@Injectable()
export class LifecycleService {
  constructor(
    private readonly storage: StorageService,
    private readonly multipart: MultipartService,
  ) {}

  /**
   * Returns lifecycle rules for one bucket.
   */
  async getRules(bucket: string): Promise<BucketLifecycleRule[]> {
    const exists = await this.storage.bucketExistsOnDisk(bucket);
    if (!exists) throw new NotFoundException('Bucket not found');
    return this.storage.getBucketLifecycleRules(bucket);
  }

  /**
   * Replaces lifecycle rules for one bucket.
   */
  async putRules(bucket: string, rules: BucketLifecycleRule[]): Promise<void> {
    const exists = await this.storage.bucketExistsOnDisk(bucket);
    if (!exists) throw new NotFoundException('Bucket not found');
    this.validateRules(rules);
    await this.storage.setBucketLifecycleRules(bucket, rules);
  }

  /**
   * Deletes all lifecycle rules for one bucket.
   */
  async deleteRules(bucket: string): Promise<void> {
    const exists = await this.storage.bucketExistsOnDisk(bucket);
    if (!exists) throw new NotFoundException('Bucket not found');
    await this.storage.setBucketLifecycleRules(bucket, []);
  }

  /**
   * Executes expiration against all buckets once.
   */
  async runExpirationOnce(now: Date = new Date()): Promise<void> {
    const buckets = await this.storage.listBuckets();
    for (const b of buckets) {
      const rules = (await this.storage.getBucketLifecycleRules(b.name)).filter(
        (r) => r.enabled,
      );
      if (!rules.length) continue;
      let startAfter = '';
      for (;;) {
        const page = await this.storage.listObjects(b.name, {
          maxKeys: 1000,
          startAfter: startAfter || undefined,
        });
        for (const obj of page.objects) {
          if (this.shouldExpire(obj.key, obj.lastModified, rules, now)) {
            await this.storage.deleteObject(b.name, obj.key);
          }
        }
        if (!page.isTruncated || !page.nextContinuationToken) break;
        startAfter = page.nextContinuationToken;
      }
      await this.abortStaleMultipart(b.name, rules, now);
    }
  }

  /**
   * Validates lifecycle rule payload.
   */
  private validateRules(rules: BucketLifecycleRule[]): void {
    const ids = new Set<string>();
    for (const r of rules) {
      if (ids.has(r.id))
        throw new BadRequestException(`Duplicate lifecycle rule id: ${r.id}`);
      ids.add(r.id);
      if (!r.expirationDays && !r.abortMultipartAfterDays) {
        throw new BadRequestException(
          `Rule ${r.id} needs expirationDays or abortMultipartAfterDays`,
        );
      }
      if (r.expirationDays && r.expirationDays < 1) {
        throw new BadRequestException(
          `Rule ${r.id} expirationDays must be >= 1`,
        );
      }
      if (r.abortMultipartAfterDays && r.abortMultipartAfterDays < 1) {
        throw new BadRequestException(
          `Rule ${r.id} abortMultipartAfterDays must be >= 1`,
        );
      }
    }
  }

  /**
   * Evaluates whether an object should be expired by any matching rule.
   */
  private shouldExpire(
    key: string,
    modifiedAt: Date,
    rules: BucketLifecycleRule[],
    now: Date,
  ): boolean {
    const ageDays =
      (now.getTime() - modifiedAt.getTime()) / (24 * 60 * 60 * 1000);
    for (const r of rules) {
      const prefixOk = !r.prefix || key.startsWith(r.prefix);
      if (!prefixOk) continue;
      if (r.expirationDays && ageDays >= r.expirationDays) return true;
    }
    return false;
  }

  /**
   * Aborts stale multipart uploads matching abort rules.
   */
  private async abortStaleMultipart(
    bucket: string,
    rules: BucketLifecycleRule[],
    now: Date,
  ): Promise<void> {
    const uploads = await this.multipart.listActiveUploads(bucket);
    for (const up of uploads) {
      const ageDays =
        (now.getTime() - up.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      for (const r of rules) {
        if (!r.abortMultipartAfterDays) continue;
        if (r.prefix && !up.objectKey.startsWith(r.prefix)) continue;
        if (ageDays >= r.abortMultipartAfterDays) {
          await this.multipart.abort(bucket, up.uploadId);
          break;
        }
      }
    }
  }
}
