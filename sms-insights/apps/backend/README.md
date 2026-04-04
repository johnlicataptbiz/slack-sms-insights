# Backend Testing Guide

## Overview
This backend uses Vitest for unit and integration testing, with comprehensive coverage reporting and CI/CD integration.

## Running Tests

### Run All Backend Tests
```bash
npm run test:backend
```

### Run Backend Tests with Coverage
```bash
npm run test:backend:coverage
```

## Test Configuration

### Coverage Thresholds
- Lines: 80%
- Branches: 75%
- Functions: 80%
- Statements: 80%

### Test Structure
- Tests are located in the `tests/` directory
- Each controller has a corresponding test file
- Global test setup is managed in `tests/setup.ts`

## CI/CD Integration
Tests are automatically run on:
- Push to main/develop branches
- Pull requests targeting main/develop
- Includes linting, type checking, and security scanning

## Best Practices
- Write tests for both successful and error scenarios
- Use mock data and utility functions from `tests/setup.ts`
- Aim to maintain or improve test coverage