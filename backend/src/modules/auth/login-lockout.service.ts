import {
  Inject,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SHARED_COUNTER_STORE,
  type SharedCounterRecord,
  type SharedCounterStore,
} from '../rate-limit/shared-counter-store';

/** Extra TTL beyond window/lockout so rows outlive the active lock window. */
const TTL_BUFFER_MS = 60_000;

/**
 * Fail2ban-style lockout: per IP + username, sliding window + lockout after max failures.
 * State is shared across app replicas via SharedCounterStore (DB or Redis).
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  /**
   * @param config - Nest config for ADMIN_LOGIN_* knobs.
   * @param store - Shared counter backend (DB or Redis).
   */
  constructor(
    private readonly config: ConfigService,
    @Inject(SHARED_COUNTER_STORE)
    private readonly store: SharedCounterStore,
  ) {}

  /**
   * Max failed attempts before lockout (ADMIN_LOGIN_MAX_ATTEMPTS, default 5).
   * @returns Parsed positive attempt count.
   */
  private maxAttempts(): number {
    return parseInt(
      this.config.get<string>('ADMIN_LOGIN_MAX_ATTEMPTS') ?? '5',
      10,
    );
  }

  /**
   * Lockout duration in ms (ADMIN_LOGIN_LOCKOUT_MINUTES, default 15).
   * @returns Duration in milliseconds.
   */
  private lockoutMs(): number {
    const min = parseInt(
      this.config.get<string>('ADMIN_LOGIN_LOCKOUT_MINUTES') ?? '15',
      10,
    );
    return min * 60 * 1000;
  }

  /**
   * Failure counting window in ms (ADMIN_LOGIN_WINDOW_MINUTES, default 15).
   * @returns Window length in milliseconds.
   */
  private windowMs(): number {
    const min = parseInt(
      this.config.get<string>('ADMIN_LOGIN_WINDOW_MINUTES') ?? '15',
      10,
    );
    return min * 60 * 1000;
  }

  /**
   * TTL for store writes: max(window, lockout) plus a small buffer.
   * @returns TTL in milliseconds.
   */
  private ttlMs(): number {
    return Math.max(this.windowMs(), this.lockoutMs()) + TTL_BUFFER_MS;
  }

  /**
   * Logical store keys for IP and username dimensions.
   * @param ip - Client IP address.
   * @param username - Username (normalized by caller when needed).
   * @returns Pair of `lockout:ip:…` / `lockout:user:…` keys.
   */
  private keys(ip: string, username: string): [string, string] {
    return [`lockout:ip:${ip}`, `lockout:user:${username.toLowerCase()}`];
  }

  /**
   * Throws HttpException 429 LOCKED_OUT if IP or username is locked out.
   * @param ip - Client IP address.
   * @param username - Login username.
   */
  async assertNotLocked(ip: string, username: string): Promise<void> {
    const now = Date.now();
    for (const key of this.keys(ip, username)) {
      const e = await this.store.get(key);
      if (e && e.lockedUntil > now) {
        const retrySec = Math.ceil((e.lockedUntil - now) / 1000);
        this.logger.warn(
          `Login blocked: lockout active key=${key} ip=${ip} user="${username}" retryAfterSec=${retrySec}`,
        );
        throw new HttpException(
          {
            code: 'LOCKED_OUT',
            message: 'Too many failed attempts. Try again later.',
            retryAfterSeconds: retrySec,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * Records a failed login; may set lockout on IP and username keys.
   * Uses atomic store.mutate so concurrent failures cannot lose increments.
   * @param ip - Client IP address.
   * @param username - Login username.
   */
  async recordFailure(ip: string, username: string): Promise<void> {
    const now = Date.now();
    const windowMs = this.windowMs();
    const max = this.maxAttempts();
    const lockMs = this.lockoutMs();
    const ttl = this.ttlMs();

    for (const key of this.keys(ip, username)) {
      await this.store.mutate(key, ttl, (current) => {
        let base: SharedCounterRecord;
        if (!current || now - current.firstAt > windowMs) {
          base = { failures: 0, firstAt: now, lockedUntil: 0 };
        } else {
          base = current;
        }
        const next: SharedCounterRecord = {
          failures: base.failures + 1,
          firstAt: base.firstAt,
          lockedUntil: base.lockedUntil,
        };
        if (next.failures >= max) {
          next.lockedUntil = now + lockMs;
          this.logger.warn(
            `Login lockout triggered key=${key} failures=${next.failures} windowMin=${windowMs / 60000} lockMin=${lockMs / 60000}`,
          );
        }
        return next;
      });
    }
  }

  /**
   * Clears failure counters on successful login (both keys).
   * @param ip - Client IP address.
   * @param username - Login username.
   */
  async recordSuccess(ip: string, username: string): Promise<void> {
    for (const key of this.keys(ip, username)) {
      await this.store.delete(key);
    }
  }
}
