import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { ServiceAccountsService } from './service-accounts.service';

describe('ServiceAccountsService', () => {
  let service: ServiceAccountsService;

  const repoDelete = jest.fn();
  const joinDelete = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    repoDelete.mockResolvedValue({ affected: 1 });
    joinDelete.mockResolvedValue({ affected: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceAccountsService,
        {
          provide: getRepositoryToken(ServiceAccountEntity),
          useValue: { delete: repoDelete },
        },
        {
          provide: getRepositoryToken(ServiceAccountPolicyEntity),
          useValue: { delete: joinDelete },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ServiceAccountsService);
  });

  describe('delete', () => {
    /**
     * Ensures SA delete removes service_account_policies join rows first
     * (mirrors IamPolicyService policy-delete cleanup).
     */
    it('removes join rows before deleting the service account', async () => {
      await service.delete(42);

      expect(joinDelete).toHaveBeenCalledWith({ serviceAccountId: 42 });
      expect(repoDelete).toHaveBeenCalledWith({ id: 42 });
    });
  });
});
