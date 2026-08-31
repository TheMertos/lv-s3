import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { walkBucketObjects } from './list-objects.util';
import { BUCKET_META_FILENAME } from './storage.service';

/**
 * Creates a temp directory for storage tests; caller must rm -rf in afterEach.
 */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-list-'));
}

describe('walkBucketObjects', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const readEntry = async (fullPath: string) => {
    const stat = await fs.stat(fullPath);
    return { size: stat.size, mtime: stat.mtime, etag: 'test-etag' };
  };

  it('lists flat objects and skips bucket meta files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'hello');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'world');
    await fs.writeFile(
      path.join(tmpDir, BUCKET_META_FILENAME),
      JSON.stringify({ publicRead: false }),
    );

    const result = await walkBucketObjects(
      tmpDir,
      { bucketMetaFilename: BUCKET_META_FILENAME },
      readEntry,
    );

    expect(result.objects.map((o) => o.key).sort()).toEqual(['a.txt', 'b.txt']);
    expect(result.commonPrefixes).toEqual([]);
    expect(result.isTruncated).toBe(false);
  });

  it('returns common prefixes with delimiter and prefix', async () => {
    await fs.mkdir(path.join(tmpDir, 'photos'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'photos', '2024'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'photos', '2024', 'img.jpg'), 'x');
    await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'docs', 'readme.md'), 'y');

    const result = await walkBucketObjects(
      tmpDir,
      { delimiter: '/', bucketMetaFilename: BUCKET_META_FILENAME },
      readEntry,
    );

    expect(result.commonPrefixes.sort()).toEqual(['docs/', 'photos/']);
    expect(result.objects).toEqual([]);
  });

  it('truncates at maxKeys', async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmpDir, `f${i}.txt`), 'x');
    }

    const result = await walkBucketObjects(
      tmpDir,
      { maxKeys: 3, bucketMetaFilename: BUCKET_META_FILENAME },
      readEntry,
    );

    expect(result.objects).toHaveLength(3);
    expect(result.isTruncated).toBe(true);
    expect(result.nextContinuationToken).toBeDefined();
  });

  it('paginates with startAfter continuation', async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmpDir, `f${i}.txt`), 'x');
    }
    const first = await walkBucketObjects(
      tmpDir,
      { maxKeys: 2, bucketMetaFilename: BUCKET_META_FILENAME },
      readEntry,
    );
    expect(first.objects).toHaveLength(2);
    expect(first.isTruncated).toBe(true);
    const second = await walkBucketObjects(
      tmpDir,
      {
        maxKeys: 2,
        startAfter: first.nextContinuationToken,
        bucketMetaFilename: BUCKET_META_FILENAME,
      },
      readEntry,
    );
    expect(second.objects.length).toBeGreaterThan(0);
    expect(
      second.objects[0]!.key > first.objects[first.objects.length - 1]!.key,
    ).toBe(true);
  });

  it('returns empty result when base path does not exist', async () => {
    const missing = path.join(tmpDir, 'no-such-bucket');
    const result = await walkBucketObjects(
      missing,
      { bucketMetaFilename: BUCKET_META_FILENAME },
      readEntry,
    );

    expect(result).toEqual({
      objects: [],
      commonPrefixes: [],
      isTruncated: false,
    });
  });
});
