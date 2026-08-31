/**
 * Max bytes for a non-multipart S3 PUT Object.
 */
export function s3MaxSinglePutBytes(): number {
  return readPositiveInt(
    process.env.S3_MAX_SINGLE_PUT_BYTES,
    100 * 1024 * 1024,
  );
}

/**
 * Minimum allowed multipart part size in bytes.
 */
export function s3MultipartMinPartBytes(): number {
  return readPositiveInt(
    process.env.S3_MULTIPART_MIN_PART_BYTES,
    8 * 1024 * 1024,
  );
}

/**
 * Maximum allowed multipart part size in bytes.
 */
export function s3MultipartMaxPartBytes(): number {
  return readPositiveInt(
    process.env.S3_MULTIPART_MAX_PART_BYTES,
    64 * 1024 * 1024,
  );
}

/**
 * Parses a positive integer env value or returns fallback.
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
