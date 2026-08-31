import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One audit log entry in a list response.
 */
export class AuditLogItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  action: string;

  @ApiProperty()
  actorType: string;

  @ApiPropertyOptional({ nullable: true })
  actorId: number | null;

  @ApiPropertyOptional({ nullable: true })
  actorName: string | null;

  @ApiPropertyOptional({ nullable: true })
  resourceType: string | null;

  @ApiPropertyOptional({ nullable: true })
  resourceId: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  ip: string | null;

  @ApiPropertyOptional({ nullable: true })
  correlationId: string | null;

  @ApiProperty()
  createdAt: Date;
}
