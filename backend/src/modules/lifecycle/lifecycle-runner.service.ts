import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LifecycleService } from './lifecycle.service';

@Injectable()
export class LifecycleRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LifecycleRunnerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly lifecycle: LifecycleService,
  ) {}

  /**
   * Starts periodic lifecycle execution.
   */
  onModuleInit(): void {
    const enabled =
      this.config.get<string>('LIFECYCLE_RUNNER_ENABLED') !== 'false';
    if (!enabled) return;
    const intervalMs = parseInt(
      this.config.get<string>('LIFECYCLE_RUNNER_INTERVAL_MS') ?? '60000',
      10,
    );
    this.timer = setInterval(
      () => {
        void this.lifecycle
          .runExpirationOnce()
          .catch((e) => this.logger.error(e));
      },
      Math.max(intervalMs, 5000),
    );
  }

  /**
   * Stops periodic lifecycle execution.
   */
  onModuleDestroy(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
