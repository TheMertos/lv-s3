/**
 * Formats a byte length for display (B / KiB / MiB).
 */
export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1048576).toFixed(1)} MiB`;
}

/**
 * Formats an ISO timestamp using the runtime locale, or returns the raw string on failure.
 */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
