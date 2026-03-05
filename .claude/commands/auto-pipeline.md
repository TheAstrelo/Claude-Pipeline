# Automated Pipeline (Memory-Safe)

Run: `/auto-pipeline [--profile=yolo|standard|paranoid] [--skip-arm] [--skip-ar] [--skip-pmatch] <task>`

$ARGUMENTS

---

## Memory-Safe Execution Model

Each phase runs as a **SEPARATE `claude -p` subprocess** to prevent Bun memory accumulation (~1.35GB RSS crash). The orchestrating session (this one) stays lightweight — it only:

1. Builds the phase prompt (including task, session dir, upstream artifacts)
2. Executes via Bash: `echo "$PROMPT" | claude -p --dangerously-skip-permissions`
3. Verifies the artifact was created
4. Runs validators (grep checks on artifact files)
5. Applies gate decision (AUTO/WARN/PAUSE)

**Do NOT run phase logic directly in this session.** Do NOT use agent tools (Grep/Glob/Read/WebSearch) for phase work. Only use Read/Grep to check artifact files after subprocess completion.

---

## Session Setup

```bash
PROFILE="${PROFILE:-standard}"
GATE_MODE="${GATE_MODE:-mixed}"
SESSION=".claude/artifacts/$(date +%Y%m%d-%H%M%S)-$(echo '$ARGUMENTS' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-40)"
mkdir -p "$SESSION"
echo "$SESSION" > .claude/artifacts/current.txt
```

Parse flags from `$ARGUMENTS`:
- `--profile=yolo` → SKIP_PHASES=(3 5 7 8 9 10), GATE_MODE=soft
- `--profile=standard` → SKIP_PHASES=(), GATE_MODE=mixed
- `--profile=paranoid` → SKIP_PHASES=(), GATE_MODE=hard
- `--skip-arm` → add 1 to SKIP_PHASES
- `--skip-ar` → add 3 to SKIP_PHASES
- `--skip-pmatch` → add 5 to SKIP_PHASES

Remaining text after flags = TASK.

---

## Subprocess Helper

For every phase, use this pattern via the **Bash tool**:

```bash
PROMPT='<phase prompt here>'
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/<artifact>.raw"
# Fallback: if Claude didn't write the artifact file, use raw output
[[ ! -f "$SESSION/<artifact>" ]] && [[ -f "$SESSION/<artifact>.raw" ]] && cp "$SESSION/<artifact>.raw" "$SESSION/<artifact>"
```

After each subprocess completes:
1. Use the **Read tool** to verify the artifact exists and read key sections
2. Use the **Grep tool** to run validator checks
3. Apply gate decision based on validator results

---

## Gate Logic

```
gate_decision(hard_fails, soft_fails):
  if hard_fails > 0 → PAUSE
  if soft_fails == 0 → AUTO
  if GATE_MODE == "soft" → AUTO
  if GATE_MODE == "mixed" → WARN (log and proceed)
  if GATE_MODE == "hard" → PAUSE
```

- **AUTO**: Proceed to next phase
- **WARN**: Log warning, proceed
- **PAUSE**: Stop and ask user for [c]ontinue / [r]evise / [o]verride / [q]uit

---

## Phase 0: Pre-Check (NEVER SKIP, HARD gate)

**Spawn subprocess:**
```bash
PROMPT="You are the Pre-Check Agent. Your task: $TASK

Search the codebase for existing implementations related to this task. Check the package manifest for relevant installed libraries. Search the web for up to 3 external options.

Write your output as a markdown file to $SESSION/pre-check.md with these sections:
- ## Codebase Matches (table: Type | Path | Relevance)
- ## Installed Libraries (table: Package | Version | Purpose)
- ## Recommendation (one of: EXTEND_EXISTING, USE_LIBRARY, BUILD_NEW)
- **Reasoning:** (1-2 sentences)"

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/pre-check.md.raw"
[[ ! -f "$SESSION/pre-check.md" ]] && [[ -f "$SESSION/pre-check.md.raw" ]] && cp "$SESSION/pre-check.md.raw" "$SESSION/pre-check.md"
```

**Validators** (run via Grep on artifact):
```
codebase_searched    → grep -qi "Codebase Matches\|Codebase Findings" $SESSION/pre-check.md
has_recommendation   → grep -qiE "EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW" $SESSION/pre-check.md
reasoning_present    → grep -qi "Reasoning" $SESSION/pre-check.md  (SOFT)
```

