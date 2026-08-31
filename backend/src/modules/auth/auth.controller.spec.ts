import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './auth.constants';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getS3AccessKeyMeta: jest.fn(),
    getS3Credentials: jest.fn(),
    rotateS3Credentials: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('login returns tokens on success and sets cookie', async () => {
    const tokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    };
    auth.login.mockResolvedValue(tokens);
    const req = { headers: {} } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;
    await expect(
      controller.login(
        { username: 'admin', password: 'secret' },
        req,
        res,
        '127.0.0.1',
      ),
    ).resolves.toEqual(tokens);
    expect(auth.login).toHaveBeenCalledWith('admin', 'secret', '127.0.0.1');
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
  });

  it('login propagates unauthorized error', async () => {
    auth.login.mockRejectedValue(new UnauthorizedException());
    const req = { headers: {} } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;
    await expect(
      controller.login({ username: 'x', password: 'y' }, req, res, '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh returns new tokens from body', async () => {
    const tokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    };
    auth.refresh.mockResolvedValue(tokens);
    const req = { cookies: {} } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;
    await expect(
      controller.refresh({ refreshToken: 'old' }, req, res),
    ).resolves.toEqual(tokens);
    expect(auth.refresh).toHaveBeenCalledWith('old');
  });

  it('refresh reads token from cookie when body is empty', async () => {
    const tokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    };
    auth.refresh.mockResolvedValue(tokens);
    const req = {
      cookies: { [REFRESH_COOKIE]: 'cookie-token' },
    } as unknown as Request;
    const res = { cookie: jest.fn() } as unknown as Response;
    await expect(controller.refresh({}, req, res)).resolves.toEqual(tokens);
    expect(auth.refresh).toHaveBeenCalledWith('cookie-token');
  });

  it('logout delegates to auth service and clears cookie', async () => {
    auth.logout.mockResolvedValue(undefined);
    const req = { cookies: { [REFRESH_COOKIE]: 'tok' } } as unknown as Request;
    const res = { clearCookie: jest.fn() } as unknown as Response;
    await controller.logout({}, req, res);
    expect(auth.logout).toHaveBeenCalledWith('tok');
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
      path: '/auth',
    });
  });
});
