import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DeleteFolderDto {
  @ApiProperty({
    description: 'Folder path under bucket (no trailing slash)',
    example: 'test123',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  path!: string;
}
