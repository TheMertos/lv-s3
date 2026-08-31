#!/usr/bin/env node
/**
 * Cross-platform Playwright backend bootstrap (replaces start-backend.sh on Windows).
 * Builds backend + frontend, copies UI into dist/public, then runs dist/main.js.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const backendDir = join(root, 'backend');
const frontendDir = join(root, 'frontend');
const tmp = join(tmpdir(), `lv-s3-pw-${process.pid}`);
mkdirSync(join(tmp, 'storage'), { recursive: true });

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const yarnCmd = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

const frontendBuild = spawnSync(npmCmd, ['run', 'build'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
});
if (frontendBuild.status !== 0) {
  process.exit(frontendBuild.status ?? 1);
}

const build = spawnSync(yarnCmd, ['build'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const publicDir = join(backendDir, 'dist', 'public');
if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true });
}
cpSync(join(frontendDir, 'dist'), publicDir, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'test',
  ADMIN_PORT: process.env.E2E_ADMIN_PORT ?? '19001',
  S3_PORT: process.env.E2E_S3_PORT ?? '19000',
  CORS_ADMIN_ORIGIN: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:19001',
  DATABASE_PATH: join(tmp, 'app.db'),
  STORAGE_ROOT: join(tmp, 'storage'),
  TYPEORM_SYNC: 'true',
  JWT_ACCESS_SECRET: 'test-access-secret-min-32-characters!',
  MASTER_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ADMIN_BOOTSTRAP_USERNAME: process.env.E2E_ADMIN_USER ?? 'e2eadmin',
  ADMIN_BOOTSTRAP_PASSWORD: process.env.E2E_ADMIN_PASS ?? 'E2ePlaywrightPassword123!',
  ADMIN_THROTTLE_LIMIT: '10000',
  ADMIN_THROTTLE_TTL_MS: '60000',
  S3_THROTTLE_LIMIT: '10000',
  S3_THROTTLE_TTL_MS: '60000',
  BROWSER_REDIRECT_URL: '',
  ADMIN_SWAGGER: 'false',
};

const child = spawn(process.execPath, [join(backendDir, 'dist', 'main.js')], {
  cwd: backendDir,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
