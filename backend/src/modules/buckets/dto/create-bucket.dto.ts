import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBucketDto {
  @ApiProperty({ example: 'my-app-uploads' })
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/i, {
    message: 'name: S3-style bucket name',
  })
  name!: string;

  @ApiPropertyOptional({
    description:
      'If true, object bytes are sealed on disk (AES-256-CTR + HMAC); only at bucket creation; cannot enable public read.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  encryptAtRest?: boolean;
}
