import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { SharedCounterEntity } from '../../entities/shared-counter.entity';
import {
  resolveRedisKeyPrefix,
  resolveRedisUrl,
} from '../../config/redis-config';
import { DbSharedCounterStore } from './db-shared-counter.store';
import { RedisSharedCounterStore } from './redis-shared-counter.store';
import {
  SHARED_COUNTER_STORE,
  type SharedCounterStore,
} from './shared-counter-store';

/**
 * Internal DI token for the optional ioredis client owned by RateLimitModule.
 */
const RATE_LIMIT_REDIS_CLIENT = Symbol('RATE_LIMIT_REDIS_CLIENT');

/**
 * Quits the module-owned Redis client on Nest shutdown.
 */
@Injectable()
class RateLimitRedisShutdown implements OnModuleDestroy {
  /**
   * @param redis - Optional Redis client from RATE_LIMIT_REDIS_CLIENT.
   */
  constructor(
    @Inject(RATE_LIMIT_REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  /**
   * Quits the Redis client when one was created for this module.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

/**
 * Wires SharedCounterStore: Redis when REDIS_URL is set, otherwise DB table.
 * Exports SHARED_COUNTER_STORE for lockout and Nest throttler storage.
 *
 * When REDIS_URL is set, Redis must be reachable at process start: the client
 * connects eagerly (`lazyConnect: false`) with short connect/command timeouts
 * so a down Redis fails fast instead of hanging Nest bootstrap indefinitely.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SharedCounterEntity])],
  providers: [
    {
      provide: RATE_LIMIT_REDIS_CLIENT,
      useFactory: (): Redis | null => {
        const url = resolveRedisUrl();
        if (!url) return null;
        return new Redis(url, {
          connectTimeout: 5_000,
          commandTimeout: 3_000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: false,
        });
      },
    },
    {
      provide: SHARED_COUNTER_STORE,
      inject: [
        RATE_LIMIT_REDIS_CLIENT,
        getRepositoryToken(SharedCounterEntity),
      ],
      useFactory: (
        redis: Redis | null,
        repo: Repository<SharedCounterEntity>,
      ): SharedCounterStore => {
        if (redis) {
          return new RedisSharedCounterStore(redis, resolveRedisKeyPrefix());
        }
        return new DbSharedCounterStore(repo);
      },
    },
    RateLimitRedisShutdown,
  ],
  exports: [SHARED_COUNTER_STORE],
})
export class RateLimitModule {}
