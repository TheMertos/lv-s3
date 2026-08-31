import * as crypto from 'crypto';
import { createHash, createHmac } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { AdminUserEntity } from '../../entities/admin-user.entity';
import { ConfigService } from '@nestjs/config';
import { decryptSecret } from '../../common/crypto-secret';
import {
  presignMaxExpiresSec,
  s3Sigv4MaxSkewSec,
} from '../../config/validate-env';
import { IamPolicyService } from '../iam/iam-policy.service';
import { mapS3RequestToIam } from '../iam/iam-s3-action';
import { StorageService } from '../storage/storage.service';
import {
  type S3AccessMeta,
  type S3AuthedRequest,
  isBucketAllowedForMeta,
} from './s3-access.types';

/**
 * Verifies AWS SigV4. Public buckets: anonymous GET/HEAD on objects only (no ListObjects without signature).
 */
@Injectable()
export class SigV4Middleware implements NestMiddleware {
  private readonly logger = new Logger(SigV4Middleware.name);

  constructor(
    @InjectRepository(ServiceAccountEntity)
    private readonly accounts: Repository<ServiceAccountEntity>,
    @InjectRepository(AdminUserEntity)
    private readonly admins: Repository<AdminUserEntity>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly iam: IamPolicyService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname.replace(/^\//, '');
    const segments = pathname.split('/').filter(Boolean);
    const method = req.method;

    const auth = req.headers.authorization || '';
    const hasSig = auth.startsWith('AWS4-HMAC-SHA256');

    if (segments.length === 0) {
      if (!hasSig)
        return xmlError(
          res,
          403,
          'AccessDenied',
          'Missing or invalid authorization',
        );
      return this.verify(req, res, next, null);
    }

    const bucket = segments[0];
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      /** Presigned PUT/POST/DELETE (query SigV4) — browsers/SDKs use this; there is no `Authorization` header. */
      if (isPresignedUrlQuery(url)) {
        const ok = await this.verifyPresigned(req, res, bucket);
        if (ok) return next();
        return;
      }
      if (!hasSig)
        return xmlError(
          res,
          403,
          'AccessDenied',
          'Missing or invalid authorization',
        );
      return this.verify(req, res, next, bucket);
    }

    const isPublicObjectRead =
      (method === 'GET' || method === 'HEAD') && segments.length >= 2;

    if (isPublicObjectRead) {
      const exists = await this.storage.bucketExistsOnDisk(bucket);
      if (exists && (await this.storage.isBucketPublicRead(bucket))) {
        return next();
      }
    }

    /** Presigned GET/HEAD object (X-Amz-* query params) — same model as Amazon S3 */
    if (isPublicObjectRead && isPresignedUrlQuery(url)) {
      const ok = await this.verifyPresigned(req, res, bucket);
      if (ok) return next();
      return;
    }

    /** Presigned HeadBucket: `HEAD /{bucket}` (no object key) — SDKs use query auth, not `Authorization`. */
    if (
      method === 'HEAD' &&
      segments.length === 1 &&
      isPresignedUrlQuery(url)
    ) {
      const ok = await this.verifyPresigned(req, res, bucket);
      if (ok) return next();
      return;
    }

    if (!hasSig) {
      return xmlError(
        res,
        403,
        'AccessDenied',
        'Missing or invalid authorization',
      );
    }
    return this.verify(req, res, next, bucket ?? null);
  }

