import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LifecycleService } from './lifecycle.service';
import { GetBucketLifecycleResponseDto } from './dto/get-bucket-lifecycle-response.dto';
import { PutBucketLifecycleDto } from './dto/put-bucket-lifecycle.dto';

@ApiTags('lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('lifecycle')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  /**
   * Returns lifecycle rules for a bucket.
   */
  @Get(':bucket')
  @ApiOkResponse({ type: GetBucketLifecycleResponseDto })
  async get(
    @Param('bucket') bucket: string,
  ): Promise<GetBucketLifecycleResponseDto> {
    const name = decodeURIComponent(bucket);
    return {
      bucket: name,
      rules: await this.lifecycle.getRules(name),
    };
  }

  /**
   * Replaces lifecycle rules for a bucket.
   */
  @Put(':bucket')
  @ApiOkResponse({ type: GetBucketLifecycleResponseDto })
  async put(
    @Param('bucket') bucket: string,
    @Body() dto: PutBucketLifecycleDto,
  ): Promise<GetBucketLifecycleResponseDto> {
    const name = decodeURIComponent(bucket);
    await this.lifecycle.putRules(name, dto.rules);
    return {
      bucket: name,
      rules: await this.lifecycle.getRules(name),
    };
  }

  /**
   * Removes all lifecycle rules for a bucket.
   */
  @Delete(':bucket')
  @ApiOkResponse({ schema: { properties: { ok: { type: 'boolean' } } } })
  async remove(@Param('bucket') bucket: string): Promise<{ ok: true }> {
    await this.lifecycle.deleteRules(decodeURIComponent(bucket));
    return { ok: true };
  }
}
