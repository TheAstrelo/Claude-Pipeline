# Development Pipeline (Memory-Safe, Interactive)

Run the unified quality-gated development pipeline for the following task:

$ARGUMENTS

---

## Memory-Safe Execution Model

Each phase runs as a **SEPARATE `claude -p` subprocess** to prevent Bun memory accumulation (~1.35GB RSS crash). The orchestrating session (this one) stays lightweight — it only:

1. Builds the phase prompt (including task, session dir, upstream artifacts)
2. Executes via Bash: `echo "$PROMPT" | claude -p --dangerously-skip-permissions`
3. Reads the artifact file to verify it was created
4. Runs validators (grep checks on artifact files)
5. **Presents the artifact to the user and WAITS for response** before proceeding

**Do NOT run phase logic directly in this session.** Do NOT use agent tools (Grep/Glob/WebSearch) for phase work. Only use Read/Grep to check artifact files after subprocess completion.

After each artifact-producing phase (1-6), **pause and present the output to the user**. Wait for the user to say "continue" (or provide feedback) before proceeding. QA phases (7-11) run automatically without pauses.

---

## Phase 0: Session Setup

Create a new session directory:

```bash
SESSION_DIR=".claude/artifacts/$(date +%Y%m%d-%H%M%S)-$(echo '$ARGUMENTS' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-40)"
mkdir -p "$SESSION_DIR"
echo "$SESSION_DIR" > .claude/artifacts/current.txt
```

---

## Subprocess Helper Pattern

For every phase, use this pattern via the **Bash tool**:

```bash
PROMPT='<phase prompt with task + upstream artifacts embedded>'
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/<artifact>.raw"
# Fallback: if subprocess didn't write the artifact file, use raw output
[[ ! -f "$SESSION_DIR/<artifact>" ]] && [[ -f "$SESSION_DIR/<artifact>.raw" ]] && cp "$SESSION_DIR/<artifact>.raw" "$SESSION_DIR/<artifact>"
```

After subprocess completes:
1. Use **Read tool** to read the artifact
2. Use **Grep tool** to run validator checks
3. Present a summary to the user
4. **WAIT for user response** (phases 1-6)

---

## Phase 1: Requirements Crystallization

**Spawn subprocess via Bash tool:**
```bash
PRECHECK=$(cat "$SESSION_DIR/pre-check.md" 2>/dev/null || echo "No pre-check available")

PROMPT="You are the Requirements Agent. Your task: $TASK

Pre-check context:
$PRECHECK

Explore the codebase to understand relevant existing code. Extract clear, testable requirements.

Write output to $SESSION_DIR/brief.md with sections:
## Verdict: [CLEAR | NEEDS_INPUT]
## Problem (1-2 sentences)
## Success Criteria (numbered, testable)
## Scope (In/Out)
## Constraints
## Context Found
## Assumptions

Max 3 clarifying questions. Skip Q&A if the task is specific."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/brief.md.raw"
[[ ! -f "$SESSION_DIR/brief.md" ]] && [[ -f "$SESSION_DIR/brief.md.raw" ]] && cp "$SESSION_DIR/brief.md.raw" "$SESSION_DIR/brief.md"
```

**Validators** (run via Grep):
```
has_problem       → grep "## Problem" $SESSION_DIR/brief.md
has_criteria      → grep "## Success Criteria" $SESSION_DIR/brief.md
no_ambiguity      → ! grep "NEEDS_INPUT" $SESSION_DIR/brief.md  (HARD)
```

### Checkpoint

Read the artifact with Read tool, then present:

```
Phase 1 Complete — Requirements crystallized.
Standalone command: /arm

[Brief summary: problem statement + success criteria]

Artifact: {session-dir}/brief.md

Tip: You can run this phase independently anytime with `/arm <task>`.

Review the brief above. Reply with feedback to revise, or "continue" to proceed to Phase 2: Technical Design.
```

**WAIT for user response before continuing.**

---

## Phase 2: Technical Design

