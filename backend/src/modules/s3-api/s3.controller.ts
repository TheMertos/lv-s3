import {
  All,
  BadRequestException,
  Controller,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { MultipartService } from '../multipart/multipart.service';
import { IamPolicyService } from '../iam/iam-policy.service';
import {
  MalwareDetectedError,
  MalwareScanFailedError,
} from '../malware/malware-errors';
import { s3MaxSinglePutBytes } from '../../config/s3-upload-limits';
import {
  filterBucketsForPrincipal,
  type S3AuthedRequest,
} from './s3-access.types';

/**
 * Path-style S3: GET /, PUT /bucket, GET /bucket?list-type=2, GET|PUT|HEAD|DELETE /bucket/key/...
 * Multipart: POST ?uploads, PUT ?partNumber&uploadId, POST ?uploadId (complete), DELETE ?uploadId, GET ?uploadId (list parts).
 */
@Controller()
export class S3Controller {
  constructor(
    private readonly storage: StorageService,
    private readonly multipart: MultipartService,
    private readonly iam: IamPolicyService,
  ) {}

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    const pathname = (req.path || '/').replace(/^\//, '');
    const segments = pathname.split('/').filter(Boolean);
    const method = req.method;

    if (segments.length === 0) {
      if (method === 'GET') {
        const all = await this.storage.listBuckets();
        const meta = (req as S3AuthedRequest).s3AccessMeta;
        let buckets = filterBucketsForPrincipal(all, meta);
        if (meta && !meta.isAdmin && meta.serviceAccountId != null) {
          const listable: typeof buckets = [];
          for (const b of buckets) {
            const ok = await this.iam.canListBucket({
              serviceAccountId: meta.serviceAccountId,
              allowedBuckets: meta.allowedBuckets,
              bucket: b.name,
            });
            if (ok) listable.push(b);
          }
          buckets = listable;
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Owner><ID>lv</ID><DisplayName>lv</DisplayName></Owner>
  <Buckets>${buckets.map((b) => `<Bucket><Name>${escapeXml(b.name)}</Name><CreationDate>${toAmzTime(b.creationDate)}</CreationDate></Bucket>`).join('')}</Buckets>
</ListAllMyBucketsResult>`;
        return res.type('application/xml').send(xml);
      }
      return res
        .status(405)
        .type('application/xml')
        .send(err('MethodNotAllowed', 'Method not allowed'));
    }

    const bucket = segments[0];
    const key = segments.slice(1).join('/');

    if (segments.length === 1) {
      if (method === 'HEAD') {
        const exists = await this.storage.bucketExistsOnDisk(bucket);
        if (!exists) {
          return res
            .status(404)
            .type('application/xml')
            .send(err('NoSuchBucket', 'No such bucket'));
        }
        return res.status(200).end();
      }
      if (method === 'PUT') {
        await this.storage.createBucket(bucket);
        return res.status(200).end();
      }
      if (method === 'DELETE') {
        const exists = await this.storage.bucketExistsOnDisk(bucket);
        if (!exists) {
          return res
            .status(404)
            .type('application/xml')
            .send(err('NoSuchBucket', 'No such bucket'));
        }
        const empty = await this.storage.isBucketEmpty(bucket);
        if (!empty) {
          return res
            .status(409)
            .type('application/xml')
            .send(
              err(
                'BucketNotEmpty',
                'The bucket you tried to delete is not empty',
              ),
            );
        }
        await this.storage.deleteBucket(bucket);
        return res.status(204).end();
      }
      if (method === 'GET' && req.query['list-type'] === '2') {
        const prefix = String(req.query.prefix ?? '');
        const delimiter = String(req.query.delimiter ?? '');
        const maxKeys = Math.min(Number(req.query['max-keys']) || 1000, 1000);
        const continuationToken = String(
          req.query['continuation-token'] ?? req.query['start-after'] ?? '',
        );
        const { objects, commonPrefixes, isTruncated, nextContinuationToken } =
          await this.storage.listObjects(bucket, {
            prefix,
            delimiter,
            maxKeys,
            startAfter: continuationToken || undefined,
          });
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>${escapeXml(bucket)}</Name>
  <Prefix>${escapeXml(prefix)}</Prefix>
  <KeyCount>${objects.length + commonPrefixes.length}</KeyCount>
  <MaxKeys>${maxKeys}</MaxKeys>
  <IsTruncated>${isTruncated}</IsTruncated>
  ${nextContinuationToken ? `<NextContinuationToken>${escapeXml(nextContinuationToken)}</NextContinuationToken>` : ''}
  ${commonPrefixes.map((p) => `<CommonPrefixes><Prefix>${escapeXml(p)}</Prefix></CommonPrefixes>`).join('')}
  ${objects.map((o) => `<Contents><Key>${escapeXml(o.key)}</Key><LastModified>${toAmzTime(o.lastModified)}</LastModified><Size>${o.size}</Size><ETag>&quot;${o.etag}&quot;</ETag><StorageClass>STANDARD</StorageClass></Contents>`).join('')}
</ListBucketResult>`;
        return res.type('application/xml').send(xml);
      }
      return res
        .status(404)
        .type('application/xml')
        .send(err('NoSuchBucket', 'No such bucket'));
    }

    const uploadId =
      req.query.uploadId !== undefined ? String(req.query.uploadId) : undefined;
    const hasUploads = 'uploads' in req.query;
    const partNumberRaw = req.query.partNumber;
    const partNumber =
      partNumberRaw !== undefined
        ? parseInt(String(partNumberRaw), 10)
        : undefined;

    if (uploadId || hasUploads) {
      const mp = await this.handleMultipart(
        method,
        bucket,
        key,
        uploadId,
        hasUploads,
        partNumber,
        req,
        res,
      );
      if (mp) return mp;
    }

    if (method === 'GET' || method === 'HEAD') {
      try {
        if (method === 'HEAD') {
          const h = await this.storage.headObject(bucket, key);
          res.setHeader('Content-Length', String(h.size));
          res.setHeader('Last-Modified', h.mtime.toUTCString());
          return res.status(200).end();
        }
        const { stream, size, mtime } = await this.storage.getObjectStream(
          bucket,
          key,
        );
        res.setHeader('Content-Length', String(size));
        res.setHeader('Last-Modified', mtime.toUTCString());
        stream.pipe(res);
      } catch {
        return res
          .status(404)
          .type('application/xml')
          .send(err('NoSuchKey', 'The specified key does not exist'));
      }
      return;
    }
    if (method === 'PUT') {
      try {
        await this.storage.putObjectFromStream(
          bucket,
          key,
          req,
          s3MaxSinglePutBytes(),
        );
      } catch (e) {
        if (e instanceof MalwareDetectedError) {
          return res
            .status(403)
            .type('application/xml')
            .send(err('AccessDenied', 'malware detected'));
        }
        if (e instanceof MalwareScanFailedError) {
          return res
            .status(503)
            .type('application/xml')
            .send(err('ServiceUnavailable', 'malware scan failed'));
        }
        if (isLimitExceeded(e)) {
          return res
            .status(400)
            .type('application/xml')
            .send(
              err(
                'EntityTooLarge',
                'Object exceeds S3_MAX_SINGLE_PUT_BYTES; use multipart',
              ),
            );
        }
        if (e instanceof BadRequestException) {
          return res
            .status(400)
            .type('application/xml')
            .send(err('InvalidRequest', badRequestMessage(e)));
        }
        throw e;
      }
      return res.status(200).end();
    }
    if (method === 'DELETE') {
      await this.storage.deleteObject(bucket, key);
      return res.status(204).end();
    }
    return res.status(405).end();
  }

  /**
   * Handles S3-native multipart upload sub-operations when query params indicate multipart.
   * @returns Response if handled; undefined to fall through to normal object ops.
   */
  private async handleMultipart(
    method: string,
    bucket: string,
    key: string,
    uploadId: string | undefined,
    hasUploads: boolean,
    partNumber: number | undefined,
    req: Request,
    res: Response,
  ): Promise<Response | undefined> {
    try {
      if (method === 'POST' && hasUploads && !uploadId) {
        const up = await this.multipart.initiate(bucket, key);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>${escapeXml(up.bucket)}</Bucket>
  <Key>${escapeXml(up.objectKey)}</Key>
  <UploadId>${escapeXml(up.uploadId)}</UploadId>
</InitiateMultipartUploadResult>`;
        return res.type('application/xml').send(xml);
      }

      if (method === 'PUT' && uploadId && partNumber !== undefined) {
        const contentLengthHeader = req.headers['content-length'];
        const declaredContentLength =
          typeof contentLengthHeader === 'string' &&
          /^\d+$/.test(contentLengthHeader)
            ? Number(contentLengthHeader)
            : undefined;
        const { etag } = await this.multipart.uploadPartFromStream(
          bucket,
          uploadId,
          partNumber,
          req,
          declaredContentLength,
        );
        const quoted = `"${etag}"`;
        res.setHeader('ETag', quoted);
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ETag>${escapeXml(quoted)}</ETag>`;
        return res.type('application/xml').send(xml);
      }

      if (method === 'POST' && uploadId && !hasUploads) {
        const body = await readRequestBodyLimited(req, 1024 * 1024);
        const xmlBody = body.length ? body.toString('utf8') : '';
        let partNumbers = parseCompleteMultipartXml(xmlBody);
        if (!partNumbers.length) {
          const listed = await this.multipart.listParts(bucket, uploadId);
          partNumbers = listed.parts.map((p) => p.partNumber);
        }
        const result = await this.multipart.complete(
          bucket,
          uploadId,
          key,
          partNumbers,
        );
        const quoted = `"${result.etag}"`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Location>/${escapeXml(bucket)}/${escapeXml(result.key)}</Location>
  <Bucket>${escapeXml(bucket)}</Bucket>
  <Key>${escapeXml(result.key)}</Key>
  <ETag>${escapeXml(quoted)}</ETag>
</CompleteMultipartUploadResult>`;
        return res.type('application/xml').send(xml);
      }

      if (method === 'DELETE' && uploadId) {
        await this.multipart.abort(bucket, uploadId);
        return res.status(204).end();
      }

      if (method === 'GET' && uploadId) {
        const maxParts = Math.min(Number(req.query['max-parts']) || 1000, 1000);
        const partNumberMarker = Number(req.query['part-number-marker']) || 0;
        const { upload, parts } = await this.multipart.listParts(
          bucket,
          uploadId,
        );
        const filtered = parts.filter((p) => p.partNumber > partNumberMarker);
        const slice = filtered.slice(0, maxParts);
        const isTruncated = filtered.length > slice.length;
        const nextMarker =
          isTruncated && slice.length > 0
            ? slice[slice.length - 1].partNumber
            : undefined;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>${escapeXml(upload.bucket)}</Bucket>
  <Key>${escapeXml(upload.objectKey)}</Key>
  <UploadId>${escapeXml(upload.uploadId)}</UploadId>
  <PartNumberMarker>${partNumberMarker}</PartNumberMarker>
  ${nextMarker !== undefined ? `<NextPartNumberMarker>${nextMarker}</NextPartNumberMarker>` : ''}
  <MaxParts>${maxParts}</MaxParts>
  <IsTruncated>${isTruncated}</IsTruncated>
  ${slice
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><LastModified>${toAmzTime(p.createdAt ?? new Date())}</LastModified><ETag>&quot;${escapeXml(p.etag)}&quot;</ETag><Size>${p.size}</Size></Part>`,
    )
    .join('')}
</ListPartsResult>`;
        return res.type('application/xml').send(xml);
      }
    } catch (e) {
      return mapMultipartError(res, e);
    }

    if (hasUploads || uploadId) {
      return res
        .status(405)
        .type('application/xml')
        .send(err('MethodNotAllowed', 'Method not allowed'));
    }
    return undefined;
  }
}

/**
 * Extracts PartNumber values from CompleteMultipartUpload XML body.
 */
function parseCompleteMultipartXml(xml: string): number[] {
  const parts: number[] = [];
  const re = /<PartNumber>\s*(\d+)\s*<\/PartNumber>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(parseInt(m[1], 10));
  }
  return parts;
}

/**
 * Maps multipart service exceptions to S3 XML error responses.
 */
function mapMultipartError(res: Response, e: unknown): Response {
  if (e instanceof MalwareDetectedError) {
    return res
      .status(403)
      .type('application/xml')
      .send(err('AccessDenied', 'malware detected'));
  }
  if (e instanceof MalwareScanFailedError) {
    return res
      .status(503)
      .type('application/xml')
      .send(err('ServiceUnavailable', 'malware scan failed'));
  }
  if (isLimitExceeded(e)) {
    return res
      .status(400)
      .type('application/xml')
      .send(err('EntityTooLarge', 'Upload exceeds the configured size limit'));
  }
  if (e instanceof NotFoundException) {
    return res
      .status(404)
      .type('application/xml')
      .send(err('NoSuchUpload', 'The specified upload does not exist'));
  }
  if (e instanceof BadRequestException) {
    return res
      .status(400)
      .type('application/xml')
      .send(err('InvalidRequest', badRequestMessage(e)));
  }
  throw e;
}

/**
 * Extracts a stable message from a Nest bad-request exception.
 * @param exception - Bad-request exception to serialize.
 * @returns Human-readable error message.
 */
function badRequestMessage(exception: BadRequestException): string {
  const response = exception.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const message = (response as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return exception.message;
}

/**
 * Reads a small request body into memory while enforcing a byte limit.
 * @param source - Incoming request stream.
 * @param maxBytes - Maximum accepted body size.
 * @returns Buffered request body.
 */
async function readRequestBodyLimited(
  source: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.length;
    if (bytesRead > maxBytes) {
      throw Object.assign(new Error('Payload too large'), {
        code: 'LIMIT_EXCEEDED',
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytesRead);
}

/**
 * Identifies bounded-stream size errors without depending on an Error subclass.
 * @param error - Unknown caught value.
 * @returns Whether the value carries the stream limit error code.
 */
function isLimitExceeded(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'LIMIT_EXCEEDED'
  );
}

function toAmzTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function err(code: string, msg: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${escapeXml(msg)}</Message></Error>`;
}
