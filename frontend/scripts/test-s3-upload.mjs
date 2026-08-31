/**
 * S3 SigV4 upload check against LV S3 (path-style).
 *
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
 *   S3_ENDPOINT=http://127.0.0.1:9000 S3_BUCKET=public \
 *   yarn --cwd frontend node scripts/test-s3-upload.mjs
 */
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const endpoint = (process.env.S3_ENDPOINT || process.env.S3_AVATAR_PUBLIC_BASE_URL || 'http://127.0.0.1:9000').replace(
  /\/$/,
  '',
);
const region = process.env.AWS_DEFAULT_REGION || process.env.S3_AVATAR_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET || process.env.S3_AVATAR_BUCKET || 'public';
const key = process.env.S3_TEST_KEY || `upload-test/${Date.now()}.txt`;
const body = `lv-s3 upload test ${new Date().toISOString()}\n`;

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  console.error('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain',
    }),
  );
  console.log('PutObject OK', { endpoint, bucket, key });
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  console.log('HeadObject OK', { contentLength: head.ContentLength, contentType: head.ContentType });
} catch (e) {
  console.error('FAILED', e?.name, e?.message);
  process.exit(1);
}