---

## Phase 1: Requirements (SOFT gate)

Skip if `--skip-arm` or in SKIP_PHASES.

**Spawn subprocess:**
```bash
PRECHECK=$(cat "$SESSION/pre-check.md" 2>/dev/null || echo "No pre-check available")

PROMPT="You are the Requirements Agent. Your task: $TASK

Pre-check context:
$PRECHECK

Extract clear, testable requirements. Write output to $SESSION/brief.md with sections:
## Verdict: [CLEAR | NEEDS_INPUT]
## Problem (1-2 sentences)
## Success Criteria (numbered, testable)
## Scope (In/Out)
## Constraints
## Context Found
## Assumptions

Max 3 clarifying questions. Skip Q&A if the task is specific. Output NEEDS_INPUT only if genuinely ambiguous."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/brief.md.raw"
[[ ! -f "$SESSION/brief.md" ]] && [[ -f "$SESSION/brief.md.raw" ]] && cp "$SESSION/brief.md.raw" "$SESSION/brief.md"
```

**Validators:**
```
has_problem       → grep "## Problem" $SESSION/brief.md
has_criteria      → grep "## Success Criteria" $SESSION/brief.md
no_ambiguity      → ! grep "NEEDS_INPUT" $SESSION/brief.md  (HARD)
```

---

## Phase 2: Design (SOFT gate)

**Spawn subprocess:**
```bash
BRIEF=$(cat "$SESSION/brief.md" 2>/dev/null || echo "No brief available")

PROMPT="You are the Architect Agent. Create a technical design based on these requirements.

Requirements brief:
$BRIEF

Research live documentation for relevant libraries/APIs. Analyze existing codebase patterns. Make design decisions — each must cite live docs OR existing codebase patterns.

Write output to $SESSION/design.md with:
## Decisions (max 6, each: **{choice}** — {rationale} — Source: {URL or file:line})
## Components (table, max 4: Name | Purpose | Interface)
## Data Changes (SQL or 'None')
## Risks (table: Risk | Mitigation)

Every decision must cite a source. If docs can't be found, output NEEDS_RESEARCH."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/design.md.raw"
[[ ! -f "$SESSION/design.md" ]] && [[ -f "$SESSION/design.md.raw" ]] && cp "$SESSION/design.md.raw" "$SESSION/design.md"
```

**Validators:**
```
has_decisions      → grep "## Decisions" $SESSION/design.md
has_sources        → grep -c "Source:" $SESSION/design.md >= 1
no_research_gap    → ! grep "NEEDS_RESEARCH" $SESSION/design.md  (HARD)
```

---

## Phase 3: Adversarial Review (HARD gate)

Skip if `--skip-ar` or in SKIP_PHASES.

**Spawn subprocess:**
```bash
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "No design available")

PROMPT="You are the Adversarial Review Agent. Critique this design from 3 angles.

Design:
$DESIGN

Angles: Architect (scalability/coupling), Skeptic (edge cases/security), Implementer (types/testability).

Write output to $SESSION/critique.md with:
## Verdict: [APPROVED | REVISE_DESIGN]
## Issues (table, max 10: # | Angle | Severity | Issue | Fix)
## Consensus (issues raised by 2+ angles)
## Blocks (if REVISE_DESIGN: list of must-fix items)

Rules: Any HIGH -> REVISE_DESIGN. 3+ MEDIUM -> REVISE_DESIGN. Any consensus -> REVISE_DESIGN."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/critique.md.raw"
[[ ! -f "$SESSION/critique.md" ]] && [[ -f "$SESSION/critique.md.raw" ]] && cp "$SESSION/critique.md.raw" "$SESSION/critique.md"
```

**Validators:**
```
has_verdict        → grep -E "APPROVED|REVISE_DESIGN" $SESSION/critique.md
no_high_severity   → ! grep "| HIGH |" $SESSION/critique.md  (HARD)
few_medium         → grep -c "MEDIUM" $SESSION/critique.md < 3
```

