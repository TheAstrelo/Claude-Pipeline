Code quality check - verify types, lint, and project conventions.

---

## Purpose

Verify that implemented code fits RDO project quality standards:
- TypeScript types are correct
- ESLint rules pass
- Project conventions followed

---

## Execution

Use the **quality-fit** agent.

**Input:** Read `build-report.md` to identify changed files.

**Process:**

1. Run automated checks:
   - `npx tsc --noEmit` — Type checking
   - `npx eslint [files]` — Lint checking

2. Check RDO conventions:
   - Database: `import pool from '@infrastructure/database/connection'`
   - Auth: `requireAuth` + `AuthenticatedRequest` + `req.userId!`
   - API: Swagger docs, method checks, error handling
   - Frontend: MUI Grid v2 syntax, theme tokens, React Query

3. Append results to `qa-report.md`

---

## Convention Checklist

| Convention | Check |
|------------|-------|
| Database import | `@infrastructure/database/connection` |
| Parameterized queries | No string interpolation in SQL |
| No `do` alias | Use `d` instead |
| Auth middleware | `requireAuth` or `requireAdmin` |
| MUI Grid v2 | `size={{ xs: 12 }}` not `item xs={12}` |
| Theme tokens | No hardcoded hex colors |
| React Query | Not SWR |

---

## Output

After check, report:

```
## Quality Fit Complete

**Verdict:** [PASS | FAIL]

### Automated Checks
- TypeScript: [PASS | FAIL]
- ESLint: [PASS | FAIL]

### Convention Compliance
[Table of conventions and status]

### Issues Found
[List of specific issues with file:line references]

### Required Fixes
[If FAIL, specific fixes needed]

### Next Step
Run `/qb` for behavior validation.
```

---

## Gate

This command is part of the QA pipeline.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`
