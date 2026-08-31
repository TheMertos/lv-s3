import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ schema: { properties: { ok: { type: 'boolean' } } } })
  health() {
    return { ok: true };
  }

  @Get('ready')
  @ApiOkResponse({
    schema: {
      properties: {
        ok: { type: 'boolean' },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                error: { type: 'string', nullable: true },
              },
            },
            storage: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                error: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  })
  async ready() {
    return this.healthService.readiness();
  }
}
