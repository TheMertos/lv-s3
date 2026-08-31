import { Request } from 'express';

jest.mock('../config/validate-env', () => ({
  ...jest.requireActual('../config/validate-env'),
  trustProxySetting: jest.fn(),
}));

import { trustProxySetting } from '../config/validate-env';
import { resolveClientIp } from './client-ip';

describe('resolveClientIp', () => {
  const mockTrust = trustProxySetting as jest.MockedFunction<
    typeof trustProxySetting
  >;

  afterEach(() => {
    mockTrust.mockReset();
  });

  it('uses fallback IP when trust proxy is disabled', () => {
    mockTrust.mockReturnValue(undefined);
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: '10.0.0.1',
    } as unknown as Request;
    expect(resolveClientIp(req, '127.0.0.1')).toBe('127.0.0.1');
  });

  it('uses first X-Forwarded-For hop when trust proxy is enabled', () => {
    mockTrust.mockReturnValue(1);
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
      ip: '10.0.0.2',
    } as unknown as Request;
    expect(resolveClientIp(req, '127.0.0.1')).toBe('1.2.3.4');
  });
});
