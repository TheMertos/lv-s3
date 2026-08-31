import { ApiProperty } from '@nestjs/swagger';

/**
 * Admin API response for a stored IAM policy (document as parsed object).
 */
export class IamPolicyDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: 'Parsed IAM policy document',
    type: 'object',
    additionalProperties: true,
  })
  document!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
