# Vitest and Node.js Test Runner Setup

## Overview
This project uses two separate test runners to maintain compatibility:
- **Vitest**: Modern framework for new tests (v4.1.0+)
- **Node.js built-in test runner**: Legacy tests written in TAP format

## Why Two Runners?

The backend inherited 32+ test files written with Node.js's built-in `test()` function (TAP format). When Vitest was introduced, it attempted to parse all `*.test.ts` files, causing "No test suite found" errors for the old tests (32 failures).

**Solution**: Configure Vitest to exclude old test directories and run both suites separately.

## Test Commands

```bash
# Run only new Vitest tests
npm run test:vitest

# Run only old Node.js tests  
npm run test:node

# Run both test suites (with build + lint)
npm run test

# Watch mode (Vitest only)
npm run test:watch

# Test UI mode (Vitest only)
npm run test:ui

# Coverage report (Vitest only)
npm run test:coverage
npm run test:coverage:html
```

## Vitest Configuration

### Main Config: vitest.config.ts
- Excludes old test directories: `tests/services/**`, `tests/listeners/**`, `tests/api/**`, `tests/events/**`, `tests/frontend/**`
- Only runs pure Vitest test files (with `describe`/`it`)
- Globals enabled, Node environment
- Setup file: `tests/setup.ts`

### Unit Tests: vitest.unit.config.ts
- Runs tests from `src/**/*.{test,spec}.ts`
- Higher coverage thresholds: 80%+ for lines/functions/statements, 75% for branches

### Integration Tests: vitest.integration.config.ts
- Runs tests from `tests/integration/**`
- Lower coverage thresholds: 70%+ (integration tests are more complex)
- Sequential execution (single thread)

## Writing New Tests

**Use Vitest** for new tests. Put them in:
- `tests/controllers/*.test.ts` - Controller unit tests
- `tests/utils/*.test.ts` - Utility function tests
- `tests/integration/**/*.test.ts` - Integration tests

**Example test structure**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestUtils, mockFactories } from './utils/test-helpers'

describe('MyFeature', () => {
  let mockReq, mockRes

  beforeEach(() => {
    mockReq = TestUtils.createMockRequest()
    mockRes = TestUtils.createMockResponse()
  })

  it('should handle requests', () => {
    expect(mockRes.status).toHaveBeenCalled()
  })
})
```

## Test Utilities

Located in `tests/utils/test-helpers.ts`:
- `TestUtils.createMockRequest()` - Create mock Express request
- `TestUtils.createMockResponse()` - Create mock Express response with spies
- `TestUtils.createMockTransaction()` - Create mock database transaction
- `TestUtils.wait(ms)` - Async delay helper
- `mockFactories.*` - Pre-configured mocks for services (Slack, Monday.com, Prisma)

## Migrating Old Tests to Vitest

When modernizing old Node.js format tests:

1. Change `import { test } from 'node:test'` to `import { describe, it } from 'vitest'`
2. Change `test()` calls to `it()`
3. Wrap related tests in `describe()` blocks
4. Use Vitest's `vi.fn()`, `vi.mock()` instead of Node's assertion library
5. Move the test file to `tests/controllers/`, `tests/utils/`, or `tests/integration/`
6. Remove from exclusion list in `vitest.config.ts`

## Current Test Files

### Vitest Tests (Excluded from Node.js runner)
- `tests/example.test.ts` - Basic patterns example
- `tests/controllers/base.controller.test.ts` - Base controller tests
- `tests/utils/test-helpers.ts` - Test utility library

### Node.js Tests (Run separately)
- `tests/services/**/*.test.ts` - 15+ service tests
- `tests/listeners/**/*.test.ts` - Listener event tests
- `tests/api/**/*.test.ts` - API route tests
- `tests/events/**/*.test.ts` - Slack event tests
- `tests/frontend/**/*.test.ts` - Frontend logic tests

## Troubleshooting

**"No test suite found" error in Vitest?**
- File uses old Node.js `test()` syntax
- Add path to exclusion list in `vitest.config.ts`
- Or migrate the file to Vitest format

**Tests not running?**
- Ensure file ends in `.test.ts` or `.spec.ts`
- Check it's in correct directory (not in exclusion list)
- Run `npm run test:vitest` to verify Vitest finds it

**Old Node.js tests failing?**
- Run with `npm run test:node` or `node --import tsx --test`
- These bypass Vitest entirely
