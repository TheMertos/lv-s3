import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  mapHttpExceptionToApiError,
  mapUnknownErrorToApiError,
} from './api-error.util';

describe('api-error.util', () => {
  it('maps lockout HttpException with code and retryAfterSeconds', () => {
    const locked = new HttpException(
      {
        code: 'LOCKED_OUT',
        message: 'Too many failed attempts. Try again later.',
        retryAfterSeconds: 120,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    const { body } = mapHttpExceptionToApiError(locked, 'corr-1');
    expect(body.code).toBe('LOCKED_OUT');
    expect(body.message).toContain('Too many failed attempts');
    expect(body.retryAfterSeconds).toBe(120);
    expect(body.correlationId).toBe('corr-1');
  });

  it('maps plain UnauthorizedException to UNAUTHORIZED', () => {
    const { status, body } = mapHttpExceptionToApiError(
      new UnauthorizedException(),
      'corr-2',
    );
    expect(status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.correlationId).toBe('corr-2');
  });

  it('maps validation array message to BAD_REQUEST details', () => {
    const ex = new BadRequestException({
      message: ['name must be a string'],
      error: 'Bad Request',
    });
    const { body } = mapHttpExceptionToApiError(ex);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual({ fields: ['name must be a string'] });
  });

  it('maps NotFoundException message', () => {
    const { body } = mapHttpExceptionToApiError(
      new NotFoundException('Bucket not found'),
    );
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Bucket not found');
  });

  it('maps unknown errors to INTERNAL_ERROR', () => {
    const { status, body } = mapUnknownErrorToApiError('corr-3');
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.correlationId).toBe('corr-3');
  });
});
