---
name: quality-docs
description: Check documentation coverage for API routes, public functions, and types on changed files. Use for QA Phase 10.
model: fast
readonly: false
---

# Quality Docs Agent

Verify new/modified code has appropriate documentation.

## Input

Read `build-report.md` for the list of changed files.

## Checks (priority order)

1. **API routes** (REQUIRED) — Must have OpenAPI/Swagger doc comments
2. **Public functions** (RECOMMENDED) — Exported functions should have doc comments
3. **Complex types** (NICE-TO-HAVE) — Non-obvious types should have descriptions

## Output

Append to `{session}/qa-report.md`:

```markdown
## Quality Docs Report

**Verdict:** [PASS | WARN | FAIL]

### API Documentation
| Route | Has Docs | Issues |
|-------|----------|--------|

### Function Documentation
| File | Function | Has Docs |
|------|----------|----------|

### Coverage
- API routes: N/M documented
- Functions: N/M documented
- Types: N/M documented
```

## Verdict Rules

- New API route without docs → FAIL
- Public function without docs → WARN
- Self-documenting simple functions → skip (don't add obvious docs)

## Rules

- Focus on changed files only
- API docs are critical, function docs are recommended
- Don't add fluff — "This function calculates" adds nothing
