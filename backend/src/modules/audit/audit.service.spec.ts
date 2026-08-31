import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { runWithCorrelationId } from '../../common/correlation-context';

describe('AuditService', () => {
  let service: AuditService;
  const save = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    save.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLogEntity),
          useValue: { save },
        },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('persists audit events with correlation ID from context', async () => {
    await runWithCorrelationId('corr-audit', async () => {
      await service.record({
        action: 'BUCKET_CREATE',
        actorId: 1,
        actorName: 'admin',
        resourceType: 'bucket',
        resourceId: 'demo',
      });
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BUCKET_CREATE',
        actorId: 1,
        correlationId: 'corr-audit',
      }),
    );
  });

  it('does not throw when persistence fails', async () => {
    save.mockRejectedValue(new Error('db down'));
    await expect(
      service.record({ action: 'LOGIN_SUCCESS' }),
    ).resolves.toBeUndefined();
  });
});
