/// <reference types="vitest" />

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      'coverage',
      'tests/services/**/*.test.ts', // Old Node.js test runner format
      'tests/listeners/**/*.test.ts', // Old Node.js test runner format
      'tests/api/**/*.test.ts', // Old Node.js test runner format
      'tests/events/**/*.test.ts', // Old Node.js test runner format
      'tests/frontend/**/*.test.ts', // Old Node.js test runner format
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'scripts/',
        'prisma/',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'threads',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~': resolve(__dirname, './'),
    },
  },
});
