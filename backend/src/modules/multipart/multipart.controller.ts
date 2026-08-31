import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MultipartService } from './multipart.service';
import { InitiateMultipartDto } from './dto/initiate-multipart.dto';
import { CompleteMultipartDto } from './dto/complete-multipart.dto';
import { ListPartsResponseDto } from './dto/list-parts-response.dto';

const PART_LIMIT = 128 * 1024 * 1024;

@ApiTags('multipart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('multipart')
export class MultipartController {
  constructor(private readonly multipart: MultipartService) {}

  /**
   * Starts multipart upload.
   */
  @Post(':bucket/initiate')
  @ApiOkResponse()
  async initiate(
    @Param('bucket') bucket: string,
    @Body() dto: InitiateMultipartDto,
  ): Promise<{
    uploadId: string;
    bucket: string;
    key: string;
    partSize: number | null;
  }> {
    const up = await this.multipart.initiate(
      decodeURIComponent(bucket),
      dto.key,
      dto.partSize,
      dto.totalSize,
    );
    return {
      uploadId: up.uploadId,
      bucket: up.bucket,
      key: up.objectKey,
      partSize: up.partSize,
    };
  }

  /**
   * Uploads one part.
   */
  @Put(':bucket/:uploadId/part/:partNumber')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['part'],
      properties: {
        part: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('part', {
      storage: memoryStorage(),
      limits: { fileSize: PART_LIMIT },
    }),
  )
  @ApiOkResponse()
  async uploadPart(
    @Param('bucket') bucket: string,
    @Param('uploadId') uploadId: string,
    @Param('partNumber') partNumber: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ partNumber: number; etag: string; size: number }> {
    if (!file?.buffer?.length && !file?.size) {
      throw new BadRequestException('part required');
    }
    const pn = parseInt(partNumber, 10);
    const out = await this.multipart.uploadPart(
      decodeURIComponent(bucket),
      uploadId,
      pn,
      file!.buffer ?? Buffer.from([]),
    );
    return { partNumber: pn, ...out };
  }

  /**
   * Lists uploaded parts for one upload id.
   */
  @Get(':bucket/:uploadId/parts')
  @ApiOkResponse({ type: ListPartsResponseDto })
  async listParts(
    @Param('bucket') bucket: string,
    @Param('uploadId') uploadId: string,
  ): Promise<ListPartsResponseDto> {
    const { upload, parts } = await this.multipart.listParts(
      decodeURIComponent(bucket),
      uploadId,
    );
    return {
      uploadId: upload.uploadId,
      bucket: upload.bucket,
      key: upload.objectKey,
      parts: parts.map((p) => ({
        partNumber: p.partNumber,
        size: p.size,
        etag: p.etag,
      })),
    };
  }

  /**
   * Completes multipart upload.
   */
  @Post(':bucket/:uploadId/complete')
  @ApiOkResponse()
  async complete(
    @Param('bucket') bucket: string,
    @Param('uploadId') uploadId: string,
    @Body() dto: CompleteMultipartDto,
  ): Promise<{ key: string; size: number; etag: string }> {
    return this.multipart.complete(
      decodeURIComponent(bucket),
      uploadId,
      dto.key,
      dto.partNumbers,
    );
  }

  /**
   * Aborts multipart upload.
   */
  @Delete(':bucket/:uploadId')
  @ApiOkResponse({ schema: { properties: { ok: { type: 'boolean' } } } })
  async abort(
    @Param('bucket') bucket: string,
    @Param('uploadId') uploadId: string,
  ): Promise<{ ok: true }> {
    await this.multipart.abort(decodeURIComponent(bucket), uploadId);
    return { ok: true };
  }

  /**
   * Lists active multipart uploads for one bucket.
   */
  @Get(':bucket/uploads')
  @ApiOkResponse()
  async listUploads(
    @Param('bucket') bucket: string,
    @Query('status') status?: string,
  ): Promise<{ uploadId: string; key: string; createdAt: string }[]> {
    if (status && status !== 'in_progress') {
      throw new BadRequestException('only status=in_progress is supported');
    }
    const rows = await this.multipart.listActiveUploads(
      decodeURIComponent(bucket),
    );
    return rows.map((r) => ({
      uploadId: r.uploadId,
      key: r.objectKey,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
