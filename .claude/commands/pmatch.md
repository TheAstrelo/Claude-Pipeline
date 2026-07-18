Verify plan-design alignment before build.

---

## Prerequisites

Check that both design and plan exist:

```bash
SESSION_DIR=$(cat .claude/artifacts/current.txt 2>/dev/null)
if [ -z "$SESSION_DIR" ]; then
  echo "ERROR: No active session. Run /arm first."
  exit 1
fi
if [ ! -f "$SESSION_DIR/design.md" ]; then
  echo "ERROR: No design.md found. Run /design first."
  exit 1
fi
if [ ! -f "$SESSION_DIR/plan.md" ]; then
  echo "ERROR: No plan.md found. Run /plan first."
  exit 1
fi
```

---

## Drift Detection

Use the **drift-detector** agent.

**Input:**
- Read `design.md` from the current session directory
- Read `plan.md` from the current session directory

**Process:**

1. Extract all design requirements:
   - Components to create
   - APIs to implement
   - Database changes
   - Behavior specifications
   - Error handling requirements

2. Map each requirement to plan step(s)

3. Check for drift types:
   - **Missing Coverage:** Design requirement not in plan
   - **Scope Creep:** Plan step not justified by design
   - **Contradictions:** Plan conflicts with design
   - **Incomplete Steps:** Plan step missing required detail

4. Output `drift-report.md`

---

## Verdict Rules

**ALIGNED** if:
- All design requirements covered
- No unjustified scope creep
- No contradictions
- All steps complete

**DRIFT_DETECTED** if:
- Any requirement uncovered
- Unjustified scope creep
- Any contradiction
- Critical incomplete step

---

## Output

After detection, report:

```
## Drift Detection Complete

**Session:** {session-directory}
**Verdict:** [ALIGNED | DRIFT_DETECTED]

### Coverage
- Design requirements: [N]
- Covered by plan: [N]
- Missing: [N]

### Issues Found
[List any drift issues]

### Next Step
[If ALIGNED] Run `/build` to implement the plan.
[If DRIFT_DETECTED] Fix the drift issues:
- Missing coverage: Update /plan
- Scope creep: Justify or remove
- Contradictions: Resolve which is correct
```

---

## User Override

If drift is detected but the user wants to proceed anyway:

```
/build --force
```

This will proceed with logging that drift was detected but overridden.

---

## Gate

This command requires both `design.md` and `plan.md`. It produces `drift-report.md` and gates `/build`.
