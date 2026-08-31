import { resolveRedisKeyPrefix, resolveRedisUrl } from './redis-config';

describe('resolveRedisUrl', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns null when REDIS_URL is unset', () => {
    delete process.env.REDIS_URL;
    expect(resolveRedisUrl()).toBeNull();
  });

  it('returns null when REDIS_URL is empty or whitespace', () => {
    process.env.REDIS_URL = '';
    expect(resolveRedisUrl()).toBeNull();

    process.env.REDIS_URL = '   ';
    expect(resolveRedisUrl()).toBeNull();
  });

  it('returns the trimmed URL when REDIS_URL is set', () => {
    process.env.REDIS_URL = '  redis://127.0.0.1:6379/0  ';
    expect(resolveRedisUrl()).toBe('redis://127.0.0.1:6379/0');
  });
});

describe('resolveRedisKeyPrefix', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns default lv-s3: when REDIS_KEY_PREFIX is unset', () => {
    delete process.env.REDIS_KEY_PREFIX;
    expect(resolveRedisKeyPrefix()).toBe('lv-s3:');
  });

  it('returns default lv-s3: when REDIS_KEY_PREFIX is empty', () => {
    process.env.REDIS_KEY_PREFIX = '';
    expect(resolveRedisKeyPrefix()).toBe('lv-s3:');
  });

  it('delegates custom prefixes to the rate-limit helper', () => {
    process.env.REDIS_KEY_PREFIX = 'myapp';
    expect(resolveRedisKeyPrefix()).toBe('myapp:');

    process.env.REDIS_KEY_PREFIX = 'prod:lv-s3:';
    expect(resolveRedisKeyPrefix()).toBe('prod:lv-s3:');
  });
});
