/**
 * Resolves the public S3 base URL from VITE_S3_ENDPOINT, using the browser hostname.
 * @returns Origin URL without trailing slash, or empty string when unset
 */
export function resolveS3Base(): string {
  const configured = (import.meta.env.VITE_S3_ENDPOINT as string)?.replace(/\/$/, '');
  if (!configured) return '';
  try {
    const parsed = new URL(configured);
    parsed.hostname = window.location.hostname;
    return parsed.origin;
  } catch {
    return configured;
  }
}

/** Cached public S3 origin for anonymous object URLs. */
export const S3_PUBLIC_BASE = resolveS3Base();

/**
 * Builds a public GET URL for an object when the bucket allows anonymous read.
 */
export function publicObjectUrl(bucket: string, key: string): string {
  if (!S3_PUBLIC_BASE) return '';
  return `${S3_PUBLIC_BASE}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