**Spawn subprocess via Bash tool:**
```bash
BRIEF=$(cat "$SESSION_DIR/brief.md" 2>/dev/null || echo "No brief available")

PROMPT="You are the Architect Agent. Create a technical design based on these requirements.

Requirements brief:
$BRIEF

Research live documentation for relevant libraries/APIs. Analyze existing codebase patterns. Make design decisions — each must cite live docs OR existing codebase patterns.

Write output to $SESSION_DIR/design.md with:
## Decisions (max 6, each: **{choice}** — {rationale} — Source: {URL or file:line})
## Components (table, max 4: Name | Purpose | Interface)
## Data Changes (SQL or 'None')
## Risks (table: Risk | Mitigation)

Every decision must cite a source. If docs can't be found, output NEEDS_RESEARCH."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/design.md.raw"
[[ ! -f "$SESSION_DIR/design.md" ]] && [[ -f "$SESSION_DIR/design.md.raw" ]] && cp "$SESSION_DIR/design.md.raw" "$SESSION_DIR/design.md"
```

**Validators:**
```
has_decisions      → grep "## Decisions" $SESSION_DIR/design.md
has_sources        → grep -c "Source:" $SESSION_DIR/design.md >= 1
no_research_gap    → ! grep "NEEDS_RESEARCH" $SESSION_DIR/design.md  (HARD)
```

### Checkpoint

```
Phase 2 Complete — Technical design ready.
Standalone command: /design

[Summary: key decisions, components, data flow]

Artifact: {session-dir}/design.md

Tip: You can run this phase independently with `/design`.

Review the design above. Reply with feedback to revise, or "continue" to proceed to Phase 3: Adversarial Review.
```

**WAIT for user response before continuing.**

---

## Phase 3: Adversarial Review

**Spawn subprocess via Bash tool:**
```bash
DESIGN=$(cat "$SESSION_DIR/design.md" 2>/dev/null || echo "No design available")

PROMPT="You are the Adversarial Review Agent. Critique this design from 3 angles.

Design:
$DESIGN

Angles: Architect (scalability/coupling), Skeptic (edge cases/security), Implementer (types/testability).

Write output to $SESSION_DIR/critique.md with:
## Verdict: [APPROVED | REVISE_DESIGN]
## Issues (table, max 10: # | Angle | Severity | Issue | Fix)
## Consensus (issues raised by 2+ angles)
## Blocks (if REVISE_DESIGN: list of must-fix items)

Rules: Any HIGH -> REVISE_DESIGN. 3+ MEDIUM -> REVISE_DESIGN. Any consensus -> REVISE_DESIGN."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/critique.md.raw"
[[ ! -f "$SESSION_DIR/critique.md" ]] && [[ -f "$SESSION_DIR/critique.md.raw" ]] && cp "$SESSION_DIR/critique.md.raw" "$SESSION_DIR/critique.md"
```

**Validators:**
```
has_verdict        → grep -E "APPROVED|REVISE_DESIGN" $SESSION_DIR/critique.md
no_high_severity   → ! grep "| HIGH |" $SESSION_DIR/critique.md  (HARD)
few_medium         → grep -c "MEDIUM" $SESSION_DIR/critique.md < 3
```

### Checkpoint

```
Phase 3 Complete — Adversarial review done.
Standalone command: /ar

**Verdict:** [APPROVED | REVISE_DESIGN]

[Summary: consensus issues, high severity items, critic breakdown]

Artifact: {session-dir}/critique.md

Tip: You can run this phase independently with `/ar`.

[If APPROVED] Reply "continue" to proceed to Phase 4: Planning.
[If REVISE_DESIGN] I recommend revising the design. Reply "revise" to go back to Phase 2, or "override" to proceed anyway.
```

**WAIT for user response before continuing.**

- If user says **"revise"**: Spawn a design revision subprocess with the critique feedback, then re-run Phase 3. Max 2 revision cycles.

  ```bash
  CRITIQUE=$(cat "$SESSION_DIR/critique.md")
  DESIGN=$(cat "$SESSION_DIR/design.md")

  PROMPT="You are the Architect Agent. Revise your design based on this adversarial critique.

  Previous design:
  $DESIGN

  Critique (issues to address):
  $CRITIQUE

  Address all HIGH and consensus issues. Write the revised design to $SESSION_DIR/design.md."

  echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/design.md.raw"
  [[ ! -f "$SESSION_DIR/design.md" ]] && [[ -f "$SESSION_DIR/design.md.raw" ]] && cp "$SESSION_DIR/design.md.raw" "$SESSION_DIR/design.md"
  ```

  Then re-run Phase 3 subprocess and checkpoint.

