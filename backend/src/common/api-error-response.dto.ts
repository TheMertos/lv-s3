import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Unified API error body returned by the global exception filter.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Structured validation or domain details (not for end-user display)',
    example: { fields: ['name must be a string'] },
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  correlationId?: string;
}
