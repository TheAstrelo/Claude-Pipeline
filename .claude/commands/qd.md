Documentation check - verify Swagger, JSDoc, and API documentation.

---

## Purpose

Verify that new/modified code has appropriate documentation:
- API routes have Swagger docs (REQUIRED)
- Public functions have JSDoc (RECOMMENDED)
- Complex types have descriptions (RECOMMENDED)

---

## Execution

Use the **quality-docs** agent.

**Input:** Read `build-report.md` to identify changed files.

**Process:**

1. Check API routes for Swagger:
   - `@swagger` block present
   - Has summary, tags, security
   - Has parameters and responses

2. Check exported functions for JSDoc:
   - Has description
   - Has @param tags
   - Has @returns tag

3. Check types for documentation:
   - Complex interfaces have descriptions
   - Enum values documented if non-obvious

4. Append results to `qa-report.md`

---

## Documentation Requirements

| Item | Requirement |
|------|-------------|
| API Routes | REQUIRED - must have Swagger |
| Service Functions | RECOMMENDED - should have JSDoc |
| Utility Functions | Optional - if non-obvious |
| Types | RECOMMENDED - if complex |

---

## Swagger Checklist

For each API route:
- [ ] Has `@swagger` block
- [ ] Has `summary`
- [ ] Has `tags`
- [ ] Has `security` (BearerAuth, CookieAuth)
- [ ] Has `parameters` (if applicable)
- [ ] Has `responses` (200, 400, 401, 500)

---

## Output

After check, report:

```
## Quality Docs Complete

**Verdict:** [PASS | FAIL | WARN]

### API Documentation
- Routes checked: [N]
- Fully documented: [N]
- Missing Swagger: [List]

### Function Documentation
- Functions checked: [N]
- With JSDoc: [N]
- Missing JSDoc: [List]

### Required Additions
[If FAIL, specific docs needed]

### Next Step
Run `/security-review` for security audit.
```

---

## Gate

This command is part of the QA pipeline.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`
