Performance check - scan for N+1 queries, bundle size impact, and memory leaks.

---

## Purpose

Check changed code for performance issues:
- N+1 query patterns (queries inside loops)
- Unbounded data fetching (no LIMIT, no pagination)
- Missing database indexes
- Memory leak patterns (event listeners, intervals not cleaned up)
- Bundle size regressions
- Synchronous blocking operations in API routes

---

## Execution

Use the **performance-profiler** agent.

**Input:** Read `build-report.md` to identify changed files.

**Process:**

1. Scan for N+1 query patterns
2. Scan for unbounded queries
3. Check for missing indexes
4. Scan for memory leak patterns
5. Check bundle size if frontend files changed
6. Scan for blocking operations
7. Append results to `qa-report.md`

---

## Output

After profiling, report:

```
## Performance Check Complete

**Verdict:** [PASS | WARN | FAIL]

### Findings
- N+1 Queries: [CLEAR/FOUND]
- Unbounded Queries: [CLEAR/FOUND]
- Missing Indexes: [CLEAR/FOUND]
- Memory Leaks: [CLEAR/FOUND]
- Bundle Size: [OK/REGRESSION]
- Blocking Ops: [CLEAR/FOUND]

### Required Fixes
[If FAIL, specific fixes]
```

---

## Verdict Levels

- **PASS:** No performance issues found
- **WARN:** Minor issues, suggestions provided
- **FAIL:** Critical performance issues that must be addressed

---

## Gate

This command runs as part of the QA pipeline, after Quality Docs.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/perf-check` → `/security-review`
