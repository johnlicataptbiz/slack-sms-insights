# Contributing to PT Biz SMS Insights

Thank you for your interest in contributing! This document provides guidelines and workflows for contributing to the project.

## 🎯 Development Workflow

### Branch Strategy

We use a simplified Git Flow:

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `hotfix/*` - Emergency fixes

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples:**
```
feat(dashboard): add date range picker to charts

fix(api): handle null values in sales metrics

docs(readme): update deployment instructions

refactor(services): extract logger to separate module
```

## 📝 Code Standards

### TypeScript

**Enable Strict Mode:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Naming Conventions:**
- `PascalCase` for components, classes, interfaces, types
- `camelCase` for variables, functions, methods
- `SCREAMING_SNAKE_CASE` for constants
- `kebab-case` for file names

**Example:**
```typescript
// Good
interface UserProfile {
  firstName: string;
  lastName: string;
}

const MAX_RETRY_COUNT = 3;

function formatUserName(user: UserProfile): string {
  return `${user.firstName} ${user.lastName}`;
}

// Component
export function UserCard({ user }: { user: UserProfile }) {
  return <div>{formatUserName(user)}</div>;
}
```

### Backend (sms-insights/)

**File Organization:**
```
services/
  ├── logger.ts          # Logging utilities
  ├── db.ts              # Database connection
  ├── error-handler.ts   # Error handling
  └── [feature]/
      ├── index.ts       # Public API
      ├── types.ts       # Feature types
      └── utils.ts       # Feature utilities
```

**Error Handling:**
```typescript
// Use structured logging
import { logger } from './services/logger.js';

try {
  await riskyOperation();
} catch (error) {
  logger.error({ error, context: 'operation_name' }, 'Operation failed');
  throw new AppError('OPERATION_FAILED', 'Failed to complete operation');
}
```

**API Route Pattern:**
```typescript
// api/routes.ts
import { z } from 'zod';

const QuerySchema = z.object({
  daysBack: z.coerce.number().min(1).max(90).default(7),
});

export async function handleGetRuns(req: Request, res: Response) {
  // 1. Validate input
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ 
      error: 'Invalid input',
      details: parsed.error.issues 
    });
  }
  
  // 2. Execute
  const runs = await getRuns(parsed.data);
  
  // 3. Respond
  return res.json({ data: runs });
}
```

### Frontend (frontend/)

**Component Structure:**
```typescript
// components/v2/ExampleComponent.tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useExampleData } from '@/hooks/useExampleData';
import { cn } from '@/lib/utils';

interface ExampleComponentProps {
  className?: string;
  title: string;
}

export function ExampleComponent({ className, title }: ExampleComponentProps) {
  const { data, isLoading } = useExampleData();
  
  if (isLoading) {
    return <ExampleSkeleton />;
  }
  
  return (
    <Card className={cn('p-4', className)}>
      <h2>{title}</h2>
      {/* Component content */}
    </Card>
  );
}

function ExampleSkeleton() {
  return <div className="animate-pulse h-20 bg-muted rounded" />;
}
```

**Hook Pattern:**
```typescript
// hooks/useExampleData.ts
import { useQuery } from '@tanstack/react-query';

interface ExampleData {
  id: string;
  name: string;
}

export function useExampleData() {
  return useQuery<ExampleData[]>({
    queryKey: ['example'],
    queryFn: async () => {
      const response = await fetch('/api/example');
      if (!response.ok) {
        throw new Error('Failed to fetch');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**Styling with Tailwind:**
```typescript
// Use cn() for conditional classes
import { cn } from '@/lib/utils';

// Good
<div className={cn(
  'base-classes',
  isActive && 'active-classes',
  isLarge ? 'text-lg' : 'text-sm'
)}>

// Avoid
<div className={`base-classes ${isActive ? 'active' : ''}`}>
```

## 🧪 Testing

### Backend Tests

**Test File Location:**
- Place tests in `sms-insights/tests/`
- Mirror the source structure
- Name: `[filename].test.ts`

**Example:**
```typescript
// tests/services/logger.test.ts
import { describe, it, expect } from 'vitest';
import { createLogger } from '../../services/logger.js';

describe('createLogger', () => {
  it('should create a logger with the given name', () => {
    const logger = createLogger('test');
    expect(logger).toBeDefined();
  });
});
```

### Frontend Tests

**Test File Location:**
- Place tests next to source files
- Name: `[Component].test.tsx` or `[hook].test.ts`

**Component Test Example:**
```typescript
// components/v2/KPIGrid.test.tsx
import { render, screen } from '@testing-library/react';
import { KPIGrid } from './KPIGrid';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

it('renders KPI cards with data', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <KPIGrid data={mockData} />
    </QueryClientProvider>
  );
  
  expect(screen.getByText('Messages Sent')).toBeInTheDocument();
});
```

## 🔍 Code Review Process

### Before Submitting PR

1. **Self-Review Checklist:**
   - [ ] Code follows style guide
   - [ ] Tests added/updated
   - [ ] TypeScript compiles without errors
   - [ ] No console.log statements (use logger)
   - [ ] Documentation updated
   - [ ] Commits follow convention

2. **Run Quality Checks:**
   ```bash
   # Backend
   cd sms-insights
   npm run lint
   npm run build
   
   # Frontend
   cd frontend
   npm run typecheck:v2
   npm run build
   ```

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] E2E tests pass

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
```

### Review Criteria

**For Reviewers:**
- Code correctness
- Test coverage
- Performance implications
- Security considerations
- Documentation completeness

**Approval Requirements:**
- 1 approval for docs/refactors
- 2 approvals for features
- All checks must pass

## 🚀 Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- `MAJOR.MINOR.PATCH`
- Major: Breaking changes
- Minor: New features (backward compatible)
- Patch: Bug fixes

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release branch: `release/v1.2.3`
4. Run full test suite
5. Deploy to staging
6. Smoke test
7. Merge to `main`
8. Tag release: `git tag v1.2.3`
9. Deploy to production

## 🐛 Debugging

### Backend Debugging

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Inspect specific module
DEBUG=db,services:* npm run dev
```

### Frontend Debugging

```bash
# Vite debug mode
DEBUG=vite:* npm run dev

# React DevTools
# Install browser extension
```

### Common Issues

**TypeScript errors after pulling:**
```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build
```

**Database connection issues:**
```bash
# Test connection
railway db:connect
# Or local
psql $DATABASE_URL -c "SELECT 1"
```

## 📚 Resources

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Docs](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [Slack Bolt](https://slack.dev/bolt-js/)

### Tools
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)

## 🤝 Community

### Communication Channels
- GitHub Issues: Bug reports, feature requests
- GitHub Discussions: General questions
- Slack: #dev-sms-insights (internal)

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

---

**Questions?** Open an issue or reach out to the maintainers.
