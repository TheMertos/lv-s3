import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class InitiateMultipartDto {
  @ApiProperty({ description: 'Target object key' })
  @IsString()
  @MaxLength(2048)
  key!: string;

  @ApiPropertyOptional({
    description: 'Preferred part size in bytes',
    minimum: 5 * 1024 * 1024,
  })
  @IsOptional()
  @IsInt()
  @Min(5 * 1024 * 1024)
  @Max(128 * 1024 * 1024)
  partSize?: number;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalSize?: number;
}
