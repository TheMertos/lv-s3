import {
  ExceptionFilter,
  Catch,
  NotFoundException,
  ArgumentsHost,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as path from 'path';
import * as fs from 'fs';

function isApiPath(p: string): boolean {
  const x = p.split('?')[0];
  return (
    x === '/health' ||
    x.startsWith('/auth') ||
    x.startsWith('/service-accounts') ||
    x.startsWith('/buckets') ||
    x.startsWith('/lifecycle') ||
    x.startsWith('/multipart') ||
    x.startsWith('/audit') ||
    x.startsWith('/docs')
  );
}

/**
 * Serves index.html for client-side routes when static file missing (GET only).
 */
@Catch(NotFoundException)
export class SpaNotFoundFilter implements ExceptionFilter {
  constructor(private readonly publicDir: string) {}

  catch(_exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    if (
      req.method === 'GET' &&
      !isApiPath(req.path) &&
      fs.existsSync(path.join(this.publicDir, 'index.html'))
    ) {
      return res.sendFile(path.join(this.publicDir, 'index.html'));
    }
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Not Found',
      correlationId: req.correlationId,
    });
  }
}