  /**
   * Verifies SigV4 presigned URL (query authentication). Returns true if valid, else sends XML error.
   */
  private async verifyPresigned(
    req: Request,
    res: Response,
    bucket: string | null,
  ): Promise<boolean> {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const credential = url.searchParams.get('X-Amz-Credential') || '';
    const amzDate = url.searchParams.get('X-Amz-Date') || '';
    const expiresSec = parseInt(
      url.searchParams.get('X-Amz-Expires') || '0',
      10,
    );
    const signedHeadersParam =
      url.searchParams.get('X-Amz-SignedHeaders') || '';
    const signature = url.searchParams.get('X-Amz-Signature') || '';
    const parts = credential.split('/');
    if (parts.length < 5) {
      xmlError(res, 403, 'AccessDenied', 'Invalid presigned URL');
      return false;
    }
    const accessKey = parts[0]!;
    const dateStamp = parts[1]!;
    const region = parts[2]!;
    if (parts[3] !== 's3') {
      xmlError(res, 403, 'AccessDenied', 'Invalid credential scope');
      return false;
    }
    if (!amzDate || !signedHeadersParam || !signature || expiresSec < 1) {
      xmlError(res, 403, 'AccessDenied', 'Invalid presigned URL');
      return false;
    }
    const maxExpires = presignMaxExpiresSec();
    if (expiresSec > maxExpires) {
      xmlError(
        res,
        403,
        'AccessDenied',
        'Presigned URL expiry exceeds maximum',
      );
      return false;
    }
    const requestMs = parseAmzDate(amzDate);
    if (requestMs === null) {
      xmlError(res, 403, 'AccessDenied', 'Invalid X-Amz-Date');
      return false;
    }
    const maxSkewMs = s3Sigv4MaxSkewSec() * 1000;
    if (Math.abs(Date.now() - requestMs) > maxSkewMs) {
      xmlError(
        res,
        403,
        'RequestTimeTooSkewed',
        'The difference between the request time and the server time is too large',
      );
      return false;
    }
    if (Date.now() > requestMs + expiresSec * 1000) {
      xmlError(res, 403, 'AccessDenied', 'Request has expired');
      return false;
    }
    const secret = await this.resolveSecret(accessKey);
    if (!secret) {
      xmlError(res, 403, 'InvalidAccessKeyId', 'Unknown access key');
      return false;
    }
    const method = req.method;
    const canonicalUri = canonicalUriS3(url.pathname);
    const canonicalQuery = canonicalQueryStringPresign(url.searchParams);
    const signedHeadersList = signedHeadersParam
      .split(';')
      .map((h) => h.toLowerCase().trim());
    let canonicalHeaders = '';
    for (const h of [...signedHeadersList].sort()) {
      const v = req.headers[h];
      const val = Array.isArray(v) ? v.join(',') : String(v ?? '');
      canonicalHeaders += `${h}:${val.trim().replace(/\s+/g, ' ')}\n`;
    }
    const signedHeadersStr = [...signedHeadersList].sort().join(';');
    /** S3 presigned URLs (SDK) use X-Amz-Content-Sha256=UNSIGNED-PAYLOAD in query → canonical request line 6 */
    const payloadHash =
      url.searchParams.get('X-Amz-Content-Sha256') === 'UNSIGNED-PAYLOAD'
        ? 'UNSIGNED-PAYLOAD'
        : (req.headers['x-amz-content-sha256'] as string) ||
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeadersStr,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      hashHex(canonicalRequest),
    ].join('\n');
    const kDate = hmac(`AWS4${secret}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const expectedSig = hmacHex(kSigning, stringToSign);
    if (!timingSafeEqual(signature, expectedSig)) {
      this.logger.warn('Presigned signature mismatch');
      xmlError(
        res,
        403,
        'SignatureDoesNotMatch',
        'The request signature does not match',
      );
      return false;
    }
    const meta = await this.resolveAccessMeta(accessKey);
    if (!meta) {
      xmlError(res, 403, 'InvalidAccessKeyId', 'Unknown access key');
      return false;
    }
    (req as S3AuthedRequest).s3AccessKey = accessKey;
    (req as S3AuthedRequest).s3AccessMeta = meta;
    if (bucket && !isBucketAllowedForMeta(bucket, meta)) {
      xmlError(res, 403, 'AccessDenied', 'Bucket access not allowed');
      return false;
    }
    if (!(await this.enforceIamPolicy(req, res, meta, bucket))) {
      return false;
    }
    return true;
  }

  private async verify(
    req: Request,
    res: Response,
    next: NextFunction,
    bucket: string | null,
  ) {
    const auth = req.headers.authorization!;
    const credentialMatch = auth.match(/Credential=([^,\s]+)/);
    const signedHeadersMatch = auth.match(/SignedHeaders=([^,\s]+)/);
    const signatureMatch = auth.match(/Signature=([a-f0-9]+)/i);
    if (!credentialMatch || !signedHeadersMatch || !signatureMatch) {
      return xmlError(res, 403, 'AccessDenied', 'Malformed authorization');
    }
    const credential = credentialMatch[1];
    const parts = credential.split('/');
    const accessKey = parts[0];
    const date = parts[1];
    const region = parts[2];
    const service = parts[3];
    if (service !== 's3') {
      return xmlError(res, 403, 'AccessDenied', 'Invalid credential scope');
    }
    const signedHeadersList = signedHeadersMatch[1]
      .split(';')
      .map((h) => h.toLowerCase().trim());
    const amzDate = (req.headers['x-amz-date'] as string) || '';
    if (!amzDate) {
      return xmlError(res, 403, 'AccessDenied', 'Missing x-amz-date');
    }
    const requestMs = parseAmzDate(amzDate);
    if (requestMs === null) {
      return xmlError(res, 403, 'AccessDenied', 'Invalid x-amz-date');
    }
    const maxSkewMs = s3Sigv4MaxSkewSec() * 1000;
    if (Math.abs(Date.now() - requestMs) > maxSkewMs) {
      return xmlError(
        res,
        403,
        'RequestTimeTooSkewed',
        'The difference between the request time and the server time is too large',
      );
    }

    const secret = await this.resolveSecret(accessKey);
    if (!secret) {
      return xmlError(res, 403, 'InvalidAccessKeyId', 'Unknown access key');
    }

    const method = req.method;
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const canonicalUri = canonicalUriS3(url.pathname);
    const canonicalQuery = canonicalQueryString(url.searchParams);
    let canonicalHeaders = '';
    for (const h of [...signedHeadersList].sort()) {
      const v = req.headers[h];
      const val = Array.isArray(v) ? v.join(',') : String(v ?? '');
      canonicalHeaders += `${h}:${val.trim().replace(/\s+/g, ' ')}\n`;
    }
    const signedHeadersStr = [...signedHeadersList].sort().join(';');
    const payloadHash =
      (req.headers['x-amz-content-sha256'] as string) ||
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeadersStr,
      payloadHash,
    ].join('\n');

    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      hashHex(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${secret}`, date);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const expectedSig = hmacHex(kSigning, stringToSign);

