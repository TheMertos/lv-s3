import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  mapHttpExceptionToApiError,
  mapUnknownErrorToApiError,
} from './api-error.util';

/**
 * Formats all HTTP and unexpected errors as `{ code, message, details?, correlationId? }`.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    if (res.headersSent) return;

    const correlationId = req.correlationId;

    if (exception instanceof HttpException) {
      const { status, body } = mapHttpExceptionToApiError(
        exception,
        correlationId,
      );
      if (status === HttpStatus.TOO_MANY_REQUESTS && body.retryAfterSeconds) {
        res.setHeader('Retry-After', String(body.retryAfterSeconds));
      }
      const payload: Record<string, unknown> = {
        code: body.code,
        message: body.message,
      };
      if (body.details) payload.details = body.details;
      if (body.correlationId) payload.correlationId = body.correlationId;
      res.status(status).json(payload);
      return;
    }

    this.logger.error(
      `Unhandled error correlationId=${correlationId ?? 'n/a'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    const { status, body } = mapUnknownErrorToApiError(correlationId);
    res.status(status).json(body);
  }
}
