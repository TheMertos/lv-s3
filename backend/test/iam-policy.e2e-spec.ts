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

const TEST_STORAGE_ROOT = path.join(os.tmpdir(), 'lv-s3-iam-e2e-storage');
const TEST_DB_PATH = path.join(os.tmpdir(), 'lv-s3-iam-e2e.sqlite');
const E2E_ADMIN_USER = 'admin';
const E2E_ADMIN_PASS = 'E2eTestUploadPassword123!';
const E2E_BUCKET = 'e2e-bucket';
const POLICY_NAME = 'e2e-get-object-only';

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

describe('IAM policy enforcement (e2e)', () => {
  let adminApp: INestApplication;
  let s3App: INestApplication;
  let adminJwt: string;
  let adminAccessKeyId: string;
  let adminSecretKey: string;
  let saAccessKeyId: string;
  let saSecretKey: string;
  let serviceAccountId: number;
  let policyId: number;

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

  it('admin login', async () => {
    const res = await request(adminApp.getHttpServer())
      .post('/auth/login')
      .send({ username: E2E_ADMIN_USER, password: E2E_ADMIN_PASS })
      .expect(200);
    adminJwt = res.body.accessToken as string;
    expect(adminJwt).toBeTruthy();
  });

  it('creates bucket for IAM e2e', async () => {
    await request(adminApp.getHttpServer())
      .post('/buckets')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ name: E2E_BUCKET })
      .expect(201);
  });

  it('loads admin S3 credentials', async () => {
    const res = await request(adminApp.getHttpServer())
      .get('/auth/s3-credentials')
      .set('Authorization', `Bearer ${adminJwt}`)
      .expect(200);
    adminAccessKeyId = res.body.accessKey as string;
    adminSecretKey = res.body.secretKey as string;
  });

  it('seeds object with admin SigV4 credentials', async () => {
    const objectKey = 'iam-e2e/readme.txt';
    const payload = Buffer.from('iam policy e2e fixture', 'utf8');
    const { statusCode } = await s3SignedHttp(
      s3App,
      'PUT',
      `/${E2E_BUCKET}/${objectKey}`,
      payload,
      adminAccessKeyId,
      adminSecretKey,
    );
    expect(statusCode).toBe(200);
  });

  it('creates service account', async () => {
    const res = await request(adminApp.getHttpServer())
      .post('/service-accounts')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ label: 'iam-e2e-sa' })
      .expect(201);
    saAccessKeyId = res.body.accessKey as string;
    saSecretKey = res.body.secretKey as string;
    expect(saAccessKeyId).toMatch(/^lv/);
  });

  it('creates GetObject-only IAM policy', async () => {
    const res = await request(adminApp.getHttpServer())
      .post('/iam/policies')
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({
        name: POLICY_NAME,
        document: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: [
                `arn:lv-s3:::${E2E_BUCKET}`,
                `arn:lv-s3:::${E2E_BUCKET}/*`,
              ],
            },
          ],
        },
      })
      .expect(201);
    policyId = res.body.id as number;
    expect(policyId).toBeGreaterThan(0);
  });

  it('resolves service account id and attaches policy', async () => {
    const list = await request(adminApp.getHttpServer())
      .get('/service-accounts')
      .set('Authorization', `Bearer ${adminJwt}`)
      .expect(200);
    const row = (list.body as Array<{ id: number; accessKey: string }>).find(
      (r) => r.accessKey === saAccessKeyId,
    );
    expect(row).toBeTruthy();
    serviceAccountId = row!.id;

    await request(adminApp.getHttpServer())
      .post(`/iam/policies/${policyId}/attach`)
      .set('Authorization', `Bearer ${adminJwt}`)
      .send({ serviceAccountId })
      .expect(201);
  });

  it('SigV4 PutObject denied for GetObject-only service account (403)', async () => {
    const { statusCode, body } = await s3SignedHttp(
      s3App,
      'PUT',
      `/${E2E_BUCKET}/iam-e2e/denied.txt`,
      Buffer.from('should not upload', 'utf8'),
      saAccessKeyId,
      saSecretKey,
    );
    expect(statusCode).toBe(403);
    expect(body.toString('utf8')).toContain('<Code>AccessDenied</Code>');
  });

  it('SigV4 GetObject allowed for GetObject-only service account (200)', async () => {
    const { statusCode, body } = await s3SignedHttp(
      s3App,
      'GET',
      `/${E2E_BUCKET}/iam-e2e/readme.txt`,
      Buffer.alloc(0),
      saAccessKeyId,
      saSecretKey,
    );
    expect(statusCode).toBe(200);
    expect(body.toString('utf8')).toBe('iam policy e2e fixture');
  });
});
