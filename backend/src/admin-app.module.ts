import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './modules/database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { ServiceAccountsModule } from './modules/service-accounts/service-accounts.module';
import { BucketsModule } from './modules/buckets/buckets.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { MultipartModule } from './modules/multipart/multipart.module';
import { AuditModule } from './modules/audit/audit.module';
import { IamAdminModule } from './modules/iam/iam-admin.module';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import {
  SHARED_COUNTER_STORE,
  type SharedCounterStore,
} from './modules/rate-limit/shared-counter-store';
import { ThrottlerSharedStorage } from './modules/rate-limit/throttler-shared.storage';
import { MalwareModule } from './modules/malware/malware.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RateLimitModule,
    MalwareModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RateLimitModule],
      inject: [ConfigService, SHARED_COUNTER_STORE],
      useFactory: (c: ConfigService, store: SharedCounterStore) => ({
        storage: new ThrottlerSharedStorage(store),
        throttlers: [
          {
            name: 'admin',
            ttl: parseInt(
              c.get<string>('ADMIN_THROTTLE_TTL_MS') ?? '60000',
              10,
            ),
            limit: parseInt(c.get<string>('ADMIN_THROTTLE_LIMIT') ?? '120', 10),
          },
        ] as const,
      }),
    }),
    StorageModule,
    AuditModule,
    AuthModule,
    ServiceAccountsModule,
    IamAdminModule,
    BucketsModule,
    MultipartModule,
    LifecycleModule,
  ],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AdminAppModule implements NestModule {
  /**
   * Registers correlation ID and structured request logging for all routes.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
  }
}
