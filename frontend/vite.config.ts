import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: process.env.VITE_DISABLE_PROXY
      ? undefined
      : {
          // Local dev: avoid CORS by proxying API calls to the backend.
          '/api': {
            target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
            changeOrigin: true,
            ws: true,
          },
        },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
