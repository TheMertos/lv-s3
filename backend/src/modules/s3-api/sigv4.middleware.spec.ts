import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminUserEntity } from '../../entities/admin-user.entity';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { IamPolicyService } from '../iam/iam-policy.service';
import { StorageService } from '../storage/storage.service';
import { SigV4Middleware } from './sigv4.middleware';

type MockResponse = {
  statusCode: number;
  body?: string;
  status: jest.Mock;
  type: jest.Mock;
  send: jest.Mock;
};

/**
 * Creates a minimal Express-like response for middleware unit tests.
 */
function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    type: jest.fn(() => res),
    send: jest.fn((body: string) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

describe('SigV4Middleware IAM enforce', () => {
  let middleware: SigV4Middleware;
  let authorize: jest.Mock;

  beforeEach(async () => {
    authorize = jest.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SigV4Middleware,
        {
          provide: getRepositoryToken(ServiceAccountEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(AdminUserEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: StorageService,
          useValue: {
            bucketExistsOnDisk: jest.fn(),
            isBucketPublicRead: jest.fn(),
          },
        },
        {
          provide: IamPolicyService,
          useValue: { authorize },
        },
      ],
    }).compile();

    middleware = module.get(SigV4Middleware);
  });

  /**
   * Invokes private enforceIamPolicy for focused unit coverage.
   */
  async function enforce(
    meta: {
      isAdmin: boolean;
      allowedBuckets: string[] | null;
      serviceAccountId: number | null;
    },
    req: {
      method: string;
      url: string;
      headers: Record<string, string>;
      query: Record<string, unknown>;
    },
    bucket: string | null,
  ): Promise<{ ok: boolean; res: MockResponse }> {
    const res = createMockRes();
    const ok = await (
      middleware as unknown as {
        enforceIamPolicy: (
          r: unknown,
          s: unknown,
          m: unknown,
          b: string | null,
        ) => Promise<boolean>;
      }
    ).enforceIamPolicy(req, res, meta, bucket);
    return { ok, res };
  }

  it('skips authorize for admin principals', async () => {
    const { ok } = await enforce(
      { isAdmin: true, allowedBuckets: null, serviceAccountId: null },
      {
        method: 'GET',
        url: '/photos/a.jpg',
        headers: { host: 'localhost' },
        query: {},
      },
      'photos',
    );
    expect(ok).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('calls authorize for service accounts and allows when authorize returns true', async () => {
    authorize.mockResolvedValue(true);
    const { ok } = await enforce(
      { isAdmin: false, allowedBuckets: null, serviceAccountId: 7 },
      {
        method: 'GET',
        url: '/photos/a.jpg',
        headers: { host: 'localhost' },
        query: {},
      },
      'photos',
    );
    expect(ok).toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      serviceAccountId: 7,
      allowedBuckets: null,
      action: 's3:GetObject',
      bucket: 'photos',
      key: 'a.jpg',
    });
  });

  it('returns XML AccessDenied when authorize denies', async () => {
    authorize.mockResolvedValue(false);
    const { ok, res } = await enforce(
      { isAdmin: false, allowedBuckets: null, serviceAccountId: 7 },
      {
        method: 'PUT',
        url: '/photos/a.jpg',
        headers: { host: 'localhost' },
        query: {},
      },
      'photos',
    );
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('<Code>AccessDenied</Code>');
  });

  it('skips authorize for ListBuckets (mapped null)', async () => {
    const { ok } = await enforce(
      { isAdmin: false, allowedBuckets: null, serviceAccountId: 7 },
      {
        method: 'GET',
        url: '/',
        headers: { host: 'localhost' },
        query: {},
      },
      null,
    );
    expect(ok).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
  });
});
