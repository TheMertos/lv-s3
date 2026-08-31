import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class ListObjectsQueryDto {
  @ApiPropertyOptional({
    description: 'Prefix filter (folder path)',
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^$|^[^.\/\\][a-zA-Z0-9._\-\/]*$/, { message: 'prefix: invalid' })
  prefix?: string;

  @ApiPropertyOptional({
    description: 'Continuation token from a previous truncated listing',
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  continuationToken?: string;
}
