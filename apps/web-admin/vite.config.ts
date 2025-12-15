import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.HOST ?? '127.0.0.1';
const apiPort = Number(process.env.API_PORT ?? 3699);
const port = Number(process.env.ADMIN_PORT ?? 3703);

export default defineConfig({
  plugins: [react()],
  
  // In production, served at /admin/
  base: process.env.NODE_ENV === 'production' ? '/admin/' : '/',
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@myultra/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@myultra/types': path.resolve(__dirname, '../../packages/types/src'),
      '@myultra/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
  
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://${host}:${apiPort}`,
        changeOrigin: true,
      },
      // Only proxy specific WebSocket endpoints to avoid conflicts with Vite HMR
      '/ws/logs': {
        target: `ws://${host}:${apiPort}`,
        ws: true,
        changeOrigin: true,
      },
      '/ws/rooms': {
        target: `ws://${host}:${apiPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  
  preview: {
    host,
    port,
    strictPort: true,
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

