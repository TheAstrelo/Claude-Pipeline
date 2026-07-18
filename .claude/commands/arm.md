Crystallize requirements for the following task:

$ARGUMENTS

---

## Session Management

First, create a new session directory for this task:

1. Generate a timestamp and task slug: `{YYYYMMDD-HHMMSS}-{task-slug}`
2. Create directory: `.claude/artifacts/{timestamp}-{task-slug}/`
3. Update `.claude/artifacts/current.txt` with the path to the new session directory

Use Bash to create the directory:
```bash
# Create session directory with timestamp
SESSION_DIR=".claude/artifacts/$(date +%Y%m%d-%H%M%S)-{task-slug}"
mkdir -p "$SESSION_DIR"
echo "$SESSION_DIR" > .claude/artifacts/current.txt
```

---

## Requirements Crystallization

Use the **requirements-crystallizer** agent.

**Process:**

1. Parse the task description above for ambiguities
2. Explore the codebase to understand relevant existing code
3. Generate 5-10 clarifying questions grouped by theme:
   - Scope (what's in/out)
   - Behavior (edge cases, feedback, inputs/outputs)
   - Constraints (performance, security, compatibility)
   - Dependencies (APIs, database, other features)
4. Ask the user these questions
5. Iterate until requirements are clear (max 3 rounds)
6. Output `brief.md` to the session directory

---

## Output

After crystallization, report:

```
## Requirements Crystallization Complete

**Session:** {session-directory}
**Verdict:** [CRYSTALLIZED | NEEDS_CLARIFICATION]

### Problem Statement
[Summary from brief.md]

### Success Criteria
[Key criteria from brief.md]

### Next Step
Run `/design` to create the technical design.
```

---

## Gate

This command creates the session and `brief.md`. The `/design` command requires this to exist.
