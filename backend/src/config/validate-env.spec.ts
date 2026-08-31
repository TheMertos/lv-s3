import {
  isAdminSwaggerEnabled,
  presignMaxExpiresSec,
  validateEnv,
} from './validate-env';

describe('validateEnv', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('skips validation in test environment', () => {
    process.env.NODE_ENV = 'test';
    expect(() => validateEnv()).not.toThrow();
  });

  it('rejects weak JWT secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'change-me-access-min-32-chars-please!!';
    process.env.MASTER_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(() => validateEnv()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects S3 root keys in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret-min-32-chars-ok!!';
    process.env.MASTER_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.S3_ROOT_ACCESS_KEY = 'root';
    expect(() => validateEnv()).toThrow(/S3_ROOT/);
  });
});

describe('isAdminSwaggerEnabled', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('disables swagger in production by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_SWAGGER;
    expect(isAdminSwaggerEnabled()).toBe(false);
  });

  it('enables swagger in development by default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ADMIN_SWAGGER;
    expect(isAdminSwaggerEnabled()).toBe(true);
  });
});

describe('presignMaxExpiresSec', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('defaults to 7 days', () => {
    delete process.env.S3_PRESIGN_MAX_EXPIRES_SEC;
    expect(presignMaxExpiresSec()).toBe(604800);
  });
});
