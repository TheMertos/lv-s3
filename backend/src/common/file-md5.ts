import * as crypto from 'crypto';
import { createReadStream } from 'fs';

/**
 * Computes the MD5 hex digest of a file on disk (S3 ETag for single-part objects).
 */
export function md5HexOfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    createReadStream(filePath)
      .on('data', (chunk: Buffer) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}
