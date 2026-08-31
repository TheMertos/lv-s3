import { Global, Module } from '@nestjs/common';
import { MalwareModule } from '../malware/malware.module';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [MalwareModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
