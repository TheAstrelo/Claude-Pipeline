Remove debug artifacts and development leftovers from the build.

---

## Purpose

Clean the codebase of development artifacts that shouldn't ship to production:
- Console.log statements (except legitimate error logging)
- Commented-out code blocks
- TODO/FIXME comments that are resolved
- Debugger statements
- Test data left in production code

---

## Execution

Use the **denoiser** agent.

**Input:** Read `build-report.md` to identify changed files (or use git diff if no build report).

**Process:**

1. Identify files changed in the build
2. Scan for noise patterns:
   - `console.log/debug/info/trace/dir`
   - `debugger` statements
   - `// TODO: remove` style comments
   - Blocks of commented-out code
   - Hardcoded test values
3. For each finding:
   - If clearly noise: remove it
   - If ambiguous: flag for review
4. Append results to `qa-report.md`

---

## What to Remove

| Pattern | Action |
|---------|--------|
| `console.log()` | Remove |
| `console.debug()` | Remove |
| `debugger` | Remove |
| `// TODO: remove` | Remove |
| Commented code blocks | Remove |
| `console.error('[Name]', ...)` | Keep (legitimate logging) |
| Explanatory comments | Keep |

---

## Output

After cleaning, report:

```
## Denoise Complete

**Verdict:** [CLEAN | CLEANED | NEEDS_ATTENTION]

### Summary
- Files scanned: [N]
- Items removed: [N]
- Items kept: [N]
- Items needing review: [N]

### Removed
[List of removed items with file:line references]

### Needs Attention
[Items that might be noise but require human judgment]

### Next Step
Run `/qf` for code quality check.
```

---

## Gate

This command is part of the QA pipeline. It should be run after `/build` completes.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`
