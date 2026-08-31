import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithCorrelationId } from './correlation-context';

const HEADER = 'x-correlation-id';

/**
 * Assigns a correlation ID per request (from header or generated) for tracing.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[HEADER];
    const correlationId =
      typeof incoming === 'string' && incoming.trim().length > 0
        ? incoming.trim().slice(0, 128)
        : randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    runWithCorrelationId(correlationId, () => next());
  }
}
