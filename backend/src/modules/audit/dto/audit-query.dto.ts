import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';

/**
 * Query parameters for paginated audit log listing.
 */
export class AuditQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by action code' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by actor name (substring)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actorName?: string;

  @ApiPropertyOptional({
    description: 'Inclusive start of created_at range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end of created_at range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
