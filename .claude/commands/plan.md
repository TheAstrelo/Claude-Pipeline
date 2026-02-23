Create a deterministic implementation plan with atomic steps.

---

## Prerequisites

Check that design exists:

```bash
SESSION_DIR=$(cat .claude/artifacts/current.txt 2>/dev/null)
if [ -z "$SESSION_DIR" ] || [ ! -f "$SESSION_DIR/design.md" ]; then
  echo "ERROR: No design.md found. Run /design first."
  exit 1
fi
```

If no design exists, stop and tell the user to run `/design` first.

---

## Atomic Planning

Use the **atomic-planner** agent.

**Input:**
- Read `design.md` from the current session directory
- Read `critique.md` if it exists (from /ar review)

**Process:**

1. Extract all components, endpoints, and changes from the design
2. For each change:
   - Verify file paths exist using Glob
   - Read current code state
   - Create exact BEFORE/AFTER code snippets
3. Order steps by dependency
4. Add concrete test cases with inputs/outputs
5. Keep to ~5-8 steps maximum (split phases if larger)
6. Output `plan.md` to the session directory

---

## Step Requirements

Every step MUST include:

1. **Exact file path** — Verified via Glob, marked MODIFY or CREATE
2. **Dependencies** — Which steps must complete first
3. **BEFORE code** — Current state (or "N/A - new file")
4. **AFTER code** — Complete, copy-pasteable code
5. **Test case** — Specific input, expected output, verification method
6. **Acceptance criteria** — Checkboxes for verification

---

## Quality Checks

The planner must verify:

- [ ] All file paths exist (or are explicitly CREATE)
- [ ] No file is modified in multiple steps (batch changes)
- [ ] AFTER code is complete and syntactically valid
- [ ] Dependencies form a valid DAG (no cycles)
- [ ] Test cases are concrete, not hypothetical

---

## Output

After planning, report:

```
## Implementation Plan Complete

**Session:** {session-directory}
**Verdict:** [READY_FOR_BUILD | NEEDS_DETAIL]

### Summary
[1-2 sentence overview]

### Step Overview
| Step | File | Action |
|------|------|--------|
| 1 | path/to/file | MODIFY |
| 2 | path/to/file | CREATE |
...

### Files Affected
- [List of all files that will change]

### Next Step
Run `/pmatch` to verify plan-design alignment, then `/build` to implement.
```

---

## Gate

This command requires `design.md` (and optionally `critique.md`). It produces `plan.md` which is required by `/pmatch` and `/build`.

---

## Key Principle

**If the builder has to guess, the plan failed.**

The plan is a contract: follow these exact steps, get working code. No improvisation needed or allowed.
