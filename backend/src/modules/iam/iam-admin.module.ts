import { Module } from '@nestjs/common';
import { IamPoliciesController } from './iam-policies.controller';
import { IamModule } from './iam.module';

/**
 * Admin HTTP surface for IAM policies (JWT). Import only in AdminAppModule.
 * S3AppModule imports {@link IamModule} alone so SigV4 can inject IamPolicyService
 * without registering admin controllers on the S3 port.
 */
@Module({
  imports: [IamModule],
  controllers: [IamPoliciesController],
})
export class IamAdminModule {}
