import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, ExceptionFilter } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');
import * as express from 'express';
import * as fs from 'fs';
import { AdminAppModule } from './admin-app.module';
import { S3AppModule } from './s3-app.module';
import { runMigrations } from './migration-runner';
import { SpaNotFoundFilter } from './spa-not-found.filter';
import { ApiExceptionFilter } from './common/api-exception.filter';
import {
  isAdminSwaggerEnabled,
  trustProxySetting,
  validateEnv,
} from './config/validate-env';
import { resolveDatabaseOptions } from './config/database-config';
import * as fsp from 'fs/promises';
import * as path from 'path';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';

const logger = new Logger('Bootstrap');

/**
 * Applies reverse-proxy trust settings to a Nest Express app when configured.
 */
function applyTrustProxy(app: NestExpressApplication): void {
  const setting = trustProxySetting();
  if (setting !== undefined) {
    app.set('trust proxy', setting);
    logger.log(`trust proxy enabled: ${setting}`);
  }
}

async function bootstrap() {
  validateEnv();

  const database = resolveDatabaseOptions();
  const isProd = process.env.NODE_ENV === 'production';

  if (database.type === 'sqlite') {
    await fsp.mkdir(path.dirname(database.database), { recursive: true });
  }
  await runMigrations();
  logger.log('Migrations applied');
  const storageRoot = process.env.STORAGE_ROOT ?? './data/storage';
  await fsp.mkdir(storageRoot, { recursive: true });

  const adminPort = parseInt(process.env.ADMIN_PORT ?? '9001', 10);
  const s3Port = parseInt(process.env.S3_PORT ?? '9000', 10);

  const publicDir = path.join(__dirname, 'public');
  const expressApp = express();
  if (fs.existsSync(publicDir)) {
    expressApp.use(express.static(publicDir));
    logger.log(`Static first: ${publicDir}`);
  }

  const admin = await NestFactory.create<NestExpressApplication>(
    AdminAppModule,
    new ExpressAdapter(expressApp),
  );
  applyTrustProxy(admin);
  admin.enableShutdownHooks();
  admin.use(cookieParser());
  admin.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  admin.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const globalFilters: ExceptionFilter[] = [new ApiExceptionFilter()];
  if (fs.existsSync(publicDir)) {
    globalFilters.push(new SpaNotFoundFilter(publicDir));
  }
  admin.useGlobalFilters(...globalFilters);
  const origin =
    process.env.CORS_ADMIN_ORIGIN ??
    (isProd ? `http://localhost:${adminPort}` : 'http://localhost:5173');
  admin.enableCors({
    origin: origin.split(',').map((o) => o.trim()),
    credentials: true,
  });
  if (isAdminSwaggerEnabled()) {
    const swagger = new DocumentBuilder()
      .setTitle('LV S3 Admin API')
      .setDescription('Admin console API for bucket and identity management')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      admin,
      SwaggerModule.createDocument(admin, swagger),
    );
  }

  await admin.listen(adminPort, '0.0.0.0');

  const s3 = await NestFactory.create<NestExpressApplication>(S3AppModule, {
    bodyParser: false,
  });
  applyTrustProxy(s3);
  s3.enableShutdownHooks();
  s3.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const s3Origin = process.env.CORS_S3_ORIGIN ?? origin;
  s3.enableCors({
    origin: s3Origin.split(',').map((o) => o.trim()),
    exposedHeaders: ['ETag', 'Content-Length'],
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
  });
  await s3.listen(s3Port, '0.0.0.0');

  logger.log(`Admin + UI 0.0.0.0:${adminPort}`);
  logger.log(`S3 API 0.0.0.0:${s3Port}`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
