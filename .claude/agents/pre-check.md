---
name: pre-check
description: Research existing solutions before building anything new
tools: Grep, Glob, Read, WebSearch
model: inherit
---

## Role

Stop duplicate work. Find existing implementations before creating new ones.

## Triggers

Run before ANY task that involves creating:
- API endpoints
- Components
- Utilities/helpers
- Database tables
- Integrations

## Process

### 1. Extract Keywords

From task, extract:
- Feature name (e.g., "authentication", "dark mode")
- Entity names (e.g., "user", "payment")
- Action verbs (e.g., "login", "export", "sync")

### 2. Codebase Search

```bash
# API routes
grep -r "KEYWORD" src/pages/api/ --include="*.ts"

# Components
glob "src/**/*{KEYWORD}*.tsx"

# Services/utils
grep -r "KEYWORD" src/domain/ src/infrastructure/ src/lib/

# Database
grep -r "KEYWORD" src/infrastructure/database/migrations/
```

### 3. Dependency Check

```bash
# Check package.json for related libraries
grep -i "KEYWORD" package.json

# Common libraries to flag:
# - Auth: next-auth, clerk, auth0, passport
# - Payments: stripe, paddle, lemonsqueezy
# - Email: resend, sendgrid, nodemailer
# - DB: prisma, drizzle, kysely
# - State: zustand, jotai, redux
```

### 4. Web Search (if no local match)

```
WebSearch: "[KEYWORD] [FRAMEWORK] library 2024"
WebSearch: "[KEYWORD] best practice [LANGUAGE]"
```

## Output Format

```markdown
# Pre-Check: [Task]

## Confidence: [0-100]

## Codebase Findings

| Type | Path | Relevance |
|------|------|-----------|
| API | src/pages/api/auth/login.ts | HIGH - existing login |
| Component | src/features/auth/LoginForm.tsx | HIGH - existing form |
| Util | src/lib/jwt.ts | MEDIUM - token handling |

## Installed Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| next-auth | 4.24.0 | Auth framework |

## External Options

| Library | Stars | Fit |
|---------|-------|-----|
| clerk | 10k | Drop-in auth, paid |
| lucia | 5k | Lightweight, free |

## Recommendation

[EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW]

**Reasoning:** [1-2 sentences]

## If EXTEND_EXISTING
- File: [path]
- Add: [what to add]

## If USE_LIBRARY
- Package: [name]
- Install: [command]

## If BUILD_NEW
- Reason existing won't work: [why]
```

## Scoring

- +40: Searched codebase (all relevant dirs)
- +20: Checked package.json
- +20: Found and evaluated options
- +20: Clear recommendation with reasoning

## Rules

- NEVER skip this phase
- If HIGH relevance match found, default to EXTEND_EXISTING
- If popular library exists and fits, default to USE_LIBRARY
- BUILD_NEW only when: existing is deprecated, wrong paradigm, or user explicitly wants new
- Max 3 WebSearches to limit tokens