    if (!timingSafeEqual(signatureMatch[1], expectedSig)) {
      this.logger.warn('Signature mismatch');
      return xmlError(
        res,
        403,
        'SignatureDoesNotMatch',
        'The request signature does not match',
      );
    }
    const meta = await this.resolveAccessMeta(accessKey);
    if (!meta) {
      return xmlError(res, 403, 'InvalidAccessKeyId', 'Unknown access key');
    }
    (req as S3AuthedRequest).s3AccessKey = accessKey;
    (req as S3AuthedRequest).s3AccessMeta = meta;
    if (bucket && !isBucketAllowedForMeta(bucket, meta)) {
      return xmlError(res, 403, 'AccessDenied', 'Bucket access not allowed');
    }
    if (!(await this.enforceIamPolicy(req, res, meta, bucket))) {
      return;
    }
    next();
  }

  /**
   * Enforces attached IAM policies for service-account principals after bucket allow-list.
   * @param req - Incoming request (method/path/query)
   * @param res - Response used for XML AccessDenied
   * @param meta - Resolved access metadata
   * @param bucket - Path bucket or null for ListBuckets
   * @returns false when denied (response already sent); true when allowed or skipped
   */
  private async enforceIamPolicy(
    req: Request,
    res: Response,
    meta: S3AccessMeta,
    bucket: string | null,
  ): Promise<boolean> {
    if (meta.isAdmin || meta.serviceAccountId == null) {
      return true;
    }

    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname.replace(/^\//, '');
    const segments = pathname.split('/').filter(Boolean);
    const pathBucket = bucket ?? segments[0];
    const key = segments.length > 1 ? segments.slice(1).join('/') : undefined;

    const mapped = mapS3RequestToIam({
      method: req.method,
      bucket: pathBucket,
      key,
      query: req.query as Record<string, unknown>,
    });
    if (!mapped) {
      return true;
    }

    const ok = await this.iam.authorize({
      serviceAccountId: meta.serviceAccountId,
      allowedBuckets: meta.allowedBuckets,
      action: mapped.action,
      bucket: mapped.bucket,
      key: mapped.key,
    });
    if (!ok) {
      xmlError(res, 403, 'AccessDenied', 'Access Denied');
      return false;
    }
    return true;
  }

  /**
   * Resolves access metadata for bucket authorization checks.
   */
  private async resolveAccessMeta(
    accessKey: string,
  ): Promise<S3AccessMeta | null> {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!isProd) {
      const rootKey = this.config.get<string>('S3_ROOT_ACCESS_KEY');
      if (rootKey && accessKey === rootKey) {
        return { isAdmin: true, allowedBuckets: null, serviceAccountId: null };
      }
    }

    const adminUser = await this.admins.findOne({
      where: { adminS3AccessKey: accessKey },
    });
    if (adminUser) {
      return { isAdmin: true, allowedBuckets: null, serviceAccountId: null };
    }

    const acc = await this.accounts.findOne({
      where: { accessKey, disabled: false },
    });
    if (!acc) return null;

    return {
      isAdmin: false,
      allowedBuckets: this.parseAllowedBuckets(acc.allowedBuckets),
      serviceAccountId: acc.id,
    };
  }

  /**
   * Parses stored JSON bucket allow-list from service account row.
   */
  private parseAllowedBuckets(raw: string | null): string[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  }

  /**
   * Resolves the SigV4 signing secret for an access key.
   * Production: DB only (admin_users.admin_s3_* + service_accounts).
   * Non-production: optional env S3_ROOT_ACCESS_KEY / S3_ROOT_SECRET_KEY for local convenience.
   */
  private async resolveSecret(accessKey: string): Promise<string | null> {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!isProd) {
      const rootKey = this.config.get<string>('S3_ROOT_ACCESS_KEY');
      const rootSecret = this.config.get<string>('S3_ROOT_SECRET_KEY');
      if (rootKey && rootSecret && accessKey === rootKey) return rootSecret;
    }

    const master = this.config.get<string>('MASTER_ENCRYPTION_KEY');
    if (!master) return null;

    const adminUser = await this.admins.findOne({
      where: { adminS3AccessKey: accessKey },
    });
    if (adminUser?.adminS3SecretEncrypted) {
      try {
        return decryptSecret(master, adminUser.adminS3SecretEncrypted);
      } catch (e) {
        this.logger.error(e);
      }
    }
    const acc = await this.accounts.findOne({
      where: { accessKey, disabled: false },
    });
    if (!acc) return null;
    try {
      return decryptSecret(master, acc.secretEncrypted);
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }
}

