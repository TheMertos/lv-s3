import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultipartUploadEntity } from '../../entities/multipart-upload.entity';
import { MultipartPartEntity } from '../../entities/multipart-part.entity';
import { StorageModule } from '../storage/storage.module';
import { MultipartController } from './multipart.controller';
import { MultipartService } from './multipart.service';

@Module({
  imports: [
    StorageModule,
    TypeOrmModule.forFeature([MultipartUploadEntity, MultipartPartEntity]),
  ],
  controllers: [MultipartController],
  providers: [MultipartService],
  exports: [MultipartService],
})
export class MultipartModule {}
