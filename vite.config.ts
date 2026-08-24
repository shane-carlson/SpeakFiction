import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

const pkgMeta = pkg as { version: string; buildNumber?: number };

// When running inside Electron the app is loaded from the filesystem, so assets
// must use relative paths. In the browser dev server the default base is fine.
export default defineConfig({
  base: process.env.ELECTRON ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.SF_APP_VERSION || pkgMeta.version),
    __APP_BUILD__: JSON.stringify(process.env.SF_BUILD_NUMBER || String(pkgMeta.buildNumber ?? 0)),
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'companion/src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
