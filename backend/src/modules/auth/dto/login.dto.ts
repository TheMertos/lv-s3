import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Admin username (not email), case-insensitive' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username: allowed chars a-z A-Z 0-9 . _ -',
  })
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}