- If user says **"override"**: Log override in critique.md, proceed to Phase 4.

---

## Phase 4: Deterministic Planning

**Spawn subprocess via Bash tool:**
```bash
DESIGN=$(cat "$SESSION_DIR/design.md" 2>/dev/null || echo "No design available")
CRITIQUE=$(cat "$SESSION_DIR/critique.md" 2>/dev/null || echo "")

PROMPT="You are the Planning Agent. Convert this design into implementation steps.

Design:
$DESIGN

Critique context (edge cases to address):
$CRITIQUE

For each change: verify file paths, read current code, create BEFORE/AFTER snippets.

Write output to $SESSION_DIR/plan.md with:
## Verdict: [READY | NEEDS_DETAIL]
## Steps (table: # | File | Action | Depends)
Then for each step:
### Step N: {title}
**File:** path [MODIFY|CREATE]
**Deps:** list or None
**Before:** (current code, 3-5 lines context)
**After:** (new code, paste-ready)
**Test:** {input} -> {expected output}

Max 8 steps. All MODIFY paths must exist on disk."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/plan.md.raw"
[[ ! -f "$SESSION_DIR/plan.md" ]] && [[ -f "$SESSION_DIR/plan.md.raw" ]] && cp "$SESSION_DIR/plan.md.raw" "$SESSION_DIR/plan.md"
```

**Validators:**
```
has_steps          → grep -c "### Step" $SESSION_DIR/plan.md >= 1  (HARD)
max_8_steps        → grep -c "### Step" $SESSION_DIR/plan.md <= 8
no_detail_flag     → ! grep "NEEDS_DETAIL" $SESSION_DIR/plan.md  (HARD)
```

### Checkpoint

```
Phase 4 Complete — Implementation plan ready.
Standalone command: /plan

[Summary: step overview table, files affected]

Artifact: {session-dir}/plan.md

Tip: You can run this phase independently with `/plan`.

Review the plan above. Reply with feedback to revise, or "continue" to proceed to Phase 5: Drift Detection.
```

**WAIT for user response before continuing.**

---

## Phase 5: Drift Detection

**Spawn subprocess via Bash tool:**
```bash
DESIGN=$(cat "$SESSION_DIR/design.md" 2>/dev/null || echo "No design available")
PLAN=$(cat "$SESSION_DIR/plan.md" 2>/dev/null || echo "No plan available")

PROMPT="You are the Drift Detection Agent. Verify the plan covers all design requirements.

Design:
$DESIGN

Plan:
$PLAN

Write output to $SESSION_DIR/drift-report.md with:
## Verdict: [ALIGNED | DRIFT_DETECTED]
## Coverage Matrix (table: Design Requirement | Plan Step | Status)
## Missing Coverage
## Scope Creep
## Summary (Requirements: N, Covered: N, Missing: N, Coverage: N%)"

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/drift-report.md.raw"
[[ ! -f "$SESSION_DIR/drift-report.md" ]] && [[ -f "$SESSION_DIR/drift-report.md.raw" ]] && cp "$SESSION_DIR/drift-report.md.raw" "$SESSION_DIR/drift-report.md"
```

**Validators:**
```
has_verdict        → grep -E "ALIGNED|DRIFT_DETECTED" $SESSION_DIR/drift-report.md  (HARD)
no_drift           → ! grep "DRIFT_DETECTED" $SESSION_DIR/drift-report.md
```

### Checkpoint

```
Phase 5 Complete — Drift detection done.
Standalone command: /pmatch

**Verdict:** [ALIGNED | DRIFT_DETECTED]

[Summary: coverage stats, any drift issues]

Artifact: {session-dir}/drift-report.md

Tip: You can run this phase independently with `/pmatch`.

[If ALIGNED] Reply "continue" to proceed to Phase 6: Build.
[If DRIFT_DETECTED] Reply "fix-plan" to revise the plan, "fix-design" to revise the design, or "override" to build anyway.
```

**WAIT for user response before continuing.**

