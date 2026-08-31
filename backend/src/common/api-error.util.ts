import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  PayloadTooLargeException,
} from '@nestjs/common';

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  retryAfterSeconds?: number;
};

const STATUS_DEFAULT_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

/**
 * Maps a Nest HTTP exception to the unified API error body.
 */
export function mapHttpExceptionToApiError(
  exception: HttpException,
  correlationId?: string,
): { status: number; body: ApiErrorBody } {
  const status = exception.getStatus();
  const raw = exception.getResponse();
  const base = buildFromRaw(status, raw);
  return {
    status,
    body: {
      ...base,
      correlationId,
    },
  };
}

/**
 * Builds a safe 500 error body for unexpected failures.
 */
export function mapUnknownErrorToApiError(correlationId?: string): {
  status: number;
  body: ApiErrorBody;
} {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId,
    },
  };
}

function buildFromRaw(
  status: number,
  raw: string | object,
): Omit<ApiErrorBody, 'correlationId'> {
  if (typeof raw === 'string') {
    return {
      code: codeForException(status, undefined),
      message: raw,
    };
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.code === 'string' && typeof obj.message === 'string') {
    const out: Omit<ApiErrorBody, 'correlationId'> = {
      code: obj.code,
      message: obj.message,
    };
    if (obj.details && typeof obj.details === 'object') {
      out.details = obj.details as Record<string, unknown>;
    }
    if (typeof obj.retryAfterSeconds === 'number') {
      out.retryAfterSeconds = obj.retryAfterSeconds;
    }
    return out;
  }

  const message = normalizeMessage(obj.message, status);
  const details = validationDetails(obj);
  const code = codeForException(status, exceptionFromStatus(status));
  const out: Omit<ApiErrorBody, 'correlationId'> = { code, message };
  if (details) out.details = details;
  if (typeof obj.retryAfterSeconds === 'number') {
    out.retryAfterSeconds = obj.retryAfterSeconds;
  }
  return out;
}

function codeForException(
  status: number,
  exception: HttpException | undefined,
): string {
  if (exception instanceof BadRequestException) return 'BAD_REQUEST';
  if (exception instanceof UnauthorizedException) return 'UNAUTHORIZED';
  if (exception instanceof ForbiddenException) return 'FORBIDDEN';
  if (exception instanceof NotFoundException) return 'NOT_FOUND';
  if (exception instanceof ConflictException) return 'CONFLICT';
  if (exception instanceof PayloadTooLargeException) {
    return 'PAYLOAD_TOO_LARGE';
  }
  return STATUS_DEFAULT_CODE[status] ?? 'HTTP_ERROR';
}

function exceptionFromStatus(status: number): HttpException | undefined {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return new BadRequestException();
    case HttpStatus.UNAUTHORIZED:
      return new UnauthorizedException();
    case HttpStatus.FORBIDDEN:
      return new ForbiddenException();
    case HttpStatus.NOT_FOUND:
      return new NotFoundException();
    case HttpStatus.CONFLICT:
      return new ConflictException();
    default:
      return undefined;
  }
}

function normalizeMessage(message: unknown, status: number): string {
  if (typeof message === 'string' && message.length > 0) return message;
  if (Array.isArray(message) && message.length > 0) {
    return 'Validation failed';
  }
  return STATUS_DEFAULT_CODE[status] ?? 'Request failed';
}

function validationDetails(
  obj: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (Array.isArray(obj.message)) {
    return { fields: obj.message };
  }
  return undefined;
}