**On REVISE_DESIGN:** Auto-recovery — spawn a revision subprocess:
```bash
CRITIQUE=$(cat "$SESSION/critique.md")
DESIGN=$(cat "$SESSION/design.md")

PROMPT="You are the Architect Agent. Revise your design based on this adversarial critique.

Previous design:
$DESIGN

Critique (issues to address):
$CRITIQUE

Address all HIGH and consensus issues. Write the revised design to $SESSION/design.md."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/design.md.raw"
[[ ! -f "$SESSION/design.md" ]] && [[ -f "$SESSION/design.md.raw" ]] && cp "$SESSION/design.md.raw" "$SESSION/design.md"
```
Then re-run Phase 3 (max 1 retry). If still REVISE_DESIGN after retry, PAUSE.

---

## Phase 4: Planning (SOFT gate)

<<<<<<< Updated upstream
Agent: `planner-slim` | Budget: 5000 tokens
Input: Design decisions + file paths
Output: `plan.md`

**Validators:**
```
✓ has_steps                    → grep -c "### Step" ≥ 1 (HARD)
✓ has_before_after             → steps count = "**Before:**" count
✓ max_8_steps_per_phase        → grep -c "### Step" ≤ 8
✓ continuation_has_remaining   → if NEEDS_CONTINUATION, has "## Remaining Work" (HARD)
✓ continuation_phases_doc      → if NEEDS_CONTINUATION, remaining phases listed
✓ paths_verified               → MODIFY files exist (HARD)
✓ no_detail_flag               → ! grep "NEEDS_DETAIL" (HARD)
✓ valid_verdict                → READY | NEEDS_DETAIL | NEEDS_CONTINUATION (HARD)
```

**On NEEDS_CONTINUATION:**
```
1. Notify user: "Task requires X phases. Starting Phase 1 of X."
2. Display phase breakdown from "Remaining Work" table
3. Proceed to Phase 5 (Drift) → Phase 6 (Build) for current phase
4. After Phase 6 completes, prompt: "Phase 1 complete. Continue to Phase 2? [y/n]"
5. If yes: Loop back to Phase 4 with context:
   - Previous phases completed
   - Remaining Work for Phase 2
   - Design constraints preserved
6. Repeat until all phases complete
```

**Phase Continuation Context:**
```markdown
# Continuation Context

## Completed Phases
- Phase 1: [summary] — Steps 1-N ✓

## Current Phase: 2 of X

## Remaining Work
[From previous plan.md]

## Design Reference
[Original design.md — do not modify]
```

---

## Phase 5: Drift (SOFT gate)

Agent: `drift-detector` | Budget: 3000 tokens
Input: Requirements list + step titles
Output: `drift-report.md`

**Validators:**
```
✓ has_verdict       → grep -E "ALIGNED|DRIFT" (HARD)
✓ coverage_ok       → coverage % ≥ 90
✓ no_drift          → ! grep "DRIFT_DETECTED"
```

**On DRIFT_DETECTED:** Auto-add missing steps (max 1 retry)

---

## Phase 6: Build (NONE gate, but HARD on blocked)

Agent: `builder-slim` | Budget: 2000 tokens/step
Input: One step at a time
Output: `build-report.md`

**Validators:**
```
✓ no_blocked        → ! grep "BLOCKED" (HARD)
✓ build_passes      → grep "Build:.*PASS"
✓ types_pass        → grep "Types:.*PASS"
```

**On step failure:** Auto-retry fix (max 2 per step)
**On BLOCKED:** Pause — plan needs update

---

## Phases 7-11: QA (NONE gate, auto-fix)

Run in parallel. Budget: 3000 tokens each.

**Cache Check (QA Rules):**
=======
**Spawn subprocess:**
>>>>>>> Stashed changes
```bash
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "No design available")

PROMPT="You are the Planning Agent. Convert this design into implementation steps.

Design:
$DESIGN

Write output to $SESSION/plan.md with:
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

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/plan.md.raw"
[[ ! -f "$SESSION/plan.md" ]] && [[ -f "$SESSION/plan.md.raw" ]] && cp "$SESSION/plan.md.raw" "$SESSION/plan.md"
```

**Validators:**
```
has_steps          → grep -c "### Step" $SESSION/plan.md >= 1  (HARD)
max_8_steps        → grep -c "### Step" $SESSION/plan.md <= 8
no_detail_flag     → ! grep "NEEDS_DETAIL" $SESSION/plan.md  (HARD)
```

---

## Phase 5: Drift Detection (SOFT gate)

Skip if `--skip-pmatch` or in SKIP_PHASES.

