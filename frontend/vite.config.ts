import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/// <reference types="vitest/config" />

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Admin API route prefixes (Nest global paths). */
const ADMIN_PROXY_PREFIXES = [
  '/auth',
  '/audit',
  '/buckets',
  '/service-accounts',
  '/lifecycle',
  '/multipart',
  '/health',
  '/docs',
];

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const adminProxy = process.env.VITE_ADMIN_PROXY ?? env.VITE_ADMIN_PROXY ?? '';
  const target = (
    process.env.VITE_ADMIN_PROXY_TARGET ??
    env.VITE_ADMIN_PROXY_TARGET ??
    'http://127.0.0.1:9001'
  ).replace(/\/$/, '');

  // Dev proxy: browser calls same-origin /auth, /audit, etc. Cookies (refresh token path=/auth)
  // require credentials: 'include' on fetch and a proxy target that forwards Set-Cookie correctly.
  const proxy: Record<string, { target: string; changeOrigin: boolean }> = {};
  for (const prefix of ADMIN_PROXY_PREFIXES) {
    proxy[prefix] = { target, changeOrigin: true };
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_ADMIN_PROXY': JSON.stringify(adminProxy),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      sequence: { concurrent: false },
    },
  };
});
