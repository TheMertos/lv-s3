/**
 * Builds a bucket or object resource ARN for IAM matching.
 * @param bucket - Bucket name
 * @param key - Optional object key; omit for bucket-only ARN
 * @returns ARN string `arn:lv-s3:::{bucket}` or `arn:lv-s3:::{bucket}/{key}`
 */
export function buildIamArn(bucket: string, key?: string): string {
  if (key === undefined || key === '') {
    return `arn:lv-s3:::${bucket}`;
  }
  return `arn:lv-s3:::${bucket}/${key}`;
}

/**
 * Returns true when a statement resource pattern matches a request ARN.
 * Exact match, or trailing `*` prefix match (`arn:lv-s3:::b/foo*` → `arn:lv-s3:::b/foobar`).
 * @param pattern - Statement Resource string
 * @param requestArn - Request ARN from buildIamArn
 * @returns Whether the pattern covers the request ARN
 */
export function resourceMatches(pattern: string, requestArn: string): boolean {
  if (pattern === requestArn) {
    return true;
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return requestArn.startsWith(prefix);
  }
  return false;
}
