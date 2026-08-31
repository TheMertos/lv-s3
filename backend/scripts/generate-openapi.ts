/**
 * Bootstraps AdminAppModule and writes OpenAPI JSON to openapi/admin.openapi.json.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AdminAppModule } from '../src/admin-app.module';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.TYPEORM_SYNC = 'true';
  process.env.DATABASE_PATH = path.join(
    os.tmpdir(),
    'lv-s3-openapi-gen.sqlite',
  );
  process.env.JWT_ACCESS_SECRET = 'openapi-gen-access-secret-min-32-chars!';
  process.env.MASTER_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const app = await NestFactory.create(AdminAppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('LV S3 Admin API')
    .setDescription('Admin console API for bucket and identity management')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outDir = path.join(__dirname, '..', 'openapi');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'admin.openapi.json');
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
