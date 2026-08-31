import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import { MalwareDetectedError } from '../malware/malware-errors';
import { MalwareGate } from '../malware/malware-gate.service';
import type { MalwareScanner } from '../malware/malware-scanner';
import { BUCKET_META_FILENAME, StorageService } from './storage.service';

/**
 * Builds a MalwareGate that always reports clean (default for storage tests).
 * @returns Gate with Off-style scanner.
 */
function createCleanGate(): MalwareGate {
  const scanner: MalwareScanner = {
    scan: async () => 'clean',
  };
  const audit = { record: jest.fn() } as unknown as AuditService;
  return new MalwareGate(scanner, audit);
}

/**
 * Builds StorageService backed by a temp directory.
 * @param root - Temporary storage root.
 * @param masterKey - Optional encryption key for sealed buckets.
 * @param gate - Optional malware gate (defaults to always-clean).
 * @returns Storage service configured for the temporary root.
 */
function createService(
  root: string,
  masterKey?: string,
  gate?: MalwareGate,
): StorageService {
  const config = {
    get: (key: string, defaultValue?: string) =>
      key === 'STORAGE_ROOT' ? root : defaultValue,
    getOrThrow: (key: string) => {
      if (key === 'MASTER_ENCRYPTION_KEY' && masterKey) return masterKey;
      throw new Error(`Missing config: ${key}`);
    },
  } as ConfigService;
  return new StorageService(config, gate ?? createCleanGate());
}

describe('StorageService.putObjectFromStream', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-stream-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('streams a payload to an object and returns its size', async () => {
    const service = createService(tmpRoot);
    const payload = Buffer.from('streamed payload');

    const result = await service.putObjectFromStream(
      'my-bucket',
      'nested/object.txt',
      Readable.from(payload),
      payload.length,
    );

    expect(result).toEqual({ size: payload.length });
    await expect(
      fs.readFile(path.join(tmpRoot, 'my-bucket', 'nested', 'object.txt')),
    ).resolves.toEqual(payload);
  });

  it('seals streamed payloads for encrypted buckets', async () => {
    const service = createService(tmpRoot, 'a'.repeat(64));
    const payload = Buffer.from('encrypted streamed payload');
    await service.createBucket('my-bucket', { encryptAtRest: true });

    const result = await service.putObjectFromStream(
      'my-bucket',
      'object.txt',
      Readable.from(payload),
      payload.length,
    );

    expect(result).toEqual({ size: payload.length });
    const stored = await fs.readFile(
      path.join(tmpRoot, 'my-bucket', 'object.txt'),
    );
    expect(stored).not.toEqual(payload);
    const object = await service.getObjectStream('my-bucket', 'object.txt');
    expect(Buffer.concat(await object.stream.toArray())).toEqual(payload);
  });

  it('removes partial files when the size limit is exceeded', async () => {
    const service = createService(tmpRoot);
    const objectPath = path.join(tmpRoot, 'my-bucket', 'object.txt');

    await expect(
      service.putObjectFromStream(
        'my-bucket',
        'object.txt',
        Readable.from(Buffer.from('too large')),
        3,
      ),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(fs.stat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a streamed PE executable and removes the partial object', async () => {
    const service = createService(tmpRoot);
    const objectPath = path.join(tmpRoot, 'my-bucket', 'dangerous.exe');
    const payload = Buffer.concat([
      Buffer.from([0x4d, 0x5a]),
      Buffer.alloc(8192, 0x41),
    ]);

    await expect(
      service.putObjectFromStream(
        'my-bucket',
        'dangerous.exe',
        Readable.from(payload),
        payload.length,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_REJECTED',
      },
    });
    await expect(fs.stat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves an existing object when streamed validation fails', async () => {
    const service = createService(tmpRoot);
    const objectPath = path.join(tmpRoot, 'my-bucket', 'object.txt');
    const existing = Buffer.from('existing object');
    await fs.mkdir(path.dirname(objectPath), { recursive: true });
    await fs.writeFile(objectPath, existing);

    await expect(
      service.putObjectFromStream(
        'my-bucket',
        'object.txt',
        Readable.from(Buffer.from('MZdangerous executable')),
        128,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_REJECTED',
      },
    });

    await expect(fs.readFile(objectPath)).resolves.toEqual(existing);
    await expect(fs.readdir(path.dirname(objectPath))).resolves.toEqual([
      'object.txt',
    ]);
  });

  it('rejects infected PutObject and leaves no final object or temp', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const infectedGate = new MalwareGate(
      { scan: async () => 'infected' },
      audit as unknown as AuditService,
    );
    const service = createService(tmpRoot, undefined, infectedGate);
    const objectPath = path.join(tmpRoot, 'my-bucket', 'infected.txt');
    const payload = Buffer.from('looks clean to magic checks');

    await expect(
      service.putObjectFromStream(
        'my-bucket',
        'infected.txt',
        Readable.from(payload),
        payload.length,
      ),
    ).rejects.toBeInstanceOf(MalwareDetectedError);

    await expect(fs.stat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const dir = path.dirname(objectPath);
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    expect(
      entries.filter((e) => e.includes('.tmp') || e.includes('plain')),
    ).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MALWARE_INFECTED' }),
    );
  });
});

