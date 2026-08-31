import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { keyFromMasterEnv } from './crypto-secret';

/** Sealed object magic (ASCII "LVSE"). */
export const AT_REST_MAGIC = Buffer.from([0x4c, 0x56, 0x53, 0x45]);

export const AT_REST_VERSION = 1;

const HEADER_LEN = 29;
const MAC_LEN = 32;

/**
 * Inclusive byte range of ciphertext, or null when ciphertext length is zero.
 */
function ciphertextInclusiveRange(
  fileSize: number,
): { start: number; end: number } | null {
  const end = fileSize - MAC_LEN - 1;
  if (HEADER_LEN > end) return null;
  return { start: HEADER_LEN, end };
}

/**
 * Derives per-bucket encryption and MAC keys from the master secret (HKDF).
 */
export function deriveAtRestKeys(
  master: string,
  bucket: string,
): { encKey: Buffer; macKey: Buffer } {
  const ikm = keyFromMasterEnv(master);
  const encKey = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      ikm,
      Buffer.alloc(0),
      `lv-s3-at-rest-enc:${bucket}`,
      32,
    ),
  );
  const macKey = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      ikm,
      Buffer.alloc(0),
      `lv-s3-at-rest-mac:${bucket}`,
      32,
    ),
  );
  return { encKey, macKey };
}

/**
 * Seals a plaintext buffer for on-disk storage (AES-256-CTR + HMAC-SHA256).
 */
export function sealPlainBuffer(
  plain: Buffer,
  encKey: Buffer,
  macKey: Buffer,
): Buffer {
  const iv = crypto.randomBytes(16);
  const lenBuf = Buffer.allocUnsafe(8);
  lenBuf.writeBigUInt64BE(BigInt(plain.length));
  const header = Buffer.concat([
    AT_REST_MAGIC,
    Buffer.from([AT_REST_VERSION]),
    lenBuf,
    iv,
  ]);
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(Buffer.from([AT_REST_VERSION]));
  hmac.update(lenBuf);
  hmac.update(iv);
  const cipher = crypto.createCipheriv('aes-256-ctr', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  hmac.update(ciphertext);
  const mac = hmac.digest();
  return Buffer.concat([header, ciphertext, mac]);
}

/**
 * Returns true if buffer begins with a sealed-object header (magic + supported version).
 */
export function isSealedBlobPrefix(buf: Buffer): boolean {
  return (
    buf.length >= 5 &&
    buf.subarray(0, 4).equals(AT_REST_MAGIC) &&
    buf[4] === AT_REST_VERSION
  );
}

/**
 * Reads logical plaintext size from a sealed file prefix (first 13 bytes).
 */
export function logicalSizeFromSealedPrefix(header13: Buffer): number {
  if (header13.length < 13) return 0;
  return Number(header13.readBigUInt64BE(5));
}

/**
 * Verifies HMAC over header tail + ciphertext; throws if invalid.
 */
export async function verifySealedObjectMac(
  fullPath: string,
  fileSize: number,
  header: Buffer,
  macKey: Buffer,
): Promise<void> {
  if (fileSize < HEADER_LEN + MAC_LEN) {
    throw new Error('Sealed object too small');
  }
  const macExpected = Buffer.alloc(MAC_LEN);
  const fh = await fs.open(fullPath, 'r');
  try {
    await fh.read(macExpected, 0, MAC_LEN, fileSize - MAC_LEN);
  } finally {
    await fh.close();
  }
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(Buffer.from([AT_REST_VERSION]));
  hmac.update(header.subarray(5, 13));
  hmac.update(header.subarray(13, HEADER_LEN));
  const range = ciphertextInclusiveRange(fileSize);
  if (range) {
    const rs = createReadStream(fullPath, range);
    for await (const chunk of rs) {
      hmac.update(chunk as Buffer);
    }
  }
  const digest = hmac.digest();
  if (
    digest.length !== macExpected.length ||
    !crypto.timingSafeEqual(digest, macExpected)
  ) {
    throw new Error('Sealed object integrity check failed');
  }
}

/**
 * Opens a read stream of plaintext after MAC verification (ciphertext read twice from disk).
 */
export async function openVerifiedPlaintextReadStream(
  fullPath: string,
  encKey: Buffer,
  macKey: Buffer,
): Promise<{ stream: Readable; size: number; mtime: Date }> {
  const st = await fs.stat(fullPath);
  const header = Buffer.alloc(HEADER_LEN);
  const fh = await fs.open(fullPath, 'r');
  try {
    await fh.read(header, 0, HEADER_LEN, 0);
  } finally {
    await fh.close();
  }
  if (!isSealedBlobPrefix(header)) {
    throw new Error('Not a sealed object');
  }
  const size = logicalSizeFromSealedPrefix(header);
  const iv = header.subarray(13, HEADER_LEN);
  await verifySealedObjectMac(fullPath, st.size, header, macKey);
  const decipher = crypto.createDecipheriv('aes-256-ctr', encKey, iv);
  const range = ciphertextInclusiveRange(st.size);
  const rs = range
    ? createReadStream(fullPath, range)
    : Readable.from([] as Buffer[]);
  return {
    stream: rs.pipe(decipher),
    size,
    mtime: st.mtime,
  };
}

/**
 * Encrypts a plaintext file to a sealed object file (atomic replace: writes to outPath).
 */
export async function sealPlaintextFileToSealedFile(
  plainPath: string,
  outPath: string,
  encKey: Buffer,
  macKey: Buffer,
): Promise<void> {
  const st = await fs.stat(plainPath);
  const origSize = st.size;
  const iv = crypto.randomBytes(16);
  const lenBuf = Buffer.allocUnsafe(8);
  lenBuf.writeBigUInt64BE(BigInt(origSize));
  const headerPrefix = Buffer.concat([
    AT_REST_MAGIC,
    Buffer.from([AT_REST_VERSION]),
    lenBuf,
    iv,
  ]);
  const hmac = crypto.createHmac('sha256', macKey);
  hmac.update(Buffer.from([AT_REST_VERSION]));
  hmac.update(lenBuf);
  hmac.update(iv);
  const cipher = crypto.createCipheriv('aes-256-ctr', encKey, iv);
  const rs = createReadStream(plainPath);
  const ws = createWriteStream(outPath);
  ws.write(headerPrefix);
  const macPass = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hmac.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(rs, cipher, macPass, ws);
  const mac = hmac.digest();
  await fs.appendFile(outPath, mac);
}
