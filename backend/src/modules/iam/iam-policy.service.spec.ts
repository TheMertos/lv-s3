import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IamPolicyEntity } from '../../entities/iam-policy.entity';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { IamPolicyService } from './iam-policy.service';

describe('IamPolicyService', () => {
  let service: IamPolicyService;

  const policySave = jest.fn();
  const policyFind = jest.fn();
  const policyFindOne = jest.fn();
  const policyDelete = jest.fn();

  const joinFind = jest.fn();
  const joinFindOne = jest.fn();
  const joinSave = jest.fn();
  const joinDelete = jest.fn();

  const saFindOne = jest.fn();

  const validDocument = {
    Version: '2012-10-17' as const,
    Statement: [
      {
        Effect: 'Allow' as const,
        Action: 's3:GetObject' as const,
        Resource: ['arn:lv-s3:::photos', 'arn:lv-s3:::photos/*'],
      },
    ],
  };

  const getOnlyPolicy: IamPolicyEntity = {
    id: 1,
    name: 'get-only',
    document: JSON.stringify(validDocument),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const wildcardPolicy: IamPolicyEntity = {
    id: 2,
    name: 'all-actions',
    document: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 's3:*',
          Resource: ['arn:lv-s3:::photos', 'arn:lv-s3:::photos/*'],
        },
      ],
    }),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    policySave.mockImplementation(async (entity: Partial<IamPolicyEntity>) => ({
      id: entity.id ?? 1,
      name: entity.name ?? 'policy',
      document: entity.document ?? JSON.stringify(validDocument),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }));
    policyFind.mockResolvedValue([]);
    policyFindOne.mockResolvedValue(null);
    policyDelete.mockResolvedValue({ affected: 1 });

    joinFind.mockResolvedValue([]);
    joinFindOne.mockResolvedValue(null);
    joinSave.mockResolvedValue({});
    joinDelete.mockResolvedValue({ affected: 1 });

    saFindOne.mockResolvedValue({ id: 10 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IamPolicyService,
        {
          provide: getRepositoryToken(IamPolicyEntity),
          useValue: {
            save: policySave,
            find: policyFind,
            findOne: policyFindOne,
            delete: policyDelete,
          },
        },
        {
          provide: getRepositoryToken(ServiceAccountPolicyEntity),
          useValue: {
            find: joinFind,
            findOne: joinFindOne,
            save: joinSave,
            delete: joinDelete,
          },
        },
        {
          provide: getRepositoryToken(ServiceAccountEntity),
          useValue: { findOne: saFindOne },
        },
      ],
    }).compile();

    service = module.get(IamPolicyService);
  });

  describe('create', () => {
    it('validates and persists the policy document', async () => {
      const result = await service.create('read-photos', validDocument);

      expect(policySave).toHaveBeenCalledWith({
        name: 'read-photos',
        document: JSON.stringify(validDocument),
      });
      expect(result.name).toBe('read-photos');
    });

    it('rejects invalid policy documents', async () => {
      await expect(
        service.create('bad', {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: 's3:CreateBucket',
              Resource: 'arn:lv-s3:::photos',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(policySave).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes join rows before deleting the policy', async () => {
      policyFindOne.mockResolvedValue(getOnlyPolicy);

      await service.delete(1);

      expect(joinDelete).toHaveBeenCalledWith({ policyId: 1 });
      expect(policyDelete).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws when the policy does not exist', async () => {
      policyFindOne.mockResolvedValue(null);

      await expect(service.delete(99)).rejects.toThrow(NotFoundException);
      expect(joinDelete).not.toHaveBeenCalled();
    });
  });

  describe('attach', () => {
    it('creates a join row when policy and service account exist', async () => {
      policyFindOne.mockResolvedValue(getOnlyPolicy);
      joinFindOne.mockResolvedValue(null);

      await service.attach(1, 10);

      expect(saFindOne).toHaveBeenCalledWith({ where: { id: 10 } });
      expect(joinSave).toHaveBeenCalledWith({
        policyId: 1,
        serviceAccountId: 10,
      });
    });

    it('throws when the service account is missing', async () => {
      policyFindOne.mockResolvedValue(getOnlyPolicy);
      saFindOne.mockResolvedValue(null);

      await expect(service.attach(1, 10)).rejects.toThrow(NotFoundException);
      expect(joinSave).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('denies PutObject when only GetObject is allowed', async () => {
      joinFind.mockResolvedValue([{ serviceAccountId: 10, policyId: 1 }]);
      policyFind.mockResolvedValue([getOnlyPolicy]);

      const allowed = await service.authorize({
        serviceAccountId: 10,
        allowedBuckets: null,
        action: 's3:PutObject',
        bucket: 'photos',
        key: 'file.jpg',
      });

      expect(allowed).toBe(false);
    });

    it('allows GetObject when policy permits read on the object ARN', async () => {
      joinFind.mockResolvedValue([{ serviceAccountId: 10, policyId: 1 }]);
      policyFind.mockResolvedValue([getOnlyPolicy]);

      const allowed = await service.authorize({
        serviceAccountId: 10,
        allowedBuckets: null,
        action: 's3:GetObject',
        bucket: 'photos',
        key: 'file.jpg',
      });

      expect(allowed).toBe(true);
    });

    it('allows requests when no policies are attached and bucket allow-list passes', async () => {
      joinFind.mockResolvedValue([]);

      await expect(
        service.authorize({
          serviceAccountId: 10,
          allowedBuckets: null,
          action: 's3:PutObject',
          bucket: 'photos',
        }),
      ).resolves.toBe(true);

      await expect(
        service.authorize({
          serviceAccountId: 10,
          allowedBuckets: ['photos'],
          action: 's3:GetObject',
          bucket: 'photos',
          key: 'a.txt',
        }),
      ).resolves.toBe(true);
    });

    it('denies when bucket is not in allowedBuckets even if policy allows s3:*', async () => {
      joinFind.mockResolvedValue([{ serviceAccountId: 10, policyId: 2 }]);
      policyFind.mockResolvedValue([wildcardPolicy]);

      const allowed = await service.authorize({
        serviceAccountId: 10,
        allowedBuckets: ['other-bucket'],
        action: 's3:GetObject',
        bucket: 'photos',
        key: 'file.jpg',
      });

      expect(allowed).toBe(false);
      expect(joinFind).not.toHaveBeenCalled();
    });

    it('denies when allowedBuckets is an empty array', async () => {
      const allowed = await service.authorize({
        serviceAccountId: 10,
        allowedBuckets: [],
        action: 's3:GetObject',
        bucket: 'photos',
      });

      expect(allowed).toBe(false);
      expect(joinFind).not.toHaveBeenCalled();
    });

    it('canListBucket delegates to authorize with s3:ListBucket', async () => {
      joinFind.mockResolvedValue([]);
      await expect(
        service.canListBucket({
          serviceAccountId: 10,
          allowedBuckets: null,
          bucket: 'photos',
        }),
      ).resolves.toBe(true);
    });
  });
});
