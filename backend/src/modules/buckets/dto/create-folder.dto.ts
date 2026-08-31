import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateFolderDto {
  @ApiProperty({
    description: 'Folder path under bucket (e.g. photos or photos/2024)',
    example: 'test123',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  path!: string;
}
