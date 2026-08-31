import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Logs completed admin API requests with method, path, status, and correlation ID.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      this.logger.log(
        JSON.stringify({
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          durationMs: ms,
          correlationId: req.correlationId,
        }),
      );
    });
    next();
  }
}
