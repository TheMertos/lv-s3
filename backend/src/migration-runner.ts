import { DataSource } from 'typeorm';
import { InitialSchema1730000000000 } from './migrations/1730000000000-InitialSchema';
import { AdminUsername1730100000000 } from './migrations/1730100000000-AdminUsername';
import { AdminS3Keys1730200000000 } from './migrations/1730200000000-AdminS3Keys';
import { MultipartSchema1730300000000 } from './migrations/1730300000000-MultipartSchema';
import { AuditLogSchema1730400000000 } from './migrations/1730400000000-AuditLogSchema';
import { UsedRefreshTokens1730500000000 } from './migrations/1730500000000-UsedRefreshTokens';
import { ServiceAccountAllowedBuckets1730510000000 } from './migrations/1730510000000-ServiceAccountAllowedBuckets';
import { MultipartBigintSizes1730600000000 } from './migrations/1730600000000-MultipartBigintSizes';
import { SharedCounters1730700000000 } from './migrations/1730700000000-SharedCounters';
import { IamPolicies1730800000000 } from './migrations/1730800000000-IamPolicies';
import { resolveDatabaseOptions } from './config/database-config';

/**
 * Runs TypeORM migrations; app must not start if this throws.
 * @returns A promise that resolves after all pending migrations are applied.
 */
export async function runMigrations(): Promise<void> {
  const database = resolveDatabaseOptions();
  const ds = new DataSource({
    ...database,
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
    migrations: [
      InitialSchema1730000000000,
      AdminUsername1730100000000,
      AdminS3Keys1730200000000,
      MultipartSchema1730300000000,
      AuditLogSchema1730400000000,
      UsedRefreshTokens1730500000000,
      ServiceAccountAllowedBuckets1730510000000,
      MultipartBigintSizes1730600000000,
      SharedCounters1730700000000,
      IamPolicies1730800000000,
    ],
    migrationsTableName: 'typeorm_migrations',
  });
  await ds.initialize();
  try {
    await ds.runMigrations();
  } finally {
    await ds.destroy();
  }
}
