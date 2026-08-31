import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import * as fs from 'fs/promises';

export type StreamToFileOptions = {
  prefixBytes: number;
  validatePrefix: (prefix: Buffer) => void;
};

/**
 * Streams readable into destPath; aborts if more than maxBytes are received.
 * @param source - Readable stream to copy from
 * @param destPath - Destination file path on disk
 * @param maxBytes - Maximum allowed payload size in bytes
 * @param options - Optional bounded-prefix validation performed before writes
 * @returns Promise resolving to the number of bytes written
 * @throws Error with code `LIMIT_EXCEEDED` when maxBytes is exceeded
 */
export async function streamToFile(
  source: NodeJS.ReadableStream,
  destPath: string,
  maxBytes: number,
  options?: StreamToFileOptions,
): Promise<{ bytesWritten: number }> {
  let bytesWritten = 0;
  let prefixLength = 0;
  let prefixValidated = options === undefined;
  const prefixChunks: Buffer[] = [];
  const prefixBytes = options
    ? Math.max(1, Math.floor(options.prefixBytes))
    : 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesWritten += buffer.length;
      if (bytesWritten > maxBytes) {
        const err = new Error('Payload too large') as Error & { code: string };
        err.code = 'LIMIT_EXCEEDED';
        cb(err);
        return;
      }
      if (prefixValidated || !options) {
        cb(null, buffer);
        return;
      }

      const prefixPart = buffer.subarray(
        0,
        Math.min(buffer.length, prefixBytes - prefixLength),
      );
      prefixChunks.push(prefixPart);
      prefixLength += prefixPart.length;
      if (prefixLength < prefixBytes) {
        cb();
        return;
      }

      try {
        const prefix = Buffer.concat(prefixChunks, prefixLength);
        options.validatePrefix(prefix);
        prefixValidated = true;
        this.push(prefix);
        const remainder = buffer.subarray(prefixPart.length);
        cb(null, remainder.length ? remainder : undefined);
      } catch (error) {
        cb(error as Error);
      }
    },
    flush(cb) {
      if (prefixValidated || !options) {
        cb();
        return;
      }
      try {
        const prefix = Buffer.concat(prefixChunks, prefixLength);
        options.validatePrefix(prefix);
        prefixValidated = true;
        this.push(prefix);
        cb();
      } catch (error) {
        cb(error as Error);
      }
    },
  });
  try {
    await pipeline(source, counter, createWriteStream(destPath));
    return { bytesWritten };
  } catch (e) {
    await fs.unlink(destPath).catch(() => {});
    throw e;
  }
}
