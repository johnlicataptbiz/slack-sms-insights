# Contributing to PT Biz SMS Backend API

## Welcome!

We appreciate your interest in contributing to the PT Biz SMS Backend API. This document provides guidelines for contributing to the project.

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please be respectful, considerate, and collaborative.

## Getting Started

### Prerequisites

- Node.js 20.x
- PostgreSQL 13+
- Git
- npm 9.x or higher

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/slack-sms-insights.git
   cd slack-sms-insights/apps/backend
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required configuration

5. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

6. Run database migrations:
   ```bash
   npm run migrate:dev
   ```

## Development Workflow

### Branch Strategy

- `main`: Stable production branch
- `develop`: Integration branch for upcoming release
- Feature branches: `feature/short-description`
- Bugfix branches: `bugfix/short-description`

### Creating a Branch

```bash
# From develop branch
git checkout develop
git checkout -b feature/your-feature-name
```

## Coding Standards

### Code Style

- Follow the project's Biome configuration
- Use 2-space indentation
- Use single quotes
- Maximum line width: 120 characters
- Use LF line endings

### Linting and Formatting

Run linting before committing:
```bash
npx @biomejs/biome check src
npx @biomejs/biome format src
```

### Testing

- Write unit tests for new features
- Ensure 80% test coverage
- Run tests before committing:
  ```bash
  npm test
  npm run test:cover
  ```

## Commit Messages

Use conventional commit format:
```
<type>(<scope>): <description>

[optional body]
[optional footer(s)]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons
- `refactor`: Code restructuring
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks

Example:
```
feat(conversations): add pagination support for conversations endpoint

- Implement query parsing middleware
- Add Zod validation for pagination parameters
- Update conversations route to use new middleware
```

## Pull Request Process

1. Ensure your code passes all tests and linting
2. Update documentation if needed
3. Include a clear description of changes
4. Reference any related issues

### Pull Request Template

```markdown
## Description

[Provide a detailed description of your changes]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Tested

[Describe the tests you've added/run]

## Checklist

- [ ] My code follows project style guidelines
- [ ] I've added/updated tests
- [ ] All tests pass
- [ ] Documentation is updated
```

## Performance Considerations

- Optimize database queries
- Use Prisma's selective loading
- Implement caching where appropriate
- Avoid N+1 query problems

## Security

- Never commit sensitive information
- Use environment variables for secrets
- Validate and sanitize all inputs
- Follow OWASP guidelines

## Reporting Issues

### Bug Reports

- Use GitHub Issues
- Provide a clear, descriptive title
- Include steps to reproduce
- Provide expected vs. actual behavior
- Include environment details

### Feature Requests

- Explain the motivation
- Provide use cases
- Discuss potential implementation approaches

## Review Process

- Maintainers will review pull requests
- Feedback will be provided constructively
- Multiple approvals required for merging

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Express.js Guide](https://expressjs.com/)
- [Zod Documentation](https://zod.dev/)

## Questions?

If you have any questions, please open an issue or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.