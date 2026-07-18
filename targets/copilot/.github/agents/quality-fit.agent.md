---
description: "Check type safety, lint compliance, and project convention adherence on changed files."
model: "gpt-4o-mini"
tools:
  - "terminal"
---

# Quality Fit Agent (QA Phase 8)

Scan changed files from `build-report.md`.

**Checks:**
1. Type safety — run type checker, flag `any` types, missing return types
2. Lint compliance — run linter, flag errors
3. Project conventions — import patterns, naming, framework patterns

Auto-fix what's possible. Output: append Quality Fit Report to `qa-report.md`.

Verdict: PASS if types + lint pass and critical conventions followed. FAIL otherwise.
