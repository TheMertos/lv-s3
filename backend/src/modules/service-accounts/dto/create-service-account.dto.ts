import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class CreateServiceAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({
    description: 'Bucket names this account may access; omit for all buckets',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  allowedBuckets?: string[];
}
