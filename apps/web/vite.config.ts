import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const engineSrc = fileURLToPath(new URL('../../packages/engine/src', import.meta.url));

export default defineConfig({
  // GitHub Pages отдаёт проект по подпути /<repo>/ — задаётся при сборке через VITE_BASE
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@hobpi\/engine$/, replacement: `${engineSrc}/index.ts` }],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    // мини-апп должен открываться мгновенно даже на слабом мобильном канале
    chunkSizeWarningLimit: 400,
  },
});
