import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BucketVisibilityDto {
  @ApiProperty({
    description:
      'true = anonymous object GET/HEAD by exact key; listing/writes still need SigV4',
  })
  @IsBoolean()
  publicRead: boolean;
}