**Spawn subprocess:**
```bash
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "No design available")
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")

PROMPT="You are the Drift Detection Agent. Verify the plan covers all design requirements.

Design:
$DESIGN

Plan:
$PLAN

Write output to $SESSION/drift-report.md with:
## Verdict: [ALIGNED | DRIFT_DETECTED]
## Coverage Matrix (table: Design Requirement | Plan Step | Status)
## Missing Coverage
## Scope Creep
## Summary (Requirements: N, Covered: N, Missing: N, Coverage: N%)"

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/drift-report.md.raw"
[[ ! -f "$SESSION/drift-report.md" ]] && [[ -f "$SESSION/drift-report.md.raw" ]] && cp "$SESSION/drift-report.md.raw" "$SESSION/drift-report.md"
```

**Validators:**
```
has_verdict        → grep -E "ALIGNED|DRIFT_DETECTED" $SESSION/drift-report.md  (HARD)
no_drift           → ! grep "DRIFT_DETECTED" $SESSION/drift-report.md
```

**On DRIFT_DETECTED:** Auto-recovery — spawn a plan revision subprocess:
```bash
DRIFT=$(cat "$SESSION/drift-report.md")
PLAN=$(cat "$SESSION/plan.md")

PROMPT="You are the Planning Agent. Add missing steps based on this drift report.

Current plan:
$PLAN

Drift report (missing coverage):
$DRIFT

Add steps for any MISSING requirements. Keep existing steps. Write updated plan to $SESSION/plan.md."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/plan.md.raw"
[[ ! -f "$SESSION/plan.md" ]] && [[ -f "$SESSION/plan.md.raw" ]] && cp "$SESSION/plan.md.raw" "$SESSION/plan.md"
```
Then re-run Phase 5 (max 1 retry). If still drifting, PAUSE.

---

## Phase 6: Build (NONE gate, HARD on blocked)

**Spawn subprocess:**
```bash
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")

PROMPT="You are the Builder Agent. Execute this plan exactly as specified.

Plan:
$PLAN

For each step: read only referenced files, verify BEFORE matches, apply AFTER exactly, run tests. No improvisation, no refactoring untouched code.

Write output to $SESSION/build-report.md with:
## Verdict: [SUCCESS | PARTIAL | FAILED]
## Results (table: Step | File | Status | Notes)
## Verification (Build: PASS/FAIL, Types: PASS/FAIL)
## Files Changed (list)"

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/build-report.md.raw"
[[ ! -f "$SESSION/build-report.md" ]] && [[ -f "$SESSION/build-report.md.raw" ]] && cp "$SESSION/build-report.md.raw" "$SESSION/build-report.md"
```

**Validators:**
```
no_blocked         → ! grep "BLOCKED" $SESSION/build-report.md  (HARD)
build_passes       → grep -E "Build:.*PASS|Build.*PASS" $SESSION/build-report.md
types_pass         → grep -E "Types:.*PASS|Types.*PASS" $SESSION/build-report.md
```

---

## Phases 7-10: QA (NONE gate, auto-fix)

Run sequentially. Each is a separate subprocess. No pauses.

### Phase 7: Denoise

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Denoiser Agent. Remove debug artifacts from changed files.

Build report:
$BUILD_REPORT

Remove: console.log/debug/trace, debugger statements, commented-out code, TODO/DEBUG/TEMP markers, unused imports.
Preserve: console.error with component prefix, explanatory comments, license headers.

Append results to $SESSION/qa-report.md with a ## Denoise section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-denoise.raw"
```

### Phase 8: Quality Fit

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Fit Agent. Check changed files for type safety, lint, and conventions.

Build report:
$BUILD_REPORT

Run type checker and linter on changed files. Check project conventions. Auto-fix violations. Append results to $SESSION/qa-report.md with a ## Quality Fit section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-fit.raw"
```

### Phase 9: Quality Behavior

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "")
CRITIQUE=$(cat "$SESSION/critique.md" 2>/dev/null || echo "")

PROMPT="You are the Quality Behavior Agent. Verify the code works as designed.

Build report:
$BUILD_REPORT

Design (expected behavior):
$DESIGN

Critique (edge cases to check):
$CRITIQUE

