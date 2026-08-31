import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminUserEntity } from '../../entities/admin-user.entity';
import { RefreshTokenEntity } from '../../entities/refresh-token.entity';
import { UsedRefreshTokenEntity } from '../../entities/used-refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { LoginLockoutService } from './login-lockout.service';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminUserEntity,
      RefreshTokenEntity,
      UsedRefreshTokenEntity,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    RateLimitModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginLockoutService],
  exports: [AuthService],
})
export class AuthModule {}
