import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { MultipartPartEntity } from '../../entities/multipart-part.entity';
import { MultipartUploadEntity } from '../../entities/multipart-upload.entity';
import { AuditService } from '../audit/audit.service';
import { MalwareDetectedError } from '../malware/malware-errors';
import { MalwareGate } from '../malware/malware-gate.service';
import { StorageService } from '../storage/storage.service';
import { MultipartService } from './multipart.service';

interface MultipartTestContext {
  service: MultipartService;
  uploads: {
    findOne: jest.Mock;
  };
  parts: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
}

/**
 * Creates a multipart service with repository doubles and real temporary files.
 * @param root - Temporary storage root used for multipart part files.
 * @returns Multipart service and observable repository doubles.
 */
function createService(root: string): MultipartTestContext {
  const upload = Object.assign(new MultipartUploadEntity(), {
    id: 1,
    uploadId: 'upload-id',
    bucket: 'my-bucket',
    objectKey: 'object.txt',
    status: 'in_progress' as const,
    partSize: null,
    totalSize: null,
  });
  const uploads = {
    findOne: jest.fn().mockResolvedValue(upload),
  };
  const parts = {
    create: jest.fn((part: Partial<MultipartPartEntity>) =>
      Object.assign(new MultipartPartEntity(), part),
    ),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (part: MultipartPartEntity) => part),
  };
  const storage = {
    getRoot: () => root,
  } as StorageService;

  return {
    service: new MultipartService(
      uploads as unknown as Repository<MultipartUploadEntity>,
      parts as unknown as Repository<MultipartPartEntity>,
      storage,
    ),
    uploads,
    parts,
  };
}