- If user says **"fix-plan"**: Re-spawn Phase 4 subprocess with drift feedback, then re-run Phase 5.

  ```bash
  DRIFT=$(cat "$SESSION_DIR/drift-report.md")
  PLAN=$(cat "$SESSION_DIR/plan.md")

  PROMPT="You are the Planning Agent. Add missing steps based on this drift report.

  Current plan:
  $PLAN

  Drift report (missing coverage):
  $DRIFT

  Add steps for any MISSING requirements. Keep existing steps. Write updated plan to $SESSION_DIR/plan.md."

  echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/plan.md.raw"
  [[ ! -f "$SESSION_DIR/plan.md" ]] && [[ -f "$SESSION_DIR/plan.md.raw" ]] && cp "$SESSION_DIR/plan.md.raw" "$SESSION_DIR/plan.md"
  ```

- If user says **"fix-design"**: Go back to Phase 2.
- If user says **"override"**: Log override, proceed to Phase 6.

---

## Phase 6: Build

**Spawn subprocess via Bash tool:**
```bash
PLAN=$(cat "$SESSION_DIR/plan.md" 2>/dev/null || echo "No plan available")

PROMPT="You are the Builder Agent. Execute this plan exactly as specified.

Plan:
$PLAN

For each step: read only referenced files, verify BEFORE matches, apply AFTER exactly, run tests. No improvisation, no refactoring untouched code.

After all steps: run npm run build and npx tsc --noEmit.

Write output to $SESSION_DIR/build-report.md with:
## Verdict: [SUCCESS | PARTIAL | FAILED]
## Results (table: Step | File | Status | Notes)
## Verification (Build: PASS/FAIL, Types: PASS/FAIL)
## Files Changed (list)"

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/build-report.md.raw"
[[ ! -f "$SESSION_DIR/build-report.md" ]] && [[ -f "$SESSION_DIR/build-report.md.raw" ]] && cp "$SESSION_DIR/build-report.md.raw" "$SESSION_DIR/build-report.md"
```

**Validators:**
```
no_blocked         → ! grep "BLOCKED" $SESSION_DIR/build-report.md  (HARD)
build_passes       → grep -E "Build:.*PASS|Build.*PASS" $SESSION_DIR/build-report.md
types_pass         → grep -E "Types:.*PASS|Types.*PASS" $SESSION_DIR/build-report.md
```

### Checkpoint

```
Phase 6 Complete — Build done.
Standalone command: /build

**Verdict:** [SUCCESS | PARTIAL | FAILED]

[Summary: steps completed, files changed, build/type check status]

Artifact: {session-dir}/build-report.md

Tip: You can run this phase independently with `/build`.

[If SUCCESS] Reply "continue" to run the QA pipeline (Phases 7-11, runs automatically).
[If PARTIAL/FAILED] Review the issues above. Reply "continue" to run QA anyway, or describe what needs fixing.
```

**WAIT for user response before continuing.**

---

## Phases 7-11: QA Pipeline (runs automatically, no pauses)

These phases run back-to-back without pausing. Each is a separate subprocess.

### Phase 7: Denoise

```bash
BUILD_REPORT=$(cat "$SESSION_DIR/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Denoiser Agent. Remove debug artifacts from changed files.

Build report:
$BUILD_REPORT

Remove: console.log/debug/trace, debugger statements, commented-out code, TODO/DEBUG/TEMP markers, unused imports.
Preserve: console.error with component prefix, explanatory comments, license headers.

Append results to $SESSION_DIR/qa-report.md with a ## Denoise section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/qa-denoise.raw"
```

### Phase 8: Quality Fit

```bash
BUILD_REPORT=$(cat "$SESSION_DIR/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Fit Agent. Check changed files for type safety, lint, and conventions.

Build report:
$BUILD_REPORT

Run npx tsc --noEmit and npx eslint on changed files. Check project conventions. Auto-fix violations. Append results to $SESSION_DIR/qa-report.md with a ## Quality Fit section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/qa-fit.raw"
```

### Phase 9: Quality Behavior

