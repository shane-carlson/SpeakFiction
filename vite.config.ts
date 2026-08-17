import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running inside Electron the app is loaded from the filesystem, so assets
// must use relative paths. In the browser dev server the default base is fine.
export default defineConfig({
  base: process.env.ELECTRON ? './' : '/',
  plugins: [react()],
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
