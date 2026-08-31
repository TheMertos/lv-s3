import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for creating an IAM policy.
 */
export class CreateIamPolicyDto {
  @ApiProperty({ description: 'Unique policy name', maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiProperty({
    description: 'IAM policy document (Version + Statement)',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  document!: Record<string, unknown>;
}
