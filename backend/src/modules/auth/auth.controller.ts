import {
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  Req,
  Res,
  Ip,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiTooManyRequestsResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { S3CredentialsDto } from './dto/s3-credentials.dto';
import { S3AccessKeyMetaDto } from './dto/s3-access-key-meta.dto';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { resolveClientIp } from '../../common/client-ip';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ApiStandardErrors } from '../../common/swagger/api-error.decorator';
import { ApiErrorResponseDto } from '../../common/api-error-response.dto';
import { REFRESH_COOKIE } from './auth.constants';

const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cookie options for the refresh token HttpOnly cookie.
 */
function refreshCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: string;
} {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE_MS,
    path: '/auth',
  };
}

@ApiTags('auth')
@Controller('auth')
@ApiStandardErrors()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ admin: { limit: 10, ttl: 60000 } })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ApiErrorResponseDto,
    description: 'Rate limit or lockout',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    const clientIp = resolveClientIp(req, ip);
    const tokens = await this.auth.login(dto.username, dto.password, clientIp);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ admin: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException();
    }
    const tokens = await this.auth.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken;
    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  @Get('s3-credentials/access-key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOkResponse({ type: S3AccessKeyMetaDto })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  async s3AccessKeyMeta(
    @Req() req: Request & { user: { userId: number } },
  ): Promise<S3AccessKeyMetaDto> {
    return this.auth.getS3AccessKeyMeta(Number(req.user.userId));
  }

  @Get('s3-credentials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOkResponse({ type: S3CredentialsDto })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  async s3Credentials(
    @Req() req: Request & { user: { userId: number } },
  ): Promise<S3CredentialsDto> {
    return this.auth.getS3Credentials(Number(req.user.userId));
  }

  @Post('s3-credentials/rotate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Throttle({ admin: { limit: 5, ttl: 3600000 } })
  @ApiOkResponse({ type: S3CredentialsDto })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  async rotateS3(
    @Req() req: Request & { user: { userId: number } },
  ): Promise<S3CredentialsDto> {
    return this.auth.rotateS3Credentials(Number(req.user.userId));
  }
}
