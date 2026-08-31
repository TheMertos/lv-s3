import * as aws4 from 'aws4';
import { createHash } from 'crypto';
import type { Request } from 'aws4';

/**
 * Produces SigV4 headers for path-style S3 requests against this server (same rules as `SigV4Middleware`).
 */
export function signS3Request(params: {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';
  host: string;
  path: string;
  body?: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  contentType?: string;
}): Record<string, string> {
  const region = params.region ?? 'us-east-1';
  const body = params.body ?? Buffer.alloc(0);
  /** Must match `SigV4Middleware` default when this header is sent (SHA256 of empty body). */
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const headers: Record<string, string> = {
    'X-Amz-Content-Sha256': payloadHash,
  };
  if (
    (params.method === 'PUT' || params.method === 'POST') &&
    body.length > 0
  ) {
    headers['Content-Type'] = params.contentType ?? 'application/octet-stream';
  }
  const req: Request = {
    method: params.method,
    host: params.host,
    path: params.path,
    headers,
    body,
    service: 's3',
    region,
  };
  aws4.sign(req, {
    accessKeyId: params.accessKeyId,
    secretAccessKey: params.secretAccessKey,
  });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return out;
}
