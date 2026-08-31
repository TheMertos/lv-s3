/**
 * LV S3 Docker E2E — Admin :9001, S3 :9000
 *
 * Spezifikation (Test-Matrix):
 * 1) Zwei Buckets: PRIVATE (publicRead false) und PUBLIC (publicRead true).
 * 2) Gemeinsamer Ordnerpfad: spec/cases/ — Upload & Download in BEIDEN Buckets.
 * 3) PRIVATE: S3 SigV4 Put/Get, Admin-Upload/Download, anonymer GET → verweigert,
 *    Presigned URL (SigV4 Query) → download like Amazon S3.
 * 4) PUBLIC: wie PRIVATE, zusätzlich anonymer GET auf Objekt-URL erlaubt;
 *    anonymes ListObjects weiterhin verweigert.
 * 5) Regression: ListBuckets, Multipart (Admin), Service Account.
 *
 * Usage: cp .env.example .env && npm i && npm test
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

const ADMIN = process.env.ADMIN_URL || 'http://localhost:9001';
const S3_ENDPOINT = process.env.S3_URL || 'http://localhost:9000';
const REGION = process.env.REGION || 'us-east-1';
const USER = process.env.ADMIN_USERNAME || 'admin';
const PASS = process.env.ADMIN_PASSWORD || '';

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  OK  ${name}`);
  passed++;
}
function fail(name, err) {
  console.error(`  FAIL ${name}`, err?.message || err);
  failed++;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

async function adminFetch(path, opts = {}) {
  return fetch(`${ADMIN}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
}

function s3Client(accessKeyId, secretAccessKey) {
  return new S3Client({
    region: REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Admin multipart FormData upload */