```bash
BUILD_REPORT=$(cat "$SESSION_DIR/build-report.md" 2>/dev/null || echo "No build report")
DESIGN=$(cat "$SESSION_DIR/design.md" 2>/dev/null || echo "")
CRITIQUE=$(cat "$SESSION_DIR/critique.md" 2>/dev/null || echo "")

PROMPT="You are the Quality Behavior Agent. Verify the code works as designed.

Build report:
$BUILD_REPORT

Design (expected behavior):
$DESIGN

Critique (edge cases to check):
$CRITIQUE

Run npm run build and npm test. Verify behavior matches design. Append results to $SESSION_DIR/qa-report.md with a ## Quality Behavior section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/qa-behavior.raw"
```

### Phase 10: Quality Docs

```bash
BUILD_REPORT=$(cat "$SESSION_DIR/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Docs Agent. Check documentation coverage for changed files.

Build report:
$BUILD_REPORT

Check: API route Swagger docs (required), public function JSDoc (recommended), type docs (nice-to-have). Append results to $SESSION_DIR/qa-report.md with a ## Quality Docs section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/qa-docs.raw"
```

### Phase 11: Security Review (HARD gate)

```bash
BUILD_REPORT=$(cat "$SESSION_DIR/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Security Agent. Scan changed files for vulnerabilities.

Build report:
$BUILD_REPORT

Scan for: SQL/command injection, XSS, auth gaps, hardcoded secrets, access control issues.

Append findings to $SESSION_DIR/qa-report.md with:
## Findings (table: Type | File:Line | Pattern | Severity | Fix)
## Summary (Injection: CLEAR/FOUND, Auth: N/M protected, Secrets: CLEAR/FOUND)
## Verdict: [PASS | FAIL | CRITICAL]

CRITICAL = injection or secrets. FAIL = XSS or auth bypass. PASS = all clear."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION_DIR/qa-security.raw"
```

**Security Validators** (run via Grep):
```
scan_complete      → grep "## Findings" $SESSION_DIR/qa-report.md  (HARD)
no_critical        → ! grep "CRITICAL" $SESSION_DIR/qa-report.md  (HARD)
no_sqli            → ! grep -i "SQLi" $SESSION_DIR/qa-report.md  (HARD)
auth_coverage      → ! grep -i "No middleware" $SESSION_DIR/qa-report.md  (HARD)
no_secrets         → ! grep -i "Hardcoded" $SESSION_DIR/qa-report.md  (HARD)
```

---

## Final Report

After all phases complete, present the final summary:

```
## Pipeline Complete

### Task
[Original task description]

### Session
[Session directory path]

### Phase Results
| Phase | Name | Command | Verdict |
|-------|------|---------|---------|
| 1 | Requirements | `/arm` | CRYSTALLIZED |
| 2 | Design | `/design` | READY_FOR_REVIEW |
| 3 | Adversarial Review | `/ar` | [APPROVED/REVISE_DESIGN] |
| 4 | Planning | `/plan` | [READY/NEEDS_DETAIL] |
| 5 | Drift Detection | `/pmatch` | [ALIGNED/DRIFT_DETECTED] |
| 6 | Build | `/build` | [SUCCESS/PARTIAL/FAILED] |
| 7 | Denoise | `/denoise` | [CLEAN/CLEANED] |
| 8 | Quality Fit | `/qf` | [PASS/FAIL] |
| 9 | Quality Behavior | `/qb` | [PASS/FAIL] |
| 10 | Quality Docs | `/qd` | [PASS/WARN/FAIL] |
| 11 | Security | `/security-review` | [PASS/FAIL/CRITICAL] |

### Files Changed
[List of all files modified/created]

### Overrides
[Any quality gates that were overridden, or "None"]

### Status: [COMPLETE | COMPLETE WITH WARNINGS | NEEDS ATTENTION]
```

---

## Skip Rules

- **Skip Phase 1 (Requirements)** if: the user says requirements are clear, OR passes `--skip-arm`. Session setup still runs.
- **Skip Phase 3 (Adversarial Review)** if: the user passes `--skip-ar` for smaller changes.
- **Skip Phase 5 (Drift Detection)** if: the user passes `--skip-pmatch`.
- **Never skip** Phases 0, 2, 4, 6, or the QA pipeline (7-11).

## Trivial Tasks

If the task is truly trivial (single-line fix, typo, config change), do NOT use this pipeline. Just make the change directly.
