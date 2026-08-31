import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;

/**
 * Derives 32-byte key from env MASTER_ENCRYPTION_KEY (hex or utf8 hashed to 32 bytes).
 */
export function keyFromMasterEnv(master: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(master)) return Buffer.from(master, 'hex');
  return crypto.createHash('sha256').update(master, 'utf8').digest();
}

function keyFromEnv(master: string): Buffer {
  return keyFromMasterEnv(master);
}

/**
 * Encrypts plaintext secret for storage.
 * @param master - MASTER_ENCRYPTION_KEY
 * @param plaintext - S3 secret access key
 * @returns base64(iv || ciphertext || tag)
 */
export function encryptSecret(master: string, plaintext: string): string {
  const key = keyFromEnv(master);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

/**
 * Decrypts stored blob for SigV4.
 */
export function decryptSecret(master: string, blob: string): string {
  const key = keyFromEnv(master);
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(IV_LEN, buf.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}
