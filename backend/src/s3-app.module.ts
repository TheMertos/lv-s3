import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './modules/database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { MultipartModule } from './modules/multipart/multipart.module';
import { IamModule } from './modules/iam/iam.module';
import { ServiceAccountEntity } from './entities/service-account.entity';
import { AdminUserEntity } from './entities/admin-user.entity';
import { SigV4Middleware } from './modules/s3-api/sigv4.middleware';
import { BrowserRedirectMiddleware } from './modules/s3-api/browser-redirect.middleware';
import { S3Controller } from './modules/s3-api/s3.controller';
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
            name: 's3',
            ttl: parseInt(c.get<string>('S3_THROTTLE_TTL_MS') ?? '60000', 10),
            limit: parseInt(c.get<string>('S3_THROTTLE_LIMIT') ?? '300', 10),
          },
        ] as const,
      }),
    }),
    StorageModule,
    MultipartModule,
    IamModule,
    TypeOrmModule.forFeature([ServiceAccountEntity, AdminUserEntity]),
  ],
  controllers: [S3Controller],
  providers: [
    SigV4Middleware,
    BrowserRedirectMiddleware,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class S3AppModule implements NestModule {
  configure(c: MiddlewareConsumer) {
    c.apply(BrowserRedirectMiddleware, SigV4Middleware).forRoutes(S3Controller);
  }
}
