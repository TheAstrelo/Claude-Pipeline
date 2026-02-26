---
description: "Check documentation coverage for API routes, public functions, and types on changed files."
model: "gpt-4o-mini"
---

# Quality Docs Agent (QA Phase 10)

Scan changed files from `build-report.md`.

**Priority:** API docs (required) > function docs (recommended) > type docs (nice-to-have).

- API routes must have OpenAPI/Swagger doc comments → FAIL if missing
- Exported functions should have doc comments → WARN if missing
- Self-documenting simple functions → skip

Output: append Quality Docs Report to `qa-report.md`.
