#!/usr/bin/env tsx
import { ensureAnalyticsSchemaBaseline } from '../services/analytics-schema-bootstrap.js';

const logger = {
  info: (msg: string) => console.log('[INFO]', msg),
  warn: (msg: string) => console.log('[WARN]', msg),
  error: (msg: string) => console.error('[ERROR]', msg),
};

ensureAnalyticsSchemaBaseline(logger)
  .then(() => {
    console.log('Schema bootstrap complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Schema bootstrap failed:', err);
    process.exit(1);
  });
