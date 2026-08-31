import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

/**
 * Browser hits the S3 endpoint → redirect to the admin/console URL (no XML in the browser tab).
 * Some clients probe with HEAD + Accept: text/html; treat like GET for the same paths.
 * Set BROWSER_REDIRECT_URL (e.g. https://host:9001 when UI is on ADMIN_PORT).
 */
@Injectable()
export class BrowserRedirectMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BrowserRedirectMiddleware.name);

  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const target = this.config.get<string>('BROWSER_REDIRECT_URL')?.trim();
    if (!target) return next();

    const auth = req.headers.authorization || '';
    const looksLikeAws = auth.startsWith('AWS4-HMAC-SHA256');
    if (looksLikeAws) return next();

    const accept = (req.headers.accept || '').toLowerCase();
    const wantsHtml = accept.includes('text/html');
    const method = req.method;
    const path = req.path || '/';

    const isBrowserProbe =
      (method === 'GET' || method === 'HEAD') &&
      wantsHtml &&
      (path === '/' || path === '/favicon.ico' || path === '/robots.txt');

    if (!isBrowserProbe) return next();

    this.logger.debug(`Redirect browser ${path} → ${target}`);
    res.redirect(302, target);
  }
}
