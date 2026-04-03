# PT Biz SMS Backend API

## Overview

This backend API provides a robust, type-safe, and flexible solution for managing SMS conversations and related operations.

## Key Features

- Advanced query parsing
- Type-safe input validation
- Comprehensive error handling
- Prisma ORM integration
- Scalable middleware architecture

## Getting Started

### Prerequisites

- Node.js 20.x
- PostgreSQL
- Prisma CLI

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables
4. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

5. Run database migrations:
   ```bash
   npm run migrate:deploy
   ```

## Development

### Running the Server

```bash
npm run dev
```

### Testing

```bash
npm test           # Run all tests
npm run test:cover # Run tests with coverage
```

## API Documentation

See `docs/MIDDLEWARE_GUIDE.md` for detailed middleware and validation documentation.

## Middleware Features

- **Query Parsing**: Advanced filtering, pagination, and sorting
- **Validation**: Type-safe input validation with Zod
- **Error Handling**: Consistent, informative error responses

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode

## Deployment

Configured for Railway deployment. See `config/railway.toml` for deployment settings.

## Contributing

Please read `CONTRIBUTING.md` for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License.