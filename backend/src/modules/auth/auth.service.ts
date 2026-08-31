import {
  Injectable,
  UnauthorizedException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AdminUserEntity } from '../../entities/admin-user.entity';
import { RefreshTokenEntity } from '../../entities/refresh-token.entity';
import { UsedRefreshTokenEntity } from '../../entities/used-refresh-token.entity';
import { LoginLockoutService } from './login-lockout.service';
import { encryptSecret, decryptSecret } from '../../common/crypto-secret';
import { AuditService } from '../audit/audit.service';

/**
 * Admin login + S3 API keys (same account for console JWT and SigV4).
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly users: Repository<AdminUserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
    @InjectRepository(UsedRefreshTokenEntity)
    private readonly usedRefreshTokens: Repository<UsedRefreshTokenEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly lockout: LoginLockoutService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generates unique S3 access/secret; secret stored encrypted.
   */
  private newS3KeyPair(): {
    accessKey: string;
    secretKey: string;
    encrypted: string;
  } {
    const master = this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY');
    const accessKey = 'lvadmin' + crypto.randomBytes(8).toString('hex');
    const secretKey = crypto.randomBytes(24).toString('base64url');
    return {
      accessKey,
      secretKey,
      encrypted: encryptSecret(master, secretKey),
    };
  }

  async onModuleInit() {
    const count = await this.users.count();
    if (count === 0) {
      const username =
        this.config.get<string>('ADMIN_BOOTSTRAP_USERNAME') ||
        this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL');
      const password = this.config.get<string>('ADMIN_BOOTSTRAP_PASSWORD');
      if (!username || !password) {
        this.logger.warn(
          'No admin user; set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD',
        );
        return;
      }
      const raw = username.includes('@')
        ? username.split('@')[0]!.trim()
        : username.trim();
      const uname = raw.toLowerCase();
      await this.users.save({
        uuid: crypto.randomUUID(),
        username: uname,
        passwordHash: await argon2.hash(password),
        role: 'admin',
      });
      this.logger.log('Bootstrap admin created');
      return;
    }
  }

  async login(username: string, password: string, clientIp: string) {
    const userNorm = username.trim().toLowerCase();
    await this.lockout.assertNotLocked(clientIp, userNorm);
    const user = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.username) = :name', { name: userNorm })
      .getOne();
    let passwordOk = false;
    let verifyThrew = false;
    if (user) {
      try {
        passwordOk = await argon2.verify(user.passwordHash, password);
      } catch (e) {
        verifyThrew = true;
        this.logger.error(
          `Password verification error for user id=${user.id} ip=${clientIp} (corrupt hash?): ${(e as Error).message}`,
        );
      }
    }
    if (!user) {
      this.logger.warn(
        `Login failed: unknown username ip=${clientIp} user="${userNorm}"`,
      );
    } else if (verifyThrew) {
      this.logger.warn(
        `Login failed: password verification error ip=${clientIp} user="${userNorm}"`,
      );
    } else if (!passwordOk) {
      this.logger.warn(
        `Login failed: wrong password ip=${clientIp} user="${userNorm}"`,
      );
    }
    if (!user || !passwordOk) {
      await this.lockout.recordFailure(clientIp, userNorm);
      throw new UnauthorizedException();
    }
    await this.lockout.recordSuccess(clientIp, userNorm);
    this.logger.log(`Login succeeded ip=${clientIp} user="${user!.username}"`);
    await this.audit.record({
      action: 'LOGIN_SUCCESS',
      actorId: user!.id,
      actorName: user!.username,
      resourceType: 'admin_user',
      resourceId: String(user!.id),
      ip: clientIp,
    });
    return this.issueTokens(user!);
  }

  /**
   * Returns Access Key ID only (safe to show in UI lists; no secret).
   * Returns null when no keys yet — generate via getS3Credentials.
   */
  async getS3AccessKeyMeta(
    userId: number,
  ): Promise<{ accessKey: string | null }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { accessKey: user.adminS3AccessKey ?? null };
  }

  /**
   * Returns admin S3 credentials for CLI/SDK (JWT required).
   */
  async getS3Credentials(
    userId: number,
  ): Promise<{ accessKey: string; secretKey: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.adminS3AccessKey || !user.adminS3SecretEncrypted) {
      const pair = this.newS3KeyPair();
      user.adminS3AccessKey = pair.accessKey;
      user.adminS3SecretEncrypted = pair.encrypted;
      await this.users.save(user);
      return { accessKey: pair.accessKey, secretKey: pair.secretKey };
    }
    const master = this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY');
    return {
      accessKey: user.adminS3AccessKey,
      secretKey: decryptSecret(master, user.adminS3SecretEncrypted),
    };
  }

  /**
   * Rotates admin S3 keys; old keys stop working for SigV4.
   */
  async rotateS3Credentials(
    userId: number,
  ): Promise<{ accessKey: string; secretKey: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const pair = this.newS3KeyPair();
    user.adminS3AccessKey = pair.accessKey;
    user.adminS3SecretEncrypted = pair.encrypted;
    await this.users.save(user);
    await this.audit.record({
      action: 'S3_CREDENTIALS_ROTATE',
      actorId: user.id,
      actorName: user.username,
      resourceType: 'admin_user',
      resourceId: String(user.id),
      metadata: { accessKey: pair.accessKey },
    });
    return { accessKey: pair.accessKey, secretKey: pair.secretKey };
  }

  async refresh(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    return this.dataSource.transaction(async (em) => {
      const row = await em.findOne(RefreshTokenEntity, {
        where: { tokenHash: hash },
        relations: ['user'],
      });
      if (!row) {
        const reused = await em.findOne(UsedRefreshTokenEntity, {
          where: { tokenHash: hash },
        });
        if (reused) {
          await em.delete(RefreshTokenEntity, { userId: reused.userId });
          await this.audit.record({
            action: 'SECURITY_REFRESH_REUSE',
            actorId: reused.userId,
            resourceType: 'admin_user',
            resourceId: String(reused.userId),
          });
          this.logger.warn(
            `Refresh token reuse detected for user id=${reused.userId}`,
          );
        }
        this.logger.warn('Refresh failed: invalid or expired refresh token');
        throw new UnauthorizedException();
      }
      if (row.expiresAt < new Date()) {
        this.logger.warn('Refresh failed: invalid or expired refresh token');
        throw new UnauthorizedException();
      }
      await em.save(UsedRefreshTokenEntity, {
        tokenHash: hash,
        userId: row.userId,
      });
      await em.delete(RefreshTokenEntity, { id: row.id });
      return this.issueTokens(row.user, em);
    });
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.delete({
      tokenHash: this.hashToken(refreshToken),
    });
  }

  private hashToken(t: string): string {
    return crypto.createHash('sha256').update(t).digest('hex');
  }

  private async issueTokens(
    user: AdminUserEntity,
    em?: Repository<RefreshTokenEntity>['manager'],
  ) {
    const accessTtl = 900;
    const refreshTtl = 60 * 60 * 24 * 7;
    const accessToken = this.jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      { expiresIn: accessTtl },
    );
    const refreshRaw = crypto.randomBytes(32).toString('hex');
    const tokens = em ?? this.refreshTokens.manager;
    await tokens.save(RefreshTokenEntity, {
      userId: user.id,
      tokenHash: this.hashToken(refreshRaw),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });
    return { accessToken, refreshToken: refreshRaw, expiresIn: accessTtl };
  }
}
