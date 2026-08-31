import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as http from 'http';
import { AdminAppModule } from '../src/admin-app.module';
import { S3AppModule } from '../src/s3-app.module';
import { signS3Request } from './helpers/sigv4-s3-sign';

const TEST_STORAGE_ROOT = path.join(os.tmpdir(), 'lv-s3-e2e-storage');
const TEST_DB_PATH = path.join(os.tmpdir(), 'lv-s3-e2e.sqlite');
const E2E_ADMIN_USER = 'admin';
const E2E_ADMIN_PASS = 'E2eTestUploadPassword123!';
const E2E_BUCKET = 'e2e-flow-bkt';

type AddressInfo = { address: string; family: string; port: number };

/**
 * Host:port for SigV4 (must match the Host header on the wire).
 */
function httpHost(app: INestApplication): string {
  const addr = app.getHttpServer().address() as AddressInfo | string | null;
  if (addr && typeof addr === 'object') {
    return `${addr.address}:${addr.port}`;
  }
  throw new Error('Server address not available');
}

/**
 * Signed S3-compatible request (path-style). Uses generated access key + secret only (no JWT).
 */
function s3SignedHttp(
  s3App: INestApplication,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD',
  s3Path: string,
  body: Buffer,
  accessKeyId: string,
  secretAccessKey: string,
  contentType?: string,
): Promise<{
  statusCode: number;
  body: Buffer;
  headers: http.OutgoingHttpHeaders;
}> {
  const host = httpHost(s3App);
  const signed = signS3Request({
    method,
    host,
    path: s3Path,
    body,
    accessKeyId,
    secretAccessKey,
    region: 'us-east-1',
    contentType,
  });
  const addr = s3App.getHttpServer().address() as AddressInfo;
  const headersOut: Record<string, string> = { ...signed };
  delete headersOut.Host;
  delete headersOut.host;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: addr.address,
        port: addr.port,
        path: s3Path,
        method,
        headers: headersOut,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

describe('LV S3 (e2e)', () => {
  let adminApp: INestApplication;
  let s3App: INestApplication;
  let adminJwt: string;
  let s3AccessKeyId: string;
  let s3SecretKey: string;

  beforeAll(async () => {
    process.env.DATABASE_PATH = TEST_DB_PATH;
    process.env.STORAGE_ROOT = TEST_STORAGE_ROOT;
    process.env.TYPEORM_SYNC = 'true';
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-characters!';
    process.env.MASTER_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ADMIN_BOOTSTRAP_USERNAME = E2E_ADMIN_USER;
    process.env.ADMIN_BOOTSTRAP_PASSWORD = E2E_ADMIN_PASS;
    process.env.ADMIN_THROTTLE_LIMIT = '10000';
    process.env.ADMIN_THROTTLE_TTL_MS = '60000';
    process.env.S3_THROTTLE_LIMIT = '10000';
    process.env.S3_THROTTLE_TTL_MS = '60000';
    process.env.BROWSER_REDIRECT_URL = '';

    await fs.rm(TEST_DB_PATH, { force: true });
    await fs.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
    await fs.mkdir(TEST_STORAGE_ROOT, { recursive: true });

    const adminFixture: TestingModule = await Test.createTestingModule({
      imports: [AdminAppModule],
    }).compile();
    adminApp = adminFixture.createNestApplication();
    adminApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await adminApp.init();

    s3App = await NestFactory.create(S3AppModule, { bodyParser: false });
    await s3App.init();
    await s3App.listen(0, '127.0.0.1');
  }, 120000);

  afterAll(async () => {
    await adminApp.close();
    await s3App.close();
    await fs.rm(TEST_DB_PATH, { force: true });
    await fs.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
  });

  it('/health (GET) on admin app', () => {
    return request(adminApp.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ ok: true });
  });

  it('step 1: admin signs in with username + password (console API only)', async () => {
    const res = await request(adminApp.getHttpServer())
      .post('/auth/login')
      .send({ username: E2E_ADMIN_USER, password: E2E_ADMIN_PASS })
      .expect(200);
    adminJwt = res.body.accessToken as string;
    expect(adminJwt).toBeTruthy();
  });

  it('step 2: admin creates bucket via POST /buckets (JWT)', async () => {
    await request(adminApp.getHttpServer())
      .post('/buckets')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ name: E2E_BUCKET })
      .expect(201);
  });

  it('step 3: load generated S3 credentials via GET /auth/s3-credentials (JWT)', async () => {
    const res = await request(adminApp.getHttpServer())
      .get('/auth/s3-credentials')
      .set('Authorization', `Bearer ${adminJwt}`)
      .expect(200);
    s3AccessKeyId = res.body.accessKey as string;
    s3SecretKey = res.body.secretKey as string;
    expect(s3AccessKeyId).toMatch(/^lvadmin/);
    expect(s3SecretKey.length).toBeGreaterThan(10);
  });

  it('step 4: PUT object on S3 API using only generated access key + secret (SigV4)', async () => {
    const objectKey = 'sigv4/hello.txt';
    const payload = Buffer.from('signed with SigV4', 'utf8');
    const s3Path = `/${E2E_BUCKET}/${objectKey}`;
    const { statusCode } = await s3SignedHttp(
      s3App,
      'PUT',
      s3Path,
      payload,
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(statusCode).toBe(200);
  });

  it('rejects a single PUT above S3_MAX_SINGLE_PUT_BYTES', async () => {
    const originalLimit = process.env.S3_MAX_SINGLE_PUT_BYTES;
    process.env.S3_MAX_SINGLE_PUT_BYTES = '3';
    try {
      const result = await s3SignedHttp(
        s3App,
        'PUT',
        `/${E2E_BUCKET}/too-large.txt`,
        Buffer.from('four'),
        s3AccessKeyId,
        s3SecretKey,
      );

      expect(result.statusCode).toBe(400);
      expect(result.body.toString('utf8')).toContain(
        '<Code>EntityTooLarge</Code>',
      );
    } finally {
      if (originalLimit === undefined) {
        delete process.env.S3_MAX_SINGLE_PUT_BYTES;
      } else {
        process.env.S3_MAX_SINGLE_PUT_BYTES = originalLimit;
      }
    }
  });

  it('step 5: GET object from S3 API with same generated credentials (SigV4)', async () => {
    const objectKey = 'sigv4/hello.txt';
    const s3Path = `/${E2E_BUCKET}/${objectKey}`;
    const { statusCode, body } = await s3SignedHttp(
      s3App,
      'GET',
      s3Path,
      Buffer.alloc(0),
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(statusCode).toBe(200);
    expect(body.toString('utf8')).toBe('signed with SigV4');
  });

  it('step 6: second upload (nested key) via S3 PUT + SigV4 only — no admin upload route', async () => {
    const objectKey = 'folder/hello-e2e.txt';
    const payload = Buffer.from('hello from e2e upload', 'utf8');
    const s3Path = `/${E2E_BUCKET}/${objectKey}`;
    const { statusCode } = await s3SignedHttp(
      s3App,
      'PUT',
      s3Path,
      payload,
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(statusCode).toBe(200);
  });

  it('step 7: GET nested object with generated credentials', async () => {
    const objectKey = 'folder/hello-e2e.txt';
    const s3Path = `/${E2E_BUCKET}/${objectKey}`;
    const { statusCode, body } = await s3SignedHttp(
      s3App,
      'GET',
      s3Path,
      Buffer.alloc(0),
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(statusCode).toBe(200);
    expect(body.toString('utf8')).toBe('hello from e2e upload');
  });

  it('step 8: SigV4 multipart upload — initiate, upload part, complete, GET object', async () => {
    const objectKey = 'sigv4/multipart.bin';
    const partPayload = Buffer.from('multipart-part-one', 'utf8');
    const s3BasePath = `/${E2E_BUCKET}/${objectKey}`;

    const initiate = await s3SignedHttp(
      s3App,
      'POST',
      `${s3BasePath}?uploads`,
      Buffer.alloc(0),
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(initiate.statusCode).toBe(200);
    const uploadIdMatch = initiate.body
      .toString('utf8')
      .match(/<UploadId>([^<]+)<\/UploadId>/);
    expect(uploadIdMatch).toBeTruthy();
    const uploadId = uploadIdMatch![1];

    const uploadPart = await s3SignedHttp(
      s3App,
      'PUT',
      `${s3BasePath}?partNumber=1&uploadId=${encodeURIComponent(uploadId)}`,
      partPayload,
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(uploadPart.statusCode).toBe(200);
    const etagHeader = uploadPart.headers.etag;
    expect(
      uploadPart.body.toString('utf8').includes('ETag') || etagHeader,
    ).toBe(true);

    const etagValue =
      typeof etagHeader === 'string'
        ? etagHeader.replace(/"/g, '')
        : (uploadPart.body
            .toString('utf8')
            .match(/<ETag>&quot;([^&]+)&quot;<\/ETag>/)?.[1] ?? '');
    const completeXml = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
  <Part><PartNumber>1</PartNumber><ETag>"${etagValue}"</ETag></Part>
</CompleteMultipartUpload>`;
    const complete = await s3SignedHttp(
      s3App,
      'POST',
      `${s3BasePath}?uploadId=${encodeURIComponent(uploadId)}`,
      Buffer.from(completeXml, 'utf8'),
      s3AccessKeyId,
      s3SecretKey,
      'application/xml',
    );
    expect(complete.statusCode).toBe(200);
    expect(complete.body.toString('utf8')).toContain(
      '<CompleteMultipartUploadResult',
    );

    const get = await s3SignedHttp(
      s3App,
      'GET',
      s3BasePath,
      Buffer.alloc(0),
      s3AccessKeyId,
      s3SecretKey,
    );
    expect(get.statusCode).toBe(200);
    expect(get.body.toString('utf8')).toBe('multipart-part-one');
  });

  it('S3 PUT without Authorization is rejected (403)', async () => {
    const s3Path = `/${E2E_BUCKET}/anon.txt`;
    const addr = s3App.getHttpServer().address() as AddressInfo;
    const { statusCode } = await new Promise<{ statusCode: number }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: addr.address,
            port: addr.port,
            path: s3Path,
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0 }));
          },
        );
        req.on('error', reject);
        req.write(Buffer.from('x'));
        req.end();
      },
    );
    expect(statusCode).toBe(403);
  });
});
