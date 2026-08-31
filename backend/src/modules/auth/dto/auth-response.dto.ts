import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiPropertyOptional({
    description:
      'Optional in body when refresh token is set via HttpOnly cookie',
  })
  refreshToken?: string;

  @ApiProperty()
  expiresIn: number;
}
