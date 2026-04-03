{
  "name": "ptbizsms-api",
  "version": "2.0.0",
  "type": "module",
  "dependencies": {
    "@prisma/client": "^7.x",
    "express": "^4.18.2",
    "zod": "^3.22.4",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.x",
    "@types/uuid": "^9.0.7",
    "tsx": "^4.7.1",
    "vitest": "^1.3.1"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}