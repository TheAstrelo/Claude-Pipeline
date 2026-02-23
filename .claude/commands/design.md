Create a technical design grounded in live documentation research.

---

## Prerequisites

Check that a session exists:

```bash
# Read current session
if [ ! -f ".claude/artifacts/current.txt" ]; then
  echo "ERROR: No active session. Run /arm first."
  exit 1
fi
SESSION_DIR=$(cat .claude/artifacts/current.txt)
if [ ! -f "$SESSION_DIR/brief.md" ]; then
  echo "ERROR: No brief.md found in $SESSION_DIR. Run /arm first."
  exit 1
fi
```

If no session exists, stop and tell the user to run `/arm <task>` first.

---

## Technical Design

Use the **architect** agent.

**Input:** Read `brief.md` from the current session directory.

**Process:**

1. Extract key requirements and technology keywords from the brief
2. Research live documentation via WebSearch and WebFetch:
   - For each library/API mentioned, find current best practices
   - Get specific API patterns, configuration options, gotchas
   - Note the URLs and relevant quotes
3. Analyze existing codebase patterns via Glob/Grep/Read:
   - How does RDO already handle similar features?
   - What patterns should we follow for consistency?
4. Make design decisions:
   - Each decision must cite live docs OR existing codebase
   - Document alternatives considered and why rejected
5. Define component interfaces, data models, API contracts
6. Output `design.md` to the session directory

---

## Documentation Research Guidelines

For each technology decision:

1. **Search:** `[technology] documentation 2024` or `[library] best practices`
2. **Fetch:** Read the actual docs page, not just search results
3. **Extract:** Specific recommendations, code patterns, warnings
4. **Cite:** Include URL and relevant quote in the design

Example citation:
```markdown
**Decision:** Use React Query's `staleTime` of 5 minutes for company data.

**Source:** https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
> "staleTime defaults to 0, meaning queries will be considered stale immediately"

We set 5 minutes because company data changes infrequently.
```

---

## Output

After design, report:

```
## Technical Design Complete

**Session:** {session-directory}
**Verdict:** [READY_FOR_REVIEW | NEEDS_RESEARCH]

### Summary
[2-3 sentence overview]

### Key Decisions
1. [Decision 1]
2. [Decision 2]
...

### Documentation Sources
- [URL 1] — [What it provided]
- [URL 2] — [What it provided]

### Next Step
Run `/ar` for adversarial review of the design.
```

---

## Gate

This command requires `brief.md` to exist. It produces `design.md` which is required by `/ar`.
