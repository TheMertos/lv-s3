import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Refresh token (optional when sent via HttpOnly cookie)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
