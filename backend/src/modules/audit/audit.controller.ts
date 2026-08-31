import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditListResponseDto } from './dto/audit-list-response.dto';
import { ApiStandardErrors } from '../../common/swagger/api-error.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@ApiStandardErrors()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Lists audit log entries with pagination and optional filters.
   */
  @Get()
  @ApiOkResponse({ type: AuditListResponseDto })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  async list(@Query() query: AuditQueryDto): Promise<AuditListResponseDto> {
    return this.audit.list(query);
  }
}