function hmac(key: string | Buffer, msg: string): Buffer {
  return createHmac('sha256', key).update(msg, 'utf8').digest();
}

function hmacHex(key: Buffer, msg: string): string {
  return createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

function hashHex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** S3 double-encodes except slash */
function canonicalUriS3(pathname: string): string {
  if (!pathname || pathname === '') return '/';
  return pathname
    .split('/')
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join('/');
}

function canonicalQueryString(params: URLSearchParams): string {
  const keys = [...new Set(params.keys())].sort();
  const pairs: string[] = [];
  for (const k of keys) {
    for (const v of [...params.getAll(k)].sort()) {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  return pairs.join('&');
}

/** Query string for presigning: all params except X-Amz-Signature, sorted (SigV4). */
function canonicalQueryStringPresign(params: URLSearchParams): string {
  const keys = [...new Set(params.keys())]
    .filter((k) => k !== 'X-Amz-Signature')
    .sort();
  const pairs: string[] = [];
  for (const k of keys) {
    for (const v of [...params.getAll(k)].sort()) {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  return pairs.join('&');
}

function isPresignedUrlQuery(url: URL): boolean {
  return (
    url.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256' &&
    Boolean(url.searchParams.get('X-Amz-Signature'))
  );
}

function xmlError(
  res: Response,
  status: number,
  code: string,
  message: string,
) {
  res
    .status(status)
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${escapeXml(message)}</Message></Error>`,
    );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Parses AWS SigV4 timestamp (YYYYMMDDTHHMMSSZ) to UTC milliseconds.
 */
function parseAmzDate(amzDate: string): number | null {
  if (!/^\d{8}T\d{6}Z$/.test(amzDate)) return null;
  const y = parseInt(amzDate.slice(0, 4), 10);
  const mo = parseInt(amzDate.slice(4, 6), 10) - 1;
  const d = parseInt(amzDate.slice(6, 8), 10);
  const h = parseInt(amzDate.slice(9, 11), 10);
  const mi = parseInt(amzDate.slice(11, 13), 10);
  const s = parseInt(amzDate.slice(13, 15), 10);
  const ms = Date.UTC(y, mo, d, h, mi, s);
  return Number.isNaN(ms) ? null : ms;
}
