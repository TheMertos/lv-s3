import * as fs from 'fs/promises';
import * as path from 'path';

export type ListedObject = {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
};

export type ListObjectsWalkResult = {
  objects: ListedObject[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
};

export type ObjectListEntryReader = (
  fullPath: string,
) => Promise<{ size: number; mtime: Date; etag: string }>;

/**
 * Sorts and paginates listed objects by UTF-8 key order with optional startAfter.
 */
export function paginateListedObjects(
  objects: ListedObject[],
  opts: { maxKeys: number; startAfter?: string },
): {
  objects: ListedObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
} {
  const sorted = [...objects].sort((a, b) => a.key.localeCompare(b.key));
  const startAfter = (opts.startAfter ?? '').replace(/^\/+/, '');
  const filtered = startAfter
    ? sorted.filter((o) => o.key > startAfter)
    : sorted;
  const page = filtered.slice(0, opts.maxKeys);
  const isTruncated = filtered.length > opts.maxKeys;
  return {
    objects: page,
    isTruncated,
    nextContinuationToken:
      isTruncated && page.length > 0 ? page[page.length - 1]!.key : undefined,
  };
}

/**
 * Walks a bucket directory and returns S3-style objects and common prefixes.
 * @param base - Absolute bucket root path on disk
 * @param opts - prefix, delimiter, maxKeys, startAfter, and hidden meta filename to skip
 * @param readEntry - Resolves logical size, mtime, and etag for one stored object file
 */
export async function walkBucketObjects(
  base: string,
  opts: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    startAfter?: string;
    bucketMetaFilename: string;
  },
  readEntry: ObjectListEntryReader,
): Promise<ListObjectsWalkResult> {
  const prefix = (opts.prefix ?? '').replace(/^\/+/, '');
  const delimiter = opts.delimiter ?? '';
  const maxKeys = Math.min(opts.maxKeys ?? 1000, 1000);
  const candidates: ListedObject[] = [];
  const prefixes = new Set<string>();

  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === opts.bucketMetaFilename || e.name.startsWith('.lv-s3'))
        continue;
      const keyRel = rel ? `${rel}/${e.name}` : e.name;
      const keyS3 = keyRel.split(path.sep).join('/');
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (delimiter) {
          const under =
            keyS3.startsWith(prefix) || prefix === '' ? keyS3 : null;
          if (under !== null) {
            const afterPrefix = prefix
              ? keyS3.slice(prefix.length).replace(/^\//, '')
              : keyS3;
            const dIdx = afterPrefix.indexOf(delimiter);
            if (dIdx === -1) {
              await walk(full, keyRel);
            } else {
              if (!prefix) {
                const first = keyS3.split(delimiter)[0] + delimiter;
                prefixes.add(first);
              } else {
                prefixes.add(
                  prefix + afterPrefix.slice(0, dIdx + delimiter.length),
                );
              }
            }
          } else {
            await walk(full, keyRel);
          }
        } else {
          await walk(full, keyRel);
        }
        continue;
      }
      if (prefix && !keyS3.startsWith(prefix)) continue;
      if (delimiter) {
        const after = prefix ? keyS3.slice(prefix.length) : keyS3;
        const idx = after.indexOf(delimiter);
        if (idx !== -1) {
          const cp = prefix + after.slice(0, idx + delimiter.length);
          prefixes.add(cp);
          continue;
        }
      }
      const { size, mtime, etag } = await readEntry(full);
      candidates.push({ key: keyS3, size, lastModified: mtime, etag });
    }
  };

  try {
    await fs.access(base);
  } catch {
    return { objects: [], commonPrefixes: [], isTruncated: false };
  }
  await walk(base, '');
  if (delimiter === '/') {
    const prefNorm = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    const scopeDir = prefNorm
      ? path.join(base, ...prefNorm.split('/').filter(Boolean))
      : base;
    try {
      const dents = await fs.readdir(scopeDir, { withFileTypes: true });
      for (const d of dents) {
        if (!d.isDirectory()) continue;
        if (d.name === opts.bucketMetaFilename || d.name.startsWith('.lv-s3'))
          continue;
        const cp = prefNorm ? `${prefNorm}/${d.name}/` : `${d.name}/`;
        prefixes.add(cp);
      }
    } catch {
      /* scope missing */
    }
  }

  const paged = paginateListedObjects(candidates, {
    maxKeys,
    startAfter: opts.startAfter,
  });
  return {
    objects: paged.objects,
    commonPrefixes: [...prefixes].sort(),
    isTruncated: paged.isTruncated,
    nextContinuationToken: paged.nextContinuationToken,
  };
}
