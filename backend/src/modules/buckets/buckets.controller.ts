import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  Res,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
  ApiPayloadTooLargeResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BucketsService } from './buckets.service';
import { BucketVisibilityDto } from './dto/bucket-visibility.dto';
import { BucketItemDto } from './dto/bucket-item.dto';
import { ListObjectsQueryDto } from './dto/list-objects-query.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { DeleteFolderDto } from './dto/delete-folder.dto';
import { DeleteObjectDto } from './dto/delete-object.dto';
import { CreateBucketDto } from './dto/create-bucket.dto';
import { BrowseResponseDto } from './dto/browse-response.dto';
import { assertAdminUploadAllowed } from '../../common/upload-validation';
import { AuditService } from '../audit/audit.service';
import {
  MalwareDetectedError,
  MalwareScanFailedError,
} from '../malware/malware-errors';
import { ApiStandardErrors } from '../../common/swagger/api-error.decorator';
import { resolveClientIp } from '../../common/client-ip';

const UPLOAD_LIMIT = 100 * 1024 * 1024;

type AuthedRequest = Request & { user: { userId: number; username?: string } };

@ApiTags('buckets')
@ApiBearerAuth()
@ApiStandardErrors()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('buckets')
export class BucketsController {
  constructor(
    private readonly svc: BucketsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiCreatedResponse({ description: 'Bucket created' })
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateBucketDto,
  ): Promise<{ name: string; encryptAtRest: boolean }> {
    const encryptAtRest = dto.encryptAtRest === true;
    await this.svc.createBucket(dto.name, { encryptAtRest });
    await this.audit.record({
      action: 'BUCKET_CREATE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'bucket',
      resourceId: dto.name,
      metadata: { encryptAtRest },
      ip: resolveClientIp(req, req.ip),
    });
    return { name: dto.name, encryptAtRest };
  }

  @Get()
  @ApiOkResponse({ type: [BucketItemDto] })
  async list(): Promise<BucketItemDto[]> {
    return this.svc.listWithVisibility();
  }

  @Delete(':name')
  @ApiOkResponse({ description: 'Bucket deleted' })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Bucket not empty' })
  async remove(
    @Req() req: AuthedRequest,
    @Param('name') name: string,
  ): Promise<{ ok: true }> {
    const bucket = decodeURIComponent(name);
    await this.svc.deleteBucket(bucket);
    await this.audit.record({
      action: 'BUCKET_DELETE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'bucket',
      resourceId: bucket,
      ip: resolveClientIp(req, req.ip),
    });
    return { ok: true };
  }

  @Put(':name/visibility')
  @ApiOkResponse({ description: 'Updated' })
  @ApiNotFoundResponse()
  async setVisibility(
    @Req() req: AuthedRequest,
    @Param('name') name: string,
    @Body() dto: BucketVisibilityDto,
  ): Promise<{ name: string; publicRead: boolean }> {
    const bucket = decodeURIComponent(name);
    await this.svc.setVisibility(bucket, dto.publicRead);
    await this.audit.record({
      action: 'BUCKET_VISIBILITY',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'bucket',
      resourceId: bucket,
      metadata: { publicRead: dto.publicRead },
      ip: resolveClientIp(req, req.ip),
    });
    return { name: bucket, publicRead: dto.publicRead };
  }

