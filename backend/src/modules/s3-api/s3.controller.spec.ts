import { S3Controller } from './s3.controller';
import { StorageService } from '../storage/storage.service';
import { MultipartService } from '../multipart/multipart.service';
import { IamPolicyService } from '../iam/iam-policy.service';
import {
  MalwareDetectedError,
  MalwareScanFailedError,
} from '../malware/malware-errors';
import { Readable } from 'stream';
import { BadRequestException } from '@nestjs/common';

/** Stub IAM service for controller unit tests (authorize always allows). */
const iamStub = {
  canListBucket: jest.fn().mockResolvedValue(true),
  authorize: jest.fn().mockResolvedValue(true),
} as unknown as IamPolicyService;

/**
 * Builds an S3Controller with stub IAM for unit tests.
 * @param storage - Storage mock
 * @param multipart - Multipart mock
 */
function createController(
  storage: StorageService,
  multipart: MultipartService,
): S3Controller {
  return new S3Controller(storage, multipart, iamStub);
}

type MockResponse = {
  statusCode: number;
  body?: string;
  headers: Record<string, string>;
  ended: boolean;
  status: jest.MockedFunction<(code: number) => MockResponse>;
  type: jest.MockedFunction<(value: string) => MockResponse>;
  send: jest.MockedFunction<(value: string) => MockResponse>;
  end: jest.MockedFunction<() => MockResponse>;
  setHeader: jest.MockedFunction<(name: string, value: string) => void>;
};

/**
 * Creates a minimal Express-like response object for controller unit tests.
 */
function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    type: jest.fn((value: string) => {
      void value;
      return res;
    }),
    send: jest.fn((value: string) => {
      res.body = value;
      return res;
    }),
    end: jest.fn(() => {
      res.ended = true;
      return res;
    }),
    setHeader: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
  };
  return res;
}

/**
 * Creates a readable Express-like request for streaming controller tests.
 * @param body - Request payload chunks.
 * @param request - Express request properties.
 * @returns Readable request carrying the provided properties.
 */
function createMockRequest(
  body: Buffer,
  request: {
    path: string;
    method: string;
    query: Record<string, string>;
    headers?: Record<string, string>;
  },
): Readable {
  return Object.assign(Readable.from(body), {
    ...request,
    headers: request.headers ?? {},
  });
}

