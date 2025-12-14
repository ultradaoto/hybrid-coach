import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.HOST ?? '127.0.0.1';
const apiPort = Number(process.env.API_PORT ?? 3699);
const port = Number(process.env.COACH_PORT ?? 3701);

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/coach/' : '/',
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://${host}:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host,
    port,
    strictPort: true,
  },
});
