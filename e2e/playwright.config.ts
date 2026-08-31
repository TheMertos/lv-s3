import path from 'node:path';

import { defineConfig } from '@playwright/test';

const rootDir = path.resolve(process.cwd());
const e2eDir = path.join(rootDir, 'e2e');
const adminPort = process.env.E2E_ADMIN_PORT ?? '19001';
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${adminPort}`;

/**
 * Playwright config: production-built UI + admin API on :19001 (avoids colliding with :9001).
 */
export default defineConfig({
  testDir: e2eDir,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node ./start-backend.mjs',
    cwd: e2eDir,
    url: `${baseURL}/health/ready`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