describe('S3Controller bucket HEAD', () => {
  it('returns 200 when bucket exists', async () => {
    const storage = {
      bucketExistsOnDisk: jest.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    const multipart = {} as MultipartService;
    const controller = createController(storage, multipart);
    const req = {
      path: '/public',
      method: 'HEAD',
      query: {},
    } as any;
    const res = createMockResponse();

    await controller.handle(req, res as any);

    expect(storage.bucketExistsOnDisk).toHaveBeenCalledWith('public');
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('returns 404 NoSuchBucket when bucket does not exist', async () => {
    const storage = {
      bucketExistsOnDisk: jest.fn().mockResolvedValue(false),
    } as unknown as StorageService;
    const multipart = {} as MultipartService;
    const controller = createController(storage, multipart);
    const req = {
      path: '/missing-bucket',
      method: 'HEAD',
      query: {},
    } as any;
    const res = createMockResponse();

    await controller.handle(req, res as any);

    expect(storage.bucketExistsOnDisk).toHaveBeenCalledWith('missing-bucket');
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('<Code>NoSuchBucket</Code>');
  });
});

describe('S3Controller streaming uploads', () => {
  const originalSinglePutLimit = process.env.S3_MAX_SINGLE_PUT_BYTES;

  afterEach(() => {
    if (originalSinglePutLimit === undefined) {
      delete process.env.S3_MAX_SINGLE_PUT_BYTES;
    } else {
      process.env.S3_MAX_SINGLE_PUT_BYTES = originalSinglePutLimit;
    }
  });

  it('streams PutObject directly to storage with the configured limit', async () => {
    process.env.S3_MAX_SINGLE_PUT_BYTES = '3';
    const storage = {
      putObjectFromStream: jest.fn().mockResolvedValue({ size: 3 }),
    } as unknown as StorageService;
    const controller = createController(storage, {} as MultipartService);
    const req = createMockRequest(Buffer.from('abc'), {
      path: '/bucket/object.txt',
      method: 'PUT',
      query: {},
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(storage.putObjectFromStream).toHaveBeenCalledWith(
      'bucket',
      'object.txt',
      req,
      3,
    );
    expect(res.statusCode).toBe(200);
  });

  it('maps an oversized PutObject stream to EntityTooLarge', async () => {
    const limitError = Object.assign(new Error('Payload too large'), {
      code: 'LIMIT_EXCEEDED',
    });
    const storage = {
      putObjectFromStream: jest.fn().mockRejectedValue(limitError),
    } as unknown as StorageService;
    const controller = createController(storage, {} as MultipartService);
    const req = createMockRequest(Buffer.from('abcd'), {
      path: '/bucket/object.txt',
      method: 'PUT',
      query: {},
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('<Code>EntityTooLarge</Code>');
  });

  it('maps rejected PutObject content to an S3 InvalidRequest error', async () => {
    const storage = {
      putObjectFromStream: jest
        .fn()
        .mockRejectedValue(
          new BadRequestException(
            'Executable or unsafe file type is not allowed',
          ),
        ),
    } as unknown as StorageService;
    const controller = createController(storage, {} as MultipartService);
    const req = createMockRequest(Buffer.from([0x4d, 0x5a]), {
      path: '/bucket/dangerous.exe',
      method: 'PUT',
      query: {},
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('<Code>InvalidRequest</Code>');
  });

  it('maps MalwareDetectedError on PutObject to XML 403 AccessDenied', async () => {
    const storage = {
      putObjectFromStream: jest
        .fn()
        .mockRejectedValue(new MalwareDetectedError('bucket', 'object.txt')),
    } as unknown as StorageService;
    const controller = createController(storage, {} as MultipartService);
    const req = createMockRequest(Buffer.from('payload'), {
      path: '/bucket/object.txt',
      method: 'PUT',
      query: {},
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('<Code>AccessDenied</Code>');
    expect(res.body).toContain('malware');
  });

  it('maps MalwareScanFailedError on PutObject to XML 503', async () => {
    const storage = {
      putObjectFromStream: jest
        .fn()
        .mockRejectedValue(new MalwareScanFailedError('bucket', 'object.txt')),
    } as unknown as StorageService;
    const controller = createController(storage, {} as MultipartService);
    const req = createMockRequest(Buffer.from('payload'), {
      path: '/bucket/object.txt',
      method: 'PUT',
      query: {},
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('<Code>ServiceUnavailable</Code>');
  });

  it('streams UploadPart with its declared content length', async () => {
    const multipart = {
      uploadPartFromStream: jest
        .fn()
        .mockResolvedValue({ etag: 'part-etag', size: 4 }),
    } as unknown as MultipartService;
    const controller = createController({} as StorageService, multipart);
    const req = createMockRequest(Buffer.from('part'), {
      path: '/bucket/object.txt',
      method: 'PUT',
      query: { uploadId: 'upload-id', partNumber: '1' },
      headers: { 'content-length': '4' },
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(multipart.uploadPartFromStream).toHaveBeenCalledWith(
      'bucket',
      'upload-id',
      1,
      req,
      4,
    );
    expect(res.headers.ETag).toBe('"part-etag"');
  });

  it('rejects CompleteMultipartUpload XML larger than 1 MiB', async () => {
    const multipart = {
      listParts: jest.fn(),
      complete: jest.fn(),
    } as unknown as MultipartService;
    const controller = createController({} as StorageService, multipart);
    const req = createMockRequest(Buffer.alloc(1024 * 1024 + 1, 0x20), {
      path: '/bucket/object.txt',
      method: 'POST',
      query: { uploadId: 'upload-id' },
    });
    const res = createMockResponse();

    await controller.handle(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('<Code>EntityTooLarge</Code>');
    expect(multipart.complete).not.toHaveBeenCalled();
  });
});
