import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { resolveDatabaseOptions } from '../../config/database-config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = resolveDatabaseOptions();

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
    }),
  ],
})
export class DatabaseModule {}
