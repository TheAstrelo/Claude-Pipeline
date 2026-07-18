# Next Steps Library

Context-aware suggestions for what to do after successful pipeline completion.

## Purpose

After a successful pipeline run, analyze what was built and suggest logical next actions.

## Detection Rules

### API Endpoint Created

**Detection:**
- Files created in `src/api/`, `src/routes/`, `routes/`
- Contains HTTP method handlers (GET, POST, PUT, DELETE)
- Contains route definitions

**Suggestions:**
```
Suggested next steps:
  1. Test endpoint        → curl -X GET http://localhost:3000/api/{endpoint}
  2. Add to Swagger       → /auto-pipeline "add swagger docs for {endpoint}"
  3. Add authentication   → /auto-pipeline "add auth middleware to {endpoint}"
  4. Write integration tests → /auto-pipeline "add integration tests for {endpoint}"
```

---

### Authentication Code

**Detection:**
- Files in `src/auth/`, `auth/`
- Contains JWT, session, or OAuth references
- Middleware for authentication

**Suggestions:**
```
Suggested next steps:
  1. Test login flow      → Run manual login test
  2. Add rate limiting    → /auto-pipeline "add rate limiting to auth endpoints"
  3. Check token expiry   → Verify token refresh works
  4. Add password reset   → /auto-pipeline "add password reset flow"
  5. Add 2FA              → /auto-pipeline "add two-factor authentication"
```

---

### UI Component

**Detection:**
- Files in `src/components/`, `components/`
- React/Vue/Svelte component syntax
- Contains JSX/TSX

**Suggestions:**
```
Suggested next steps:
  1. Add Storybook story  → /auto-pipeline "add storybook story for {component}"
  2. Test responsiveness  → Check mobile/tablet views
  3. Add unit tests       → /auto-pipeline "add tests for {component}"
  4. Add accessibility    → /auto-pipeline "improve accessibility for {component}"
  5. Document props       → /auto-pipeline "add jsdoc to {component} props"
```

---

### Database Migration

**Detection:**
- Files in `migrations/`, `prisma/migrations/`
- SQL schema changes
- ORM model changes

**Suggestions:**
```
Suggested next steps:
  1. Run migration        → npm run migrate / prisma migrate deploy
  2. Seed test data       → /auto-pipeline "add seed data for {table}"
  3. Update types         → Regenerate TypeScript types
  4. Test rollback        → Verify down migration works
```

---

### Test Files

**Detection:**
- Files in `tests/`, `__tests__/`, `*.test.ts`, `*.spec.ts`
- Contains test/describe/it blocks

**Suggestions:**
```
Suggested next steps:
  1. Run tests            → npm test
  2. Check coverage       → npm run coverage
  3. Add edge cases       → /auto-pipeline "add edge case tests for {module}"
  4. Add integration test → /auto-pipeline "add integration tests for {module}"
```

---

### Configuration Changes

**Detection:**
- Modified config files (*.config.js, .env.example)
- Environment variable changes

**Suggestions:**
```
Suggested next steps:
  1. Update .env          → Copy new variables to .env
  2. Update docs          → Document new configuration
  3. Notify team          → Share config changes
  4. Test locally         → Verify new config works
```

---

### Bug Fix

**Detection:**
- Task description contains "fix", "bug", "issue"
- Small number of changed lines
- Existing tests modified

**Suggestions:**
```
Suggested next steps:
  1. Run tests            → Verify fix doesn't break anything
  2. Test manually        → Reproduce original bug to confirm fix
  3. Add regression test  → /auto-pipeline "add regression test for {bug}"
  4. Create PR            → /auto-pipeline --pr
```

---

## Generic Suggestions

Always include based on context:

```javascript
const genericSuggestions = {
  hasTests: [
    { label: 'Run tests', command: '/auto-pipeline --test' }
  ],
  isGitRepo: [
    { label: 'Create PR', command: '/auto-pipeline --pr' },
    { label: 'Create commit', command: '/commit' }
  ],
  hasMultipleFiles: [
    { label: 'Review changes', command: 'git diff' }
  ]
};
```

## Output Format

```
✓ {task} · ${cost}

Created:
  {path/to/created1.ts}
  {path/to/created2.ts}

Modified:
  {path/to/modified.ts}

Suggested next steps:
  1. {Most relevant action}  → {command}
  2. {Second action}         → {command}
  3. {Third action}          → {command}
  4. {Fourth action}         → {command}

Artifacts: .claude/artifacts/{session}/
```

## Priority Ranking

Suggestions are ranked by:
1. Safety (tests, review before deploy)
2. Completeness (add docs, add more tests)
3. Next logical step (PR, deploy)
4. Enhancement (additional features)
