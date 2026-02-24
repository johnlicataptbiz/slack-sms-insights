import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: process.env.VITE_DISABLE_PROXY
      ? undefined
      : {
          // Local dev: avoid CORS by proxying API calls to the backend.
          '/api': {
            target: process.env.VITE_API_TARGET ?? 'http://localhost:3001',
            changeOrigin: true,
            ws: true,
            // When proxying to a remote production target the browser sends
            // Origin: http://localhost:5173 which Railway's CORS allowlist rejects.
            // Override the Origin header so the backend sees a known-good origin.
            ...(process.env.VITE_API_TARGET
              ? {
                  configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                      proxyReq.setHeader('Origin', 'https://ptbizsms.com');
                    });
                  },
                }
              : {}),
          },
        },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
