import { ApiProperty } from '@nestjs/swagger';
import { AuditLogItemDto } from './audit-log-item.dto';

/**
 * Paginated audit log list response.
 */
export class AuditListResponseDto {
  @ApiProperty({ type: [AuditLogItemDto] })
  items: AuditLogItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}
