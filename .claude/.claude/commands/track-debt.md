Tech debt tracking - scan for shortcuts, TODOs, and design deviations.

---

## Purpose

Identify technical debt introduced during the build:
- TODO/FIXME/HACK/TEMP/XXX comments
- Type safety shortcuts (`as any`)
- Hardcoded values and magic numbers
- Design deviations
- Missing error handling

---

## Execution

Use the **tech-debt-tracker** agent.

**Input:** Read `build-report.md` and `design.md` to identify changed files and expected behavior.

**Process:**

1. Scan changed files for debt markers
2. Scan for type safety shortcuts
3. Compare implementation against design
4. Check for missing error handling
5. Append results to `qa-report.md`

---

## Output

After scanning, report:

```
## Tech Debt Scan Complete

**Verdict:** [CLEAN | DEBT_LOGGED]

### Summary
- New debt items: [N]
- Severity breakdown: [N HIGH, N MEDIUM, N LOW]

### Recommended Cleanup
[Priority-ordered list of fixes]
```

---

## Verdict Levels

- **CLEAN:** No new technical debt introduced
- **DEBT_LOGGED:** Debt found and logged (informational, never blocks)

---

## Gate

This command runs after the security review in the QA pipeline. It never blocks.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/perf-check` → `/security-review` → `/track-debt`
