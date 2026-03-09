Generate test cases from the implementation plan.

---

## Prerequisites

Check that plan exists:

```bash
SESSION_DIR=$(cat .claude/artifacts/current.txt 2>/dev/null)
if [ -z "$SESSION_DIR" ] || [ ! -f "$SESSION_DIR/plan.md" ]; then
  echo "ERROR: No plan.md found. Run /plan first."
  exit 1
fi
```

---

## Test Writing Execution

Use the **test-writer** agent.

**Input:** Read `plan.md`, `design.md`, and `critique.md` from the current session directory.

**Process:**

1. Read plan.md and design.md to understand what's being built
2. Read critique.md for edge cases identified by adversarial review
3. Grep existing test files to understand test patterns and framework usage
4. For each plan step, generate appropriate test cases
5. Write test files to appropriate locations
6. Run `npx tsc --noEmit` to verify tests compile
7. Output `test-plan.md` to the session directory

---

## Output

After test writing, report:

```
## Test Planning Complete

**Session:** {session-directory}
**Verdict:** [READY | INCOMPLETE]

### Test Summary
- Unit tests: [N]
- Integration tests: [N]
- Edge case tests: [N]

### Test Files Created
[List of test files]

### Compilation Check
- TypeScript: [PASS/FAIL]

### Next Step
Run `/pmatch` to verify plan-design alignment, then `/build` to implement.
```

---

## Gate

This command requires `plan.md`. It produces `test-plan.md` which the builder consumes to generate tests alongside implementation.

Order: `/plan` → `/write-tests` → `/pmatch` → `/build`
