import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAccountEntity } from '../../entities/service-account.entity';
import { ServiceAccountPolicyEntity } from '../../entities/service-account-policy.entity';
import { IamModule } from '../iam/iam.module';
import { ServiceAccountsService } from './service-accounts.service';
import { ServiceAccountsController } from './service-accounts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceAccountEntity,
      ServiceAccountPolicyEntity,
    ]),
    IamModule,
  ],
  controllers: [ServiceAccountsController],
  providers: [ServiceAccountsService],
  exports: [ServiceAccountsService],
})
export class ServiceAccountsModule {}
