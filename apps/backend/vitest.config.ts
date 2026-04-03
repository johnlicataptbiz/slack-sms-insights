import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/index.ts',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts',
        '**/interfaces.ts'
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      }
    },
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});