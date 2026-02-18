import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local dev: avoid CORS by proxying API calls to the backend.
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