describe('MultipartService.uploadPartFromStream', () => {
  let tmpRoot: string;
  let previousMin: string | undefined;
  let previousMax: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-multipart-'));
    previousMin = process.env.S3_MULTIPART_MIN_PART_BYTES;
    previousMax = process.env.S3_MULTIPART_MAX_PART_BYTES;
    process.env.S3_MULTIPART_MIN_PART_BYTES = '8';
    process.env.S3_MULTIPART_MAX_PART_BYTES = '16';
  });

  afterEach(async () => {
    if (previousMin === undefined) {
      delete process.env.S3_MULTIPART_MIN_PART_BYTES;
    } else {
      process.env.S3_MULTIPART_MIN_PART_BYTES = previousMin;
    }
    if (previousMax === undefined) {
      delete process.env.S3_MULTIPART_MAX_PART_BYTES;
    } else {
      process.env.S3_MULTIPART_MAX_PART_BYTES = previousMax;
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('streams a part to disk and saves its metadata', async () => {
    const { service, parts } = createService(tmpRoot);
    const payload = Buffer.from('streamed part');

    const result = await service.uploadPartFromStream(
      'my-bucket',
      'upload-id',
      1,
      Readable.from(payload),
      payload.length,
    );

    const expectedPath = path.join(
      tmpRoot,
      '.lv-s3',
      'multipart',
      'upload-id',
      '1.part',
    );
    expect(result).toEqual({
      etag: crypto.createHash('md5').update(payload).digest('hex'),
      size: payload.length,
    });
    await expect(fs.readFile(expectedPath)).resolves.toEqual(payload);
    expect(parts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadRefId: 1,
        partNumber: 1,
        size: payload.length,
        partPath: expectedPath,
      }),
    );
  });

  it('rejects a declared oversize part before reading the stream', async () => {
    const { service, uploads } = createService(tmpRoot);
    const source = Readable.from(
      (async function* () {
        throw new Error('stream must not be read');
      })(),
    );

    await expect(
      service.uploadPartFromStream('my-bucket', 'upload-id', 1, source, 17),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(uploads.findOne).not.toHaveBeenCalled();
  });

  it('removes the partial file when streamed data exceeds the maximum', async () => {
    const { service, parts } = createService(tmpRoot);
    const partPath = path.join(
      tmpRoot,
      '.lv-s3',
      'multipart',
      'upload-id',
      '1.part',
    );

    await expect(
      service.uploadPartFromStream(
        'my-bucket',
        'upload-id',
        1,
        Readable.from(Buffer.alloc(17)),
      ),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(fs.stat(partPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(parts.save).not.toHaveBeenCalled();
  });

  it('rejects a dangerous executable prefix in the first streamed part', async () => {
    const { service, parts } = createService(tmpRoot);
    const partPath = path.join(
      tmpRoot,
      '.lv-s3',
      'multipart',
      'upload-id',
      '1.part',
    );

    await expect(
      service.uploadPartFromStream(
        'my-bucket',
        'upload-id',
        1,
        Readable.from(
          Buffer.concat([Buffer.from([0x7f]), Buffer.from('ELFdata')]),
        ),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_REJECTED',
      },
    });
    await expect(fs.stat(partPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(parts.save).not.toHaveBeenCalled();
  });

  it('rejects an empty streamed part and removes its file', async () => {
    const { service, parts } = createService(tmpRoot);
    const partPath = path.join(
      tmpRoot,
      '.lv-s3',
      'multipart',
      'upload-id',
      '1.part',
    );

    await expect(
      service.uploadPartFromStream(
        'my-bucket',
        'upload-id',
        1,
        Readable.from(Buffer.alloc(0)),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(fs.stat(partPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(parts.save).not.toHaveBeenCalled();
  });

  it('rejects a declared zero size before reading the stream', async () => {
    const { service, uploads } = createService(tmpRoot);

    await expect(
      service.uploadPartFromStream(
        'my-bucket',
        'upload-id',
        1,
        Readable.from(Buffer.from('ignored')),
        0,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(uploads.findOne).not.toHaveBeenCalled();
  });

  it('allows a positive part below the configured minimum', async () => {
    const { service } = createService(tmpRoot);

    await expect(
      service.uploadPartFromStream(
        'my-bucket',
        'upload-id',
        1,
        Readable.from(Buffer.from('small')),
        5,
      ),
    ).resolves.toMatchObject({ size: 5 });
  });
});

describe('MultipartService.uploadPart', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-multipart-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('keeps buffer uploads as a compatibility wrapper', async () => {
    const { service } = createService(tmpRoot);
    const payload = Buffer.from('admin upload');

    await expect(
      service.uploadPart('my-bucket', 'upload-id', 2, payload),
    ).resolves.toEqual({
      etag: crypto.createHash('md5').update(payload).digest('hex'),
      size: payload.length,
    });
  });
});

describe('MultipartService.complete', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lv-s3-complete-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  /**
   * Creates a multipart completion service backed by real part files.
   * @param payloads - Ordered part payloads to expose through the repository.
   * @returns Service, destination path, and repository doubles.
   */
  async function createCompletionService(payloads: Buffer[]): Promise<{
    service: MultipartService;
    objectPath: string;
    uploads: { save: jest.Mock };
    parts: { delete: jest.Mock };
  }> {
    const uploadId = 'complete-upload';
    const upload = Object.assign(new MultipartUploadEntity(), {
      id: 7,
      uploadId,
      bucket: 'my-bucket',
      objectKey: 'object.bin',
      status: 'in_progress' as const,
      partSize: null,
      totalSize: null,
    });
    const partDir = path.join(tmpRoot, '.lv-s3', 'multipart', uploadId);
    await fs.mkdir(partDir, { recursive: true });
    const rows: MultipartPartEntity[] = [];
    for (const [index, payload] of payloads.entries()) {
      const partPath = path.join(partDir, `${index + 1}.part`);
      await fs.writeFile(partPath, payload);
      rows.push(
        Object.assign(new MultipartPartEntity(), {
          id: index + 1,
          uploadRefId: upload.id,
          partNumber: index + 1,
          size: payload.length,
          etag: crypto.createHash('md5').update(payload).digest('hex'),
          partPath,
        }),
      );
    }
    const uploads = {
      findOne: jest.fn().mockResolvedValue(upload),
      save: jest.fn(async (value: MultipartUploadEntity) => value),
    };
    const parts = {
      find: jest.fn().mockResolvedValue(rows),
      delete: jest.fn().mockResolvedValue({ affected: rows.length }),
    };
    const objectPath = path.join(tmpRoot, 'my-bucket', 'object.bin');
    const storage = {
      getRoot: () => tmpRoot,
      resolveSafe: () => objectPath,
      isBucketEncryptAtRest: jest.fn().mockResolvedValue(false),
      /**
       * Mimics StorageService.publishPlaintextTemp without malware (rename only).
       */
      publishPlaintextTemp: jest.fn(
        async (_bucket: string, _key: string, plainTempPath: string) => {
          await fs.mkdir(path.dirname(objectPath), { recursive: true });
          await fs.rename(plainTempPath, objectPath);
        },
      ),
    } as unknown as StorageService;

    return {
      service: new MultipartService(
        uploads as unknown as Repository<MultipartUploadEntity>,
        parts as unknown as Repository<MultipartPartEntity>,
        storage,
      ),
      objectPath,
      uploads,
      parts,
    };
  }

  it('stitches parts without reading complete parts into buffers', async () => {
    const payloads = [Buffer.from('safe '), Buffer.from('streamed object')];
    const { service, objectPath } = await createCompletionService(payloads);
    const readFile = jest
      .spyOn(fs, 'readFile')
      .mockRejectedValue(new Error('complete must stream files'));

    await expect(
      service.complete('my-bucket', 'complete-upload', 'object.bin', [1, 2]),
    ).resolves.toEqual({
      key: 'object.bin',
      size: Buffer.concat(payloads).length,
      etag: crypto
        .createHash('md5')
        .update(Buffer.concat(payloads))
        .digest('hex'),
    });
    expect(readFile).not.toHaveBeenCalled();
    readFile.mockRestore();
    await expect(fs.readFile(objectPath)).resolves.toEqual(
      Buffer.concat(payloads),
    );
  });

  it('preserves an existing object when a split dangerous prefix is rejected', async () => {
    const { service, objectPath, uploads, parts } =
      await createCompletionService([
        Buffer.from('M'),
        Buffer.from('Zdangerous executable'),
      ]);
    const existing = Buffer.from('existing object');
    await fs.mkdir(path.dirname(objectPath), { recursive: true });
    await fs.writeFile(objectPath, existing);

    await expect(
      service.complete('my-bucket', 'complete-upload', 'object.bin', [1, 2]),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_REJECTED',
      },
    });

    await expect(fs.readFile(objectPath)).resolves.toEqual(existing);
    expect(uploads.save).not.toHaveBeenCalled();
    expect(parts.delete).not.toHaveBeenCalled();
  });

  it('rejects CompleteMultipart when malware gate reports infected', async () => {
    const payloads = [Buffer.from('part-a '), Buffer.from('part-b')];
    const uploadId = 'infected-complete';
    const upload = Object.assign(new MultipartUploadEntity(), {
      id: 9,
      uploadId,
      bucket: 'my-bucket',
      objectKey: 'object.bin',
      status: 'in_progress' as const,
      partSize: null,
      totalSize: null,
    });
    const partDir = path.join(tmpRoot, '.lv-s3', 'multipart', uploadId);
    await fs.mkdir(partDir, { recursive: true });
    const rows: MultipartPartEntity[] = [];
    for (const [index, payload] of payloads.entries()) {
      const partPath = path.join(partDir, `${index + 1}.part`);
      await fs.writeFile(partPath, payload);
      rows.push(
        Object.assign(new MultipartPartEntity(), {
          id: index + 1,
          uploadRefId: upload.id,
          partNumber: index + 1,
          size: payload.length,
          etag: crypto.createHash('md5').update(payload).digest('hex'),
          partPath,
        }),
      );
    }
    const uploads = {
      findOne: jest.fn().mockResolvedValue(upload),
      save: jest.fn(async (value: MultipartUploadEntity) => value),
    };
    const parts = {
      find: jest.fn().mockResolvedValue(rows),
      delete: jest.fn().mockResolvedValue({ affected: rows.length }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const gate = new MalwareGate(
      { scan: async () => 'infected' },
      audit as unknown as AuditService,
    );
    const config = {
      get: (key: string, defaultValue?: string) =>
        key === 'STORAGE_ROOT' ? tmpRoot : defaultValue,
      getOrThrow: (key: string) => {
        throw new Error(`Missing config: ${key}`);
      },
    } as unknown as ConfigService;
    const storage = new StorageService(config, gate);
    await storage.createBucket('my-bucket');
    const service = new MultipartService(
      uploads as unknown as Repository<MultipartUploadEntity>,
      parts as unknown as Repository<MultipartPartEntity>,
      storage,
    );
    const objectPath = path.join(tmpRoot, 'my-bucket', 'object.bin');

    await expect(
      service.complete('my-bucket', uploadId, 'object.bin', [1, 2]),
    ).rejects.toBeInstanceOf(MalwareDetectedError);

    await expect(fs.stat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(uploads.save).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MALWARE_INFECTED' }),
    );
  });
});
