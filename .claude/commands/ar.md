Run adversarial review on the current design.

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

## Adversarial Review

Use the **adversarial-coordinator** agent.

**Input:** Read `design.md` from the current session directory.

**Process:**

Run 3 critique passes with different perspectives:

### Pass 1: Architect Critic
- Focus: Scalability, coupling, consistency, performance
- Question: "What architectural flaws exist? What scales poorly?"

### Pass 2: Skeptic Critic
- Focus: Edge cases, error states, security, concurrency
- Question: "What assumptions are untested? What edge cases break this?"

### Pass 3: Implementer Critic
- Focus: Clarity, types, state management, testability
- Question: "What's ambiguous? What will cause bugs during build?"

After all passes, synthesize findings and identify consensus issues.

---

## Severity Levels

- **HIGH:** Production bugs, security issues, or architectural debt
- **MEDIUM:** Developer friction, maintenance burden, or edge case failures
- **LOW:** Style preferences or theoretical concerns

---

## Verdict Rules

**REVISE_DESIGN** if:
- Any HIGH severity issue
- 3+ MEDIUM severity issues
- Consensus issue (raised by 2+ critics)

**APPROVED** if:
- No HIGH issues
- Fewer than 3 MEDIUM issues
- All concerns are LOW or mitigated

---

## Output

After review, report:

```
## Adversarial Review Complete

**Session:** {session-directory}
**Verdict:** [APPROVED | REVISE_DESIGN]

### Consensus Issues
[Issues raised by multiple critics - highest priority]

### High Severity
[List any HIGH severity issues]

### Summary
- Architect: [N issues]
- Skeptic: [N issues]
- Implementer: [N issues]

### Next Step
[If APPROVED] Run `/plan` to create the implementation plan.
[If REVISE_DESIGN] Address the required changes and run `/design` again.
```

---

## User Override

If the verdict is REVISE_DESIGN but the user wants to proceed anyway:

```
/plan --force
```

This will proceed with logging that the design review was overridden.

---

## Gate

This command requires `design.md`. It produces `critique.md` which is read by `/plan` to incorporate feedback.
