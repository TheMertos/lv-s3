import type { IamAction } from './iam-policy.types';

/** Concrete IAM action plus bucket/key derived from an S3 HTTP request. */
export type MappedIamRequest = {
  action: Exclude<IamAction, 's3:*'>;
  bucket: string;
  key?: string;
};

/**
 * Maps path-style S3 request to IAM action + bucket/key.
 * Returns null when no IAM check applies (e.g. ListBuckets at GET / — filter later).
 *
 * CreateBucket (PUT /bucket) → s3:PutObject on bucket ARN (no key).
 * DeleteBucket (DELETE /bucket) → s3:DeleteObject on bucket ARN (no key).
 *
 * @param input.method - HTTP method
 * @param input.bucket - Bucket segment when present
 * @param input.key - Object key when present
 * @param input.query - Express-style query map
 * @returns Mapped action/resource or null to skip middleware IAM
 */
export function mapS3RequestToIam(input: {
  method: string;
  bucket?: string;
  key?: string;
  query: Record<string, unknown>;
}): MappedIamRequest | null {
  const method = input.method.toUpperCase();
  const bucket = input.bucket?.trim();
  if (!bucket) {
    return null;
  }

  const key =
    input.key !== undefined && input.key.length > 0 ? input.key : undefined;
  const query = input.query;
  const hasUploads = Object.prototype.hasOwnProperty.call(query, 'uploads');
  const hasUploadId = Object.prototype.hasOwnProperty.call(query, 'uploadId');

  if (hasUploads || hasUploadId) {
    if (method === 'DELETE' && hasUploadId) {
      return { action: 's3:DeleteObject', bucket, key };
    }
    return { action: 's3:PutObject', bucket, key };
  }

  if (!key) {
    if (method === 'PUT') {
      // CreateBucket → PutObject on arn:lv-s3:::bucket
      return { action: 's3:PutObject', bucket };
    }
    if (method === 'DELETE') {
      // DeleteBucket → DeleteObject on arn:lv-s3:::bucket
      return { action: 's3:DeleteObject', bucket };
    }
    if (method === 'GET' && isListType2(query)) {
      return { action: 's3:ListBucket', bucket };
    }
    if (method === 'HEAD') {
      return { action: 's3:ListBucket', bucket };
    }
    return null;
  }

  if (method === 'GET' || method === 'HEAD') {
    return { action: 's3:GetObject', bucket, key };
  }
  if (method === 'PUT' || method === 'POST') {
    return { action: 's3:PutObject', bucket, key };
  }
  if (method === 'DELETE') {
    return { action: 's3:DeleteObject', bucket, key };
  }

  return null;
}

/**
 * True when query indicates ListObjectsV2 (`list-type=2`).
 * @param query - Request query map
 */
function isListType2(query: Record<string, unknown>): boolean {
  const raw = query['list-type'];
  return raw === '2' || raw === 2;
}
