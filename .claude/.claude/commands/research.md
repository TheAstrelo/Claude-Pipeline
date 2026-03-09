Investigate libraries, APIs, prior art, and competing approaches for the following task:

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

## Research Execution

Use the **researcher** agent.

**Process:**

1. Parse the task description for technology keywords, library names, API references
2. Search the existing codebase for related implementations
3. WebSearch for each technology keyword: best practices, alternatives, comparisons
4. WebFetch official documentation pages for relevant APIs/libraries
5. Search for known issues, breaking changes, or deprecation notices
6. Compile findings into structured research document
7. Output `research.md` to the session directory

---

## Output

After research, report:

```
## Research Complete

**Session:** {session-directory}
**Verdict:** [SUFFICIENT | NEEDS_MORE_RESEARCH]

### Task Context
[Summary of what was researched]

### Key Findings
[Top 3-5 findings]

### Recommendation
[Which approach to pursue and why]

### Next Step
Run `/arm <task>` to crystallize requirements with research context.
```

---

## Gate

This command creates the session and `research.md`. The `/arm` command can consume research.md as optional context.