  @Get(':name/objects/download')
  @ApiOkResponse({ description: 'Object bytes (attachment)' })
  @ApiNotFoundResponse()
  async download(
    @Param('name') name: string,
    @Query('key') key: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const bucket = decodeURIComponent(name);
    const k = (key || '').trim();
    if (!k) throw new BadRequestException('key query required');
    const { stream, size, mtime } = await this.svc.openObjectStream(
      bucket,
      decodeURIComponent(k),
    );
    const baseName = k.split('/').pop() || 'download';
    const safe =
      baseName.replace(/[^\w.\-()+@]/g, '_').slice(0, 200) || 'download';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Last-Modified', mtime.toUTCString());
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
    );
    stream.pipe(res);
  }

  @Post(':name/objects/list')
  @ApiOkResponse({ type: BrowseResponseDto })
  @ApiNotFoundResponse()
  async listObjects(
    @Param('name') name: string,
    @Body() dto: ListObjectsQueryDto,
  ): Promise<BrowseResponseDto> {
    return this.svc.browse(
      decodeURIComponent(name),
      dto.prefix ?? '',
      dto.continuationToken,
    );
  }

  @Post(':name/objects/folder')
  @ApiOkResponse({ description: 'Folder created' })
  @ApiNotFoundResponse()
  async createFolder(
    @Param('name') name: string,
    @Body() dto: CreateFolderDto,
  ): Promise<{ path: string }> {
    const bucket = decodeURIComponent(name);
    const path = dto.path.replace(/^\/+/, '').replace(/\/+$/, '');
    const full = path;
    await this.svc.createFolder(bucket, full);
    return { path: full };
  }

  @Delete(':name/objects/folder')
  @ApiOkResponse({ description: 'Folder removed' })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Not empty or not a folder' })
  async deleteFolder(
    @Param('name') name: string,
    @Body() dto: DeleteFolderDto,
  ): Promise<{ ok: true }> {
    const bucket = decodeURIComponent(name);
    const folderPath = dto.path.replace(/^\/+/, '').replace(/\/+$/, '');
    await this.svc.deleteFolder(bucket, folderPath);
    return { ok: true };
  }

  @Post(':name/objects/upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'key'],
      properties: {
        file: { type: 'string', format: 'binary' },
        key: { type: 'string', description: 'Object key (path inside bucket)' },
      },
    },
    description:
      'Max 100 MiB. Content validated via magic bytes; executables rejected.',
  })
  @ApiOkResponse({ description: 'Uploaded' })
  @ApiPayloadTooLargeResponse({ description: 'File exceeds 100 MiB limit' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMIT },
    }),
  )
  async upload(
    @Req() req: AuthedRequest,
    @Param('name') name: string,
    @Body('key') key: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ key: string }> {
    if (!file?.buffer?.length && !file?.size) {
      throw new BadRequestException('file required');
    }
    const k = (key || '').trim().replace(/^\/+/, '');
    if (!k) throw new BadRequestException('key required');
    const buf = file!.buffer ?? Buffer.from([]);
    const detected = assertAdminUploadAllowed(buf, file!.mimetype);
    const bucket = decodeURIComponent(name);
    try {
      await this.svc.putObject(bucket, k, buf);
    } catch (e) {
      if (e instanceof MalwareDetectedError) {
        throw new ForbiddenException({
          code: 'MALWARE_DETECTED',
          message: 'malware detected',
        });
      }
      if (e instanceof MalwareScanFailedError) {
        throw new ServiceUnavailableException({
          code: 'MALWARE_SCAN_FAILED',
          message: 'malware scan failed',
        });
      }
      throw e;
    }
    await this.audit.record({
      action: 'OBJECT_UPLOAD',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'object',
      resourceId: `${bucket}/${k}`,
      metadata: { size: buf.length, detectedMime: detected.mime },
      ip: resolveClientIp(req, req.ip),
    });
    return { key: k };
  }

  @Delete(':name/objects')
  @ApiOkResponse({ description: 'Deleted' })
  @ApiNotFoundResponse()
  async deleteObject(
    @Req() req: AuthedRequest,
    @Param('name') name: string,
    @Body() dto: DeleteObjectDto,
  ): Promise<{ ok: true }> {
    const bucket = decodeURIComponent(name);
    await this.svc.deleteObjectKey(bucket, dto.key);
    await this.audit.record({
      action: 'OBJECT_DELETE',
      actorId: req.user.userId,
      actorName: req.user.username ?? null,
      resourceType: 'object',
      resourceId: `${bucket}/${dto.key}`,
      ip: resolveClientIp(req, req.ip),
    });
    return { ok: true };
  }
}
