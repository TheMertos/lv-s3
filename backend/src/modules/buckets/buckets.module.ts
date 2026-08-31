import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BucketsService } from './buckets.service';
import { BucketsController } from './buckets.controller';

@Module({
  imports: [StorageModule],
  controllers: [BucketsController],
  providers: [BucketsService],
})
export class BucketsModule {}