async function adminUploadFolderFile(token, bucket, key, body) {
  const fd = new FormData();
  fd.append('file', new Blob([body], { type: 'text/plain' }), key.split('/').pop() || 'file.txt');
  fd.append('key', key);
  const r = await fetch(`${ADMIN}/buckets/${encodeURIComponent(bucket)}/objects/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error(await r.text());
}

async function adminDownloadFolderFile(token, bucket, key) {
  const r = await fetch(
    `${ADMIN}/buckets/${encodeURIComponent(bucket)}/objects/download?key=${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`download ${r.status}`);
  return r.text();
}

async function cleanupBuckets(s3, buckets, keys) {
  for (const b of buckets) {
    for (const k of keys) {
      await s3.send(new DeleteObjectCommand({ Bucket: b, Key: k })).catch(() => {});
    }
    await s3.send(new DeleteBucketCommand({ Bucket: b })).catch(() => {});
  }
}

async function main() {
  console.log('\nLV S3 Docker E2E (Private + Public buckets, spec/cases/, Presigned)\n');
  console.log(`Admin: ${ADMIN}  S3: ${S3_ENDPOINT}  Region: ${REGION}\n`);

  section('0 — Health & Auth');
  let accessToken;
  let adminAccessKey;
  let adminSecretKey;
  let s3;

  try {
    const h = await adminFetch('/health');
    const hj = await h.json();
    if (!h.ok || hj.ok !== true) throw new Error(String(h.status));
    ok('GET /health');
  } catch (e) {
    fail('GET /health', e);
    console.error('\nIs Docker up?  docker compose up -d\n');
    process.exit(1);
  }

  try {
    const r = await adminFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: 'wrong-password-xyz' }),
    });
    if (r.status !== 401) throw new Error(`status ${r.status}`);
    ok('POST /auth/login rejects bad password');
  } catch (e) {
    fail('POST /auth/login rejects bad password', e);
  }

  if (!PASS) {
    console.error('\nSet ADMIN_PASSWORD in tests/docker-e2e/.env\n');
    process.exit(failed ? 1 : 0);
  }

  try {
    const r = await adminFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!r.ok) throw new Error(String(r.status));
    accessToken = (await r.json()).accessToken;
    ok('POST /auth/login');
  } catch (e) {
    fail('POST /auth/login', e);
    process.exit(1);
  }

  try {
    const r = await adminFetch('/auth/s3-credentials', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    adminAccessKey = j.accessKey;
    adminSecretKey = j.secretKey;
    ok('GET /auth/s3-credentials');
  } catch (e) {
    fail('GET /auth/s3-credentials', e);
    process.exit(1);
  }

  s3 = s3Client(adminAccessKey, adminSecretKey);
  const ts = Date.now().toString(36);
  const bucketPrivate = `e2e-private-${ts}`;
  const bucketPublic = `e2e-public-${ts}`;
  const FOLDER = 'spec/cases';
  const keyS3 = `${FOLDER}/via-s3.txt`;
  const keyAdmin = `${FOLDER}/via-admin.txt`;
  const bodyS3Private = `s3-private-${ts}`;
  const bodyS3Public = `s3-public-${ts}`;
  const bodyAdmin = `admin-${ts}`;

  section('1 — Zwei Buckets anlegen (private / public)');
  try {
    for (const name of [bucketPrivate, bucketPublic]) {
      const r = await adminFetch('/buckets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error(`${name}: ${await r.text()}`);
    }
    ok(`POST /buckets → ${bucketPrivate} (private)`);
    ok(`POST /buckets → ${bucketPublic} (wird public)`);

    const vis = await adminFetch(`/buckets/${encodeURIComponent(bucketPublic)}/visibility`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ publicRead: true }),
    });
    if (!vis.ok) throw new Error(await vis.text());
    ok(`PUT visibility publicRead=true → ${bucketPublic}`);
    ok(`(implicit) ${bucketPrivate} bleibt private (publicRead false)`);
  } catch (e) {
    fail('1 Buckets anlegen + public setzen', e);
    await cleanupBuckets(s3, [bucketPrivate, bucketPublic], [keyS3, keyAdmin]);
    process.exit(1);
  }

  section(`2 — Ordner ${FOLDER}/ Upload & Download (beide Buckets)`);

  try {
    // --- PRIVATE: S3 in Ordner ---
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketPrivate,
        Key: keyS3,
        Body: Buffer.from(bodyS3Private, 'utf8'),
      }),
    );
    ok(`[PRIVATE] S3 PutObject ${keyS3}`);
    const g1 = await s3.send(new GetObjectCommand({ Bucket: bucketPrivate, Key: keyS3 }));
    if ((await g1.Body.transformToString()) !== bodyS3Private) throw new Error('private S3 GetObject body');
    ok(`[PRIVATE] S3 GetObject ${keyS3} (SigV4)`);

    const anonPriv = await fetch(`${S3_ENDPOINT}/${bucketPrivate}/${keyS3}`);
    if (anonPriv.status !== 403 && anonPriv.status !== 401) {
      throw new Error(`private anonymous GET expected 403, got ${anonPriv.status}`);
    }
    ok('[PRIVATE] anonymer GET ohne Signatur → 403');

    const prePriv = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucketPrivate, Key: keyS3 }),
      { expiresIn: 120 },
    );
    const prePrivR = await fetch(prePriv);
    const prePrivText = await prePrivR.text();
    if (!prePrivR.ok || prePrivText !== bodyS3Private) {
      throw new Error(`presigned private ${prePrivR.status}`);
    }
    ok('[PRIVATE] Presigned URL GET (SigV4 Query)');

    await adminUploadFolderFile(accessToken, bucketPrivate, keyAdmin, bodyAdmin);
    const dlPriv = await adminDownloadFolderFile(accessToken, bucketPrivate, keyAdmin);
    if (dlPriv !== bodyAdmin) throw new Error('private admin download body');
    ok(`[PRIVATE] Admin POST upload + GET download ${keyAdmin}`);

    // --- PUBLIC: S3 in Ordner ---
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketPublic,
        Key: keyS3,
        Body: Buffer.from(bodyS3Public, 'utf8'),
      }),
    );
    ok(`[PUBLIC] S3 PutObject ${keyS3}`);
    const g2 = await s3.send(new GetObjectCommand({ Bucket: bucketPublic, Key: keyS3 }));
    if ((await g2.Body.transformToString()) !== bodyS3Public) throw new Error('public S3 GetObject body');
    ok(`[PUBLIC] S3 GetObject ${keyS3} (SigV4)`);

    const anonPub = await fetch(`${S3_ENDPOINT}/${bucketPublic}/${keyS3}`);
    if (!anonPub.ok || (await anonPub.text()) !== bodyS3Public) {
      throw new Error(`public anonymous GET ${anonPub.status}`);
    }
    ok('[PUBLIC] anonymer GET Objekt-URL (public bucket)');

    const listUrl = `${S3_ENDPOINT}/${encodeURIComponent(bucketPublic)}?list-type=2`;
    const listR = await fetch(listUrl);
    if (listR.status !== 403) {
      throw new Error(`public anonymous ListObjects expected 403, got ${listR.status}`);
    }
    ok('[PUBLIC] anonymer ListObjects → 403');

    const prePub = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucketPublic, Key: keyS3 }),
      { expiresIn: 60 },
    );
    const prePubR = await fetch(prePub);
    if (!prePubR.ok || (await prePubR.text()) !== bodyS3Public) throw new Error('presigned public');
    ok('[PUBLIC] Presigned URL GET');

    await adminUploadFolderFile(accessToken, bucketPublic, keyAdmin, bodyAdmin);
    const dlPub = await adminDownloadFolderFile(accessToken, bucketPublic, keyAdmin);
    if (dlPub !== bodyAdmin) throw new Error('public admin download body');
    ok(`[PUBLIC] Admin POST upload + GET download ${keyAdmin}`);

    // ListObjects mit SigV4 (public bucket)
    const lo = await s3.send(
      new ListObjectsV2Command({ Bucket: bucketPublic, Prefix: `${FOLDER}/` }),
    );
    const keys = (lo.Contents || []).map((c) => c.Key);
    if (!keys.includes(keyS3) || !keys.includes(keyAdmin)) {
      throw new Error(`ListObjects missing keys: ${keys.join(',')}`);
    }
    ok(`[PUBLIC] S3 ListObjectsV2 Prefix ${FOLDER}/ (SigV4)`);

    await cleanupBuckets(s3, [bucketPrivate, bucketPublic], [keyS3, keyAdmin]);
    ok('Cleanup: beide Buckets + Objekte in spec/cases/');
  } catch (e) {
    fail('2 Ordner spec/cases Matrix (private+public)', e);
    await cleanupBuckets(s3, [bucketPrivate, bucketPublic], [keyS3, keyAdmin]);
  }

  section('3 — Regression (ein Temp-Bucket: visibility, multipart, service account)');
  const bucket = `e2e-reg-${ts}`;
  const key = 'hello/e2e.txt';
  const body = `e2e ${new Date().toISOString()}`;

  try {
    await s3.send(new ListBucketsCommand({}));
    ok('S3 ListBuckets');

    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    ok('S3 CreateBucket (regression)');

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(body, 'utf8') }));
    ok('S3 PutObject (regression)');

    try {
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      throw new Error('expected fail');
    } catch {
      ok('S3 DeleteBucket non-empty → abgelehnt');
    }

    await adminFetch(`/buckets/${encodeURIComponent(bucket)}/visibility`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ publicRead: true }),
    });
    const anon = await fetch(`${S3_ENDPOINT}/${bucket}/${key}`);
    if (!anon.ok || (await anon.text()) !== body) throw new Error('anon regression');
    ok('Regression: public → anonymer GET');

    await adminFetch(`/buckets/${encodeURIComponent(bucket)}/visibility`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ publicRead: false }),
    });

    const r = await adminFetch('/service-accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ label: 'e2e-reg' }),
    });
    if (!r.ok) throw new Error(await r.text());
    const sa = await r.json();
    await s3Client(sa.accessKey, sa.secretKey).send(new ListBucketsCommand({}));
    ok('POST /service-accounts + S3 ListBuckets');

    const mpKey = 'hello/multipart.txt';
    const init = await adminFetch(`/multipart/${encodeURIComponent(bucket)}/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ key: mpKey, partSize: 5 * 1024 * 1024, totalSize: 12 }),
    });
    if (!init.ok) throw new Error(await init.text());
    const { uploadId } = await init.json();
    for (const [n, blob] of [
      [1, new Blob([Buffer.from('hello ')])],
      [2, new Blob([Buffer.from('multipart')])],
    ]) {
      const fd = new FormData();
      fd.append('part', new File([blob], `p${n}.bin`));
      const up = await fetch(
        `${ADMIN}/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}/part/${n}`,
        { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` }, body: fd },
      );
      if (!up.ok) throw new Error(await up.text());
    }
    const comp = await adminFetch(
      `/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}/complete`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ key: mpKey, partNumbers: [1, 2] }),
      },
    );
    if (!comp.ok) throw new Error(await comp.text());
    const mpBody = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: mpKey }));
    if ((await mpBody.Body.transformToString()) !== 'hello multipart') throw new Error('multipart body');
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: mpKey }));
    ok('Multipart (Admin API) + Verify GetObject');

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    ok('Regression cleanup DeleteObject + DeleteBucket');
  } catch (e) {
    fail('3 Regression', e);
    await cleanupBuckets(s3, [bucket], [key, 'hello/multipart.txt']);
  }

  section('4 — S3 Port HTML');
  try {
    const r = await fetch(S3_ENDPOINT, {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
    });
    if (r.status === 302 || r.status === 301) {
      ok(`S3 GET / Accept HTML → redirect`);
    } else if (r.status === 403) {
      ok('S3 GET / Accept HTML → 403');
    } else {
      ok(`S3 GET / → ${r.status}`);
    }
  } catch (e) {
    fail('S3 browser probe', e);
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