describe('StorageService.putObject', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-put-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('rejects infected buffer PutObject and leaves no final object', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const infectedGate = new MalwareGate(
      { scan: async () => 'infected' },
      audit as unknown as AuditService,
    );
    const service = createService(tmpRoot, undefined, infectedGate);
    const objectPath = path.join(tmpRoot, 'my-bucket', 'infected-buf.txt');
    const payload = Buffer.from('admin buffer upload');

    await expect(
      service.putObject('my-bucket', 'infected-buf.txt', payload),
    ).rejects.toBeInstanceOf(MalwareDetectedError);

    await expect(fs.stat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const dir = path.dirname(objectPath);
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    expect(
      entries.filter((e) => e.includes('.tmp') || e.includes('buffer')),
    ).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MALWARE_INFECTED' }),
    );
  });

  it('publishes a buffered object after a clean scan', async () => {
    const service = createService(tmpRoot);
    const payload = Buffer.from('clean buffer upload');

    await service.putObject('my-bucket', 'clean.txt', payload);

    await expect(
      fs.readFile(path.join(tmpRoot, 'my-bucket', 'clean.txt')),
    ).resolves.toEqual(payload);
  });
});

describe('StorageService.getBucketVisibility', () => {
  let tmpRoot: string;
  let service: StorageService;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-vis-'));
    service = createService(tmpRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns flags from bucket metadata in a single read', async () => {
    const bucket = 'my-bucket';
    await service.createBucket(bucket, { encryptAtRest: true });
    await service.setBucketPublicRead(bucket, true);

    const visibility = await service.getBucketVisibility(bucket);

    expect(visibility).toEqual({ publicRead: true, encryptAtRest: true });
  });

  it('defaults to private non-encrypted when metadata is missing', async () => {
    const bucket = 'legacy';
    await fs.mkdir(path.join(tmpRoot, bucket), { recursive: true });

    const visibility = await service.getBucketVisibility(bucket);

    expect(visibility).toEqual({ publicRead: false, encryptAtRest: false });
  });

  it('delegates isBucketPublicRead and isBucketEncryptAtRest to getBucketVisibility', async () => {
    const bucket = 'delegated';
    const metaPath = path.join(tmpRoot, bucket, BUCKET_META_FILENAME);
    await fs.mkdir(path.join(tmpRoot, bucket), { recursive: true });
    await fs.writeFile(
      metaPath,
      JSON.stringify({ publicRead: true, encryptAtRest: false }),
      'utf8',
    );

    await expect(service.isBucketPublicRead(bucket)).resolves.toBe(true);
    await expect(service.isBucketEncryptAtRest(bucket)).resolves.toBe(false);
  });
});

describe('StorageService.resolveSafe', () => {
  let tmpRoot: string;
  let service: StorageService;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-safe-'));
    service = createService(tmpRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('rejects path traversal escaping bucket root', () => {
    expect(() =>
      service.resolveSafe('my-bucket', '../../outside/secret'),
    ).toThrow(/escapes storage root/);
  });

  it('rejects reserved metadata key', () => {
    expect(() =>
      service.resolveSafe('my-bucket', BUCKET_META_FILENAME),
    ).toThrow(/Reserved key/);
  });

  it('resolves safe nested key', () => {
    const resolved = service.resolveSafe('my-bucket', 'folder/file.txt');
    expect(resolved).toContain(path.join('my-bucket', 'folder', 'file.txt'));
  });
});
