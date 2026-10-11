import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AdminUserEntity } from '../../entities/admin-user.entity';
import { RefreshTokenEntity } from '../../entities/refresh-token.entity';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { MultipartUploadEntity } from '../../entities/multipart-upload.entity';
import { MultipartPartEntity } from '../../entities/multipart-part.entity';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { UsedRefreshTokenEntity } from '../../entities/used-refresh-token.entity';
import { SharedCounterEntity } from '../../entities/shared-counter.entity';
import { IamPolicyEntity } from '../../entities/iam-policy.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import {
  makeSqliteTransactionsSafe,
  resolveDatabaseOptions,
} from '../../config/database-config';

/**
 * The SQLite data source both apps of this process use. Two connections to one file would wait on each other's locks
 * inside the same process and could time out with SQLITE_BUSY; one connection has nothing to wait for.
 */
let sharedSqlite: Promise<DataSource> | null = null;

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = resolveDatabaseOptions();
        if (database.type === 'sqlite') makeSqliteTransactionsSafe();

        return {
          ...database,
          entities: [
            AdminUserEntity,
            RefreshTokenEntity,
            ServiceAccountEntity,
            MultipartUploadEntity,
            MultipartPartEntity,
            AuditLogEntity,
            UsedRefreshTokenEntity,
            SharedCounterEntity,
            IamPolicyEntity,
            ServiceAccountPolicyEntity,
          ],
          synchronize:
            config.get<string>('TYPEORM_SYNC') === 'true' &&
            process.env.NODE_ENV !== 'production',
          logging: false,
        };
      },
      dataSourceFactory: async (options?: DataSourceOptions) => {
        if (options?.type !== 'sqlite') return new DataSource(options!);
        const kept = await sharedSqlite?.catch(() => null);
        if (kept?.isInitialized) return kept;
        // First app of the process, or the last one was shut down or failed to connect.
        sharedSqlite = new DataSource(options).initialize();
        return sharedSqlite;
      },
    }),
  ],
})
export class DatabaseModule {}
