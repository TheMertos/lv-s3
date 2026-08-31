import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsInt,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteMultipartDto {
  @ApiProperty({
    type: [Number],
    description: 'Ordered part numbers to finalize',
  })
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers!: number[];

  @ApiProperty({ description: 'Final key (must match initiated key)' })
  @IsString()
  @MaxLength(2048)
  key!: string;
}
