import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamPolicyEntity } from '../../entities/iam-policy.entity';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { IamPolicyService } from './iam-policy.service';

/**
 * IAM core (service + entities). Safe to import in S3AppModule for SigV4 authorize.
 * Admin REST controllers live in {@link IamAdminModule}.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IamPolicyEntity,
      ServiceAccountPolicyEntity,
      ServiceAccountEntity,
    ]),
  ],
  providers: [IamPolicyService],
  exports: [IamPolicyService],
})
export class IamModule {}
