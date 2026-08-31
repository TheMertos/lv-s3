import { prefixedRedisKey, resolveRedisKeyPrefix } from './redis-key-prefix';

describe('resolveRedisKeyPrefix', () => {
  it('returns default lv-s3: when env value is unset', () => {
    expect(resolveRedisKeyPrefix()).toBe('lv-s3:');
    expect(resolveRedisKeyPrefix(undefined)).toBe('lv-s3:');
  });

  it('returns default lv-s3: when env value is empty or whitespace', () => {
    expect(resolveRedisKeyPrefix('')).toBe('lv-s3:');
    expect(resolveRedisKeyPrefix('   ')).toBe('lv-s3:');
  });

  it('keeps a custom prefix that already ends with a colon', () => {
    expect(resolveRedisKeyPrefix('myapp:')).toBe('myapp:');
    expect(resolveRedisKeyPrefix('prod:lv-s3:')).toBe('prod:lv-s3:');
  });

  it('appends a trailing colon when the custom prefix lacks one', () => {
    expect(resolveRedisKeyPrefix('myapp')).toBe('myapp:');
    expect(resolveRedisKeyPrefix('lv-s3')).toBe('lv-s3:');
  });
});

describe('prefixedRedisKey', () => {
  it('joins prefix and key without inserting extra separators', () => {
    expect(prefixedRedisKey('lv-s3:', 'lockout:ip:1.2.3.4')).toBe(
      'lv-s3:lockout:ip:1.2.3.4',
    );
    expect(prefixedRedisKey('myapp:', 'throttle:admin:10.0.0.1')).toBe(
      'myapp:throttle:admin:10.0.0.1',
    );
  });
});