Run build, run tests, verify behavior matches design. Append results to $SESSION/qa-report.md with a ## Quality Behavior section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-behavior.raw"
```

### Phase 10: Quality Docs

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Docs Agent. Check documentation coverage for changed files.

Build report:
$BUILD_REPORT

Check: API route docs (required), public function docs (recommended), type docs (nice-to-have). Append results to $SESSION/qa-report.md with a ## Quality Docs section."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-docs.raw"
```

---

## Phase 11: Security (HARD gate, NEVER SKIP)

**Spawn subprocess:**
```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Security Agent. Scan changed files for vulnerabilities.

Build report:
$BUILD_REPORT

Scan for: SQL/command injection, XSS, auth gaps, hardcoded secrets, access control issues.

Append findings to $SESSION/qa-report.md with:
## Findings (table: Type | File:Line | Pattern | Severity | Fix)
## Summary (Injection: CLEAR/FOUND, Auth: N/M protected, Secrets: CLEAR/FOUND)
## Verdict: [PASS | FAIL | CRITICAL]

CRITICAL = injection or secrets. FAIL = XSS or auth bypass. PASS = all clear."

echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-security.raw"
[[ ! -f "$SESSION/qa-report.md" ]] && echo "Security scan produced no qa-report.md" >&2
```

**Validators:**
```
scan_complete      → grep "## Findings" $SESSION/qa-report.md  (HARD)
no_critical        → ! grep "CRITICAL" $SESSION/qa-report.md  (HARD)
no_sqli            → ! grep -i "SQLi" $SESSION/qa-report.md  (HARD)
auth_coverage      → ! grep -i "No middleware" $SESSION/qa-report.md  (HARD)
no_secrets         → ! grep -i "Hardcoded" $SESSION/qa-report.md  (HARD)
```

**On CRITICAL:** Always PAUSE, no override even in yolo mode.

---

## Final Output

<<<<<<< Updated upstream
**Single-Phase Task:**
=======
After all phases, present the summary:

>>>>>>> Stashed changes
```
Pipeline Complete [PROFILE: $PROFILE]

Task: $TASK
Session: $SESSION

Phases:
 0. Pre-Check        [result]
 1. Requirements     [result]
 2. Design           [result]
 3. Adversarial      [result]
 4. Planning         [result]
 5. Drift Detection  [result]
 6. Build            [result]
 7. Denoise          [result]
 8. Quality Fit      [result]
 9. Quality Behavior [result]
10. Quality Docs     [result]
11. Security         [result]

Validators: N passed, N failed
Warnings: [list or none]
Artifacts: $SESSION/
```

**Multi-Phase Task (NEEDS_CONTINUATION):**
```
Pipeline Complete [PROFILE: standard] [MULTI-PHASE: 3 of 3]

Task: {task}
Session: {session}
Tokens used: {count}

Build Phases:
  Phase 1/3: Database + API endpoints    ✓ (Steps 1-6)
  Phase 2/3: Auth middleware + JWT       ✓ (Steps 1-5)
  Phase 3/3: Frontend components         ✓ (Steps 1-4)

Pipeline Summary:
0. Pre-Check     [AUTO]  → BUILD_NEW
1. Requirements  [AUTO]  validators: 3/3 ✓
2. Design        [AUTO]  validators: 4/4 ✓
3. Adversarial   [AUTO]  validators: 4/4 ✓
4. Planning      [CONT]  3 phases identified
   ├─ Phase 1    [AUTO]  6 steps → Build ✓ → QA ✓
   ├─ Phase 2    [AUTO]  5 steps → Build ✓ → QA ✓
   └─ Phase 3    [AUTO]  4 steps → Build ✓ → QA ✓
11. Security     [AUTO]  validators: 5/5 ✓

Total steps executed: 15 (across 3 phases)
Files changed: {list}
Warnings: {any}
```

---

## Profiles

| Profile | Skips | Gate Mode | Use Case |
|---------|-------|-----------|----------|
| yolo | 3,5,7-10 | soft | Prototypes |
| standard | none | mixed | Normal dev |
| paranoid | none | hard | Production |

---

## Validation Summary

| Profile | HARD fail | SOFT fail | Result |
|---------|-----------|-----------|--------|
| yolo | PAUSE | AUTO | Only critical issues stop |
| standard | PAUSE | WARN | Log warnings, pause on critical |
| paranoid | PAUSE | PAUSE | Any issue stops |
