Execute the implementation plan with context isolation per step.

---

## Prerequisites

Check that plan exists and optionally verify drift:

```bash
SESSION_DIR=$(cat .claude/artifacts/current.txt 2>/dev/null)
if [ -z "$SESSION_DIR" ] || [ ! -f "$SESSION_DIR/plan.md" ]; then
  echo "ERROR: No plan.md found. Run /plan first."
  exit 1
fi
```

If `--force` is NOT provided and no `drift-report.md` exists, warn:
> "Warning: /pmatch has not been run. Consider running /pmatch first to verify plan-design alignment."

If `drift-report.md` exists and verdict is DRIFT_DETECTED, require `--force`:
> "ERROR: Drift detected. Run /pmatch to see issues, then either fix them or use /build --force to proceed anyway."

---

## Build Execution

Use the **builder** agent.

**Input:** Read `plan.md` from the current session directory.

**Process:**

### For each step in the plan (sequentially):

1. **Fresh Read** — Read only the files mentioned in that step
2. **Verify BEFORE** — Check that file content matches BEFORE code (for MODIFY)
3. **Apply AFTER** — Use Edit/Write to apply the changes
4. **Verify Criteria** — Check each acceptance criterion
5. **Log Result** — Add to build-report.md

### After all steps:

1. Run build verification: `npm run build`
2. Run type verification: `npx tsc --noEmit`
3. Output final build-report.md

---

## Context Isolation

Each step starts with a fresh context:
- Only read files explicitly mentioned in that step
- Don't assume state from previous steps
- This prevents context bleed and ensures deterministic execution

---

## Error Handling

If a step fails:

1. **BEFORE mismatch:** Stop immediately. The plan is stale.
2. **File not found:** Stop immediately. The plan has a bug.
3. **Build fails:** Continue logging but flag in report.

Do NOT try to fix issues — that's improvisation. Report and stop.

---

## Output

After build, report:

```
## Build Complete

**Session:** {session-directory}
**Verdict:** [SUCCESS | PARTIAL | FAILED]

### Summary
- Steps completed: [N/M]
- Files changed: [N]

### Verification
- Build: [PASS | FAIL]
- Types: [PASS | FAIL]

### Files Changed
[List of files with actions]

### Next Steps
1. Run `/denoise` to clean debug code
2. Run `/qf` for code quality check
3. Run `/qb` for behavior validation
4. Run `/security-review` for security audit
```

---

## Force Mode

```
/build --force
```

Bypasses:
- Drift detection gate
- Any previous failure state

Use when you understand the risks and want to proceed anyway.
Logged in build-report.md: "Build executed with --force flag."

---

## Gate

This command requires `plan.md`. It produces `build-report.md` and the actual code changes.

After build, run the QA pipeline:
- `/denoise` — Remove debug code
- `/qf` — Code quality check
- `/qb` — Behavior validation
- `/qd` — Documentation check
- `/security-review` — Security audit
