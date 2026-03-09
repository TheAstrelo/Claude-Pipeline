Generate a rollback plan for the current build.

---

## Purpose

Produce a rollback plan covering:
- Git revert commands
- Database migration rollback SQL
- Cache invalidation steps
- API compatibility impact
- Data loss risk assessment

---

## Execution

Use the **rollback-planner** agent.

**Input:** Read `build-report.md` and `plan.md` to understand what was built.

**Process:**

1. Identify changed files from build report
2. Check for migration files — determine reversibility
3. Check for API changes — identify breaking changes
4. Check for database schema changes
5. Generate step-by-step rollback procedure
6. Write to `rollback-plan.md`

---

## Output

After planning, report:

```
## Rollback Plan Generated

**Risk Level:** [LOW | MEDIUM | HIGH | IRREVERSIBLE]

### Quick Rollback
[Git revert command]

### Key Risks
[Data loss risks, breaking changes]

### Steps
[Number of rollback steps generated]
```

---

## Risk Levels

- **LOW:** Code-only changes, safe to revert
- **MEDIUM:** Additive DB changes, new endpoints
- **HIGH:** DB modifications, API format changes
- **IRREVERSIBLE:** Data transformations, column drops

---

## Gate

This command runs as the final step of the QA pipeline. It never blocks — informational only.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/perf-check` → `/security-review` → `/track-debt` → `/rollback-plan`
