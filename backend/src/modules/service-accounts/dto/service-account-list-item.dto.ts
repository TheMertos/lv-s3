import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceAccountListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  accessKey: string;

  @ApiProperty({ nullable: true })
  label: string | null;

  @ApiProperty()
  disabled: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Allowed bucket names; null means all buckets',
    type: [String],
  })
  allowedBuckets: string[] | null;

  @ApiProperty()
  createdAt: Date;
}
