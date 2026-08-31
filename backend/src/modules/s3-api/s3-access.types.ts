import type { Request } from 'express';

/** Resolved S3 principal metadata after SigV4 verification. */
export type S3AccessMeta = {
  isAdmin: boolean;
  /** null = all buckets; [] = none; non-empty = allow-list only */
  allowedBuckets: string[] | null;
  /** Service account id when principal is an SA; null for admin/root */
  serviceAccountId: number | null;
};

/** Express request augmented with verified S3 identity. */
export type S3AuthedRequest = Request & {
  s3AccessKey?: string;
  s3AccessMeta?: S3AccessMeta;
};

/**
 * Filters bucket listings for service accounts with an allow-list.
 * @param buckets - Full bucket list from storage
 * @param meta - Resolved principal metadata
 * @returns Buckets visible under allowedBuckets (IAM ListBucket filter applied separately)
 */
export function filterBucketsForPrincipal<T extends { name: string }>(
  buckets: T[],
  meta?: S3AccessMeta,
): T[] {
  if (!meta || meta.isAdmin || meta.allowedBuckets === null) return buckets;
  if (meta.allowedBuckets.length === 0) return [];
  const allowed = new Set(meta.allowedBuckets);
  return buckets.filter((b) => allowed.has(b.name));
}

/**
 * Returns whether a bucket name is permitted for the given principal.
 * @param bucket - Bucket name
 * @param meta - Resolved principal metadata
 */
export function isBucketAllowedForMeta(
  bucket: string,
  meta: S3AccessMeta,
): boolean {
  if (meta.isAdmin) return true;
  if (meta.allowedBuckets === null) return true;
  if (meta.allowedBuckets.length === 0) return false;
  return meta.allowedBuckets.includes(bucket);
}
