import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteObjectDto {
  @ApiProperty({ description: 'Object key to delete' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  key!: string;
}
