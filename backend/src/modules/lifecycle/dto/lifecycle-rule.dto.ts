import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class LifecycleRuleDto {
  @ApiProperty({ description: 'Client-defined stable rule id' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'id: allowed a-z A-Z 0-9 . _ -' })
  id!: string;

  @ApiProperty({ description: 'Whether this rule is active' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Applies only to object keys starting with this prefix',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^$|^[a-zA-Z0-9._\-\/]+$/, { message: 'prefix: invalid' })
  prefix?: string;

  @ApiPropertyOptional({
    description: 'Delete objects older than N days',
    minimum: 1,
    maximum: 3650,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expirationDays?: number;

  @ApiPropertyOptional({
    description: 'Abort multipart uploads older than N days',
    minimum: 1,
    maximum: 3650,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  abortMultipartAfterDays?: number;
}
