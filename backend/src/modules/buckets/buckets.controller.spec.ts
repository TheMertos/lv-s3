import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BucketsController } from './buckets.controller';
import { BucketsService } from './buckets.service';
import { AuditService } from '../audit/audit.service';
import {
  MalwareDetectedError,
  MalwareScanFailedError,
} from '../malware/malware-errors';

describe('BucketsController', () => {
  let controller: BucketsController;
  const audit = { record: jest.fn() };
  const req = {
    user: { userId: 1, username: 'admin' },
    headers: {},
    ip: '127.0.0.1',
  } as never;
  const svc = {
    createBucket: jest.fn(),
    listWithVisibility: jest.fn(),
    deleteBucket: jest.fn(),
    setVisibility: jest.fn(),
    browse: jest.fn(),
    createFolder: jest.fn(),
    deleteFolder: jest.fn(),
    putObject: jest.fn(),
    openObjectStream: jest.fn(),
    deleteObjectKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BucketsController],
      providers: [
        { provide: BucketsService, useValue: svc },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(BucketsController);
  });

  it('creates a bucket', async () => {
    svc.createBucket.mockResolvedValue(undefined);
    await expect(
      controller.create(req, { name: 'new-bucket', encryptAtRest: true }),
    ).resolves.toEqual({ name: 'new-bucket', encryptAtRest: true });
    expect(svc.createBucket).toHaveBeenCalledWith('new-bucket', {
      encryptAtRest: true,
    });
  });

  it('lists buckets with visibility', async () => {
    const rows = [{ name: 'a', publicRead: false, encryptAtRest: false }];
    svc.listWithVisibility.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('maps not found when deleting missing bucket', async () => {
    svc.deleteBucket.mockRejectedValue(
      new NotFoundException('Bucket not found'),
    );
    await expect(controller.remove(req, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps bad request when bucket not empty', async () => {
    svc.deleteBucket.mockRejectedValue(
      new BadRequestException('Bucket not empty'),
    );
    await expect(controller.remove(req, 'full')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists objects under prefix', async () => {
    const browse = {
      prefixes: ['docs/'],
      objects: [
        {
          key: 'docs/readme.md',
          size: 1,
          lastModified: '2026-01-01T00:00:00.000Z',
        },
      ],
      isTruncated: false,
    };
    svc.browse.mockResolvedValue(browse);
    await expect(
      controller.listObjects('my-bucket', { prefix: 'docs/' }),
    ).resolves.toEqual(browse);
    expect(svc.browse).toHaveBeenCalledWith('my-bucket', 'docs/', undefined);
  });

  it('maps MalwareDetectedError on upload to ForbiddenException', async () => {
    svc.putObject.mockRejectedValue(
      new MalwareDetectedError('my-bucket', 'file.txt'),
    );
    const file = {
      buffer: Buffer.from('%PDF-1.4 clean looking'),
      size: 20,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await expect(
      controller.upload(req, 'my-bucket', 'file.txt', file),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('maps MalwareScanFailedError on upload to ServiceUnavailableException', async () => {
    svc.putObject.mockRejectedValue(
      new MalwareScanFailedError('my-bucket', 'file.txt'),
    );
    const file = {
      buffer: Buffer.from('%PDF-1.4 clean looking'),
      size: 20,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await expect(
      controller.upload(req, 'my-bucket', 'file.txt', file),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
