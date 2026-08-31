import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const health = {
    readiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();
    controller = module.get(HealthController);
  });

  it('returns ok', () => {
    expect(controller.health()).toEqual({ ok: true });
  });

  it('returns readiness from service', async () => {
    const ready = {
      ok: true,
      checks: {
        database: { ok: true },
        storage: { ok: true },
      },
    };
    health.readiness.mockResolvedValue(ready);
    await expect(controller.ready()).resolves.toEqual(ready);
  });
});
