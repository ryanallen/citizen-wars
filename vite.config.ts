/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), test: resolve(__dirname, 'test.html') } },
  },
  test: {
    // Tests against real relays run only with LIVE=1 (npm run test:live).
    exclude: process.env.LIVE ? ['**/node_modules/**'] : ['**/node_modules/**', '**/*.live.test.ts'],
    include: process.env.LIVE ? ['src/**/*.live.test.ts'] : ['src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
