Behavior validation - verify tests pass and outputs match design.

---

## Purpose

Verify that implemented code behaves correctly:
- Build succeeds
- Tests pass
- Behavior matches design specifications
- Edge cases from critique are handled

---

## Execution

Use the **quality-behavior** agent.

**Input:**
- `build-report.md` — What was built
- `design.md` — Expected behavior
- `critique.md` — Edge cases to verify

**Process:**

1. Run build: `npm run build`
2. Run tests: `npm test` (if tests exist)
3. Verify specifications:
   - Check behavior against design.md requirements
   - Verify edge cases from critique.md are handled
4. Append results to `qa-report.md`

---

## Verification Matrix

| Requirement | How to Verify |
|-------------|---------------|
| API returns X | Check response shape |
| Handles empty data | Check code path |
| Auth required | Check middleware |
| Multi-tenant | Check user_id filter |

---

## Output

After validation, report:

```
## Quality Behavior Complete

**Verdict:** [PASS | FAIL]

### Build
- Status: [PASS | FAIL]
- Warnings: [N]

### Tests
- Status: [PASS | FAIL | NO_TESTS]
- Passed: [N]
- Failed: [N]

### Specification Compliance
[Table of requirements and verification status]

### Edge Cases
[Table of edge cases and handling status]

### Issues Found
[List of behavioral issues]

### Next Step
Run `/qd` for documentation check.
```

---

## Gate

This command is part of the QA pipeline.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`
