import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MultipartModule } from '../multipart/multipart.module';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { LifecycleRunnerService } from './lifecycle-runner.service';

@Module({
  imports: [StorageModule, MultipartModule],
  controllers: [LifecycleController],
  providers: [LifecycleService, LifecycleRunnerService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
