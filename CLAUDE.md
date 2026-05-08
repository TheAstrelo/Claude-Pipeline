# CLAUDE.md

> **This is an example CLAUDE.md.** Replace this with your own project's details so the pipeline understands your codebase.

## Project Overview
Describe your project in one line. What does it do? What's the tech stack?

## Commands
```bash
npm run dev          # Dev server
npm run build        # Production build
npm run test         # Run tests
```

## Architecture
```
src/
├── features/        # Feature modules
├── services/        # Business logic
├── infrastructure/  # Database, auth, external APIs
└── ui/              # UI components
```

## Key Patterns

Document the conventions Claude should follow when generating code:

```typescript
// Example: How to import the database connection
import db from '@/infrastructure/database';

// Example: How to protect API routes
import { requireAuth } from '@/middleware/auth';
export default requireAuth(handler);
```

## Important Notes
- List any project-specific rules here
- e.g., "Use Tailwind, not inline styles"
- e.g., "All API routes must have Swagger docs"
- e.g., "Never use `any` type in TypeScript"

## Required Development Workflow

**MANDATORY:** For any non-trivial task, use `/auto-pipeline`. Do NOT skip phases.

### The Pipeline — `/auto-pipeline <task>`

One command that runs the full development pipeline automatically:

```bash
# Fast prototyping
/auto-pipeline --profile=yolo "add a logout button"

# Balanced (default)
/auto-pipeline "implement user dashboard"

# Full oversight
/auto-pipeline --profile=paranoid "payment integration"
```

See [README.md](README.md) for full pipeline documentation.
