import { z } from 'zod';

const WEAK_JWT_SECRETS = new Set([
  'change-me-access-min-32-chars-please!!',
  'test-access-secret-min-32-characters!',
]);

const WEAK_MASTER_KEYS = new Set([
  '64-hex-or-any-long-secret-for-aes',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

const WEAK_BOOTSTRAP_PASSWORDS = new Set([
  'changeme12345678',
  'changeme',
  'password',
  'admin',
]);

/**
 * Validates required environment variables at startup; throws with a clear message on failure.
 */
export function validateEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'test') return;

  const isProd = nodeEnv === 'production';

  const baseSchema = z.object({
    JWT_ACCESS_SECRET: z.string().min(isProd ? 32 : 16),
    MASTER_ENCRYPTION_KEY: z.string().min(isProd ? 32 : 16),
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    S3_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    S3_PRESIGN_MAX_EXPIRES_SEC: z.coerce
      .number()
      .int()
      .min(60)
      .max(604800)
      .optional(),
    TRUST_PROXY: z.string().optional(),
    ADMIN_SWAGGER: z.string().optional(),
  });

  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }

  if (!isProd) return;

  const jwt = process.env.JWT_ACCESS_SECRET ?? '';
  const master = process.env.MASTER_ENCRYPTION_KEY ?? '';
  if (WEAK_JWT_SECRETS.has(jwt)) {
    throw new Error(
      'JWT_ACCESS_SECRET must not use the default example value in production',
    );
  }
  if (WEAK_MASTER_KEYS.has(master)) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY must not use the default example value in production',
    );
  }

  const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (
    bootstrapPass &&
    WEAK_BOOTSTRAP_PASSWORDS.has(bootstrapPass.toLowerCase())
  ) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD is too weak for production');
  }

  if (process.env.S3_ROOT_ACCESS_KEY || process.env.S3_ROOT_SECRET_KEY) {
    throw new Error(
      'S3_ROOT_ACCESS_KEY / S3_ROOT_SECRET_KEY must not be set in production',
    );
  }
}

/**
 * Resolves whether Swagger UI should be mounted on the admin app.
 */
export function isAdminSwaggerEnabled(): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) return process.env.ADMIN_SWAGGER === 'true';
  return process.env.ADMIN_SWAGGER !== 'false';
}

/**
 * Max clock skew for SigV4 request timestamps (seconds).
 */
export function s3Sigv4MaxSkewSec(): number {
  const raw = process.env.S3_SIGV4_MAX_SKEW_SEC;
  if (!raw) return 900;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

/**
 * Max presigned URL lifetime in seconds (AWS SigV4 default cap: 7 days).
 */
export function presignMaxExpiresSec(): number {
  const raw = process.env.S3_PRESIGN_MAX_EXPIRES_SEC;
  if (!raw) return 604800;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 60 ? Math.min(n, 604800) : 604800;
}

/**
 * Express trust proxy setting when behind a reverse proxy (enables req.ip from X-Forwarded-For).
 */
export function trustProxySetting(): boolean | number | string | undefined {
  const raw = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0') return undefined;
  if (raw === 'true' || raw === '1') return 1;
  const hops = parseInt(raw, 10);
  if (Number.isFinite(hops) && hops > 0) return hops;
  return raw;
}
