import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Returns a unique temporary path beside a destination for same-filesystem rename.
 * @param destinationPath - Final file path that will be atomically replaced.
 * @param purpose - Short label describing the temporary file contents.
 * @returns Unique sibling path suitable for concurrent writers.
 */
export function uniqueSiblingTempPath(
  destinationPath: string,
  purpose: string,
): string {
  const directory = path.dirname(destinationPath);
  const basename = path.basename(destinationPath);
  const token = crypto.randomUUID().replace(/-/g, '');
  return path.join(directory, `.${basename}.lv-s3-${purpose}-${token}.tmp`);
}
