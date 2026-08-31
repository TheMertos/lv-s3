import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceAccountCreatedDto {
  @ApiProperty()
  accessKey: string;

  @ApiProperty({ description: 'Shown only once' })
  secretKey: string;

  @ApiProperty()
  label: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Allowed bucket names; null means all buckets',
    type: [String],
  })
  allowedBuckets: string[] | null;
}
