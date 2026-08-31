import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Request body for partially updating an IAM policy.
 */
export class UpdateIamPolicyDto {
  @ApiPropertyOptional({ description: 'Unique policy name', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({
    description: 'IAM policy document (Version + Statement)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;
}
