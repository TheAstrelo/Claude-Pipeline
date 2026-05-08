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
PROMPT="You are the Pre-Check Agent.

## CONSTRAINTS
- Max 3 web searches. Stop earlier if a strong codebase match exists.
- Recommend EXTEND_EXISTING when a HIGH-relevance codebase match is found.
- Recommend USE_LIBRARY only if the package is already installed or widely adopted.
- Task Triage is advisory — never recommend overriding the user's chosen profile silently.

## CONTEXT
Task: $TASK
Working directory: project root
Manifest: package.json (if present)

## TASK
Find existing implementations before anything new is built. Assess task complexity and risk to inform profile selection.

## FORMAT
Write to \$SESSION/pre-check.md with these sections:
- ## Codebase Matches (table: Type | Path | Relevance)
- ## Installed Libraries (table: Package | Version | Purpose)
- ## Recommendation (one of: EXTEND_EXISTING, USE_LIBRARY, BUILD_NEW)
- **Reasoning:** (1-2 sentences)
- ## Task Triage
  - **Complexity:** [LOW | MEDIUM | HIGH] — (1 sentence justification)
  - **Risk:** [LOW | MEDIUM | HIGH] — (1 sentence justification)
  - **Recommended Profile:** [yolo | standard | paranoid]
  - **Human Review:** [list of phase numbers, or \"None\"]

## VERIFY
Before writing, confirm:
- Codebase Matches table exists (even if empty)
- Recommendation is exactly one of the three allowed values
- Task Triage Complexity, Risk, and Recommended Profile fields are filled
- Human Review lists phase numbers (e.g., \"3, 11\") or the literal string \"None\""

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/pre-check.md.raw"
[[ ! -f "\$SESSION/pre-check.md" ]] && [[ -f "\$SESSION/pre-check.md.raw" ]] && cp "\$SESSION/pre-check.md.raw" "\$SESSION/pre-check.md"

# Profile-mismatch warning (Delegation: human decides)
RECOMMENDED=$(grep -oE "Recommended Profile:.*(yolo|standard|paranoid)" "$SESSION/pre-check.md" | grep -oE "(yolo|standard|paranoid)" | head -1)
if [[ -n "$RECOMMENDED" && "$RECOMMENDED" != "$PROFILE" ]]; then
  echo "WARNING: Task triage recommends --profile=$RECOMMENDED but running with --profile=$PROFILE"
fi
```

**Validators** (run via Grep on artifact):
```
codebase_searched    → grep -qi "Codebase Matches\|Codebase Findings" $SESSION/pre-check.md
has_recommendation   → grep -qiE "EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW" $SESSION/pre-check.md
reasoning_present    → grep -qi "Reasoning" $SESSION/pre-check.md  (SOFT)
has_triage           → grep -q "## Task Triage" $SESSION/pre-check.md  (SOFT)
has_complexity       → grep -qE "Complexity:.*(LOW|MEDIUM|HIGH)" $SESSION/pre-check.md  (SOFT)
```

---

## Phase 1: Requirements (SOFT gate)

Skip if `--skip-arm` or in SKIP_PHASES.

**Spawn subprocess:**
```bash
# Compressed context (Working Memory): extract Recommendation + Codebase Matches only
RECOMMENDATION=$(grep -iA2 "Recommendation" "$SESSION/pre-check.md" 2>/dev/null || echo "No recommendation available")
CODEBASE_MATCHES=$(grep -iA20 "Codebase Matches\|Codebase Findings" "$SESSION/pre-check.md" 2>/dev/null || echo "No codebase context available")

PROMPT="You are the Requirements Agent.

## CONSTRAINTS
- Max 3 clarifying questions. Skip Q&A if the task is specific.
- Output NEEDS_INPUT only if genuinely ambiguous; otherwise CLEAR.
- Do not invent requirements not implied by the task.
- Each success criterion must be independently testable (yes/no answer).

## CONTEXT
Task: $TASK

Pre-check recommendation:
$RECOMMENDATION

Codebase matches:
$CODEBASE_MATCHES

## TASK
Extract clear, testable requirements from the task and pre-check context.

## FORMAT
Write to \$SESSION/brief.md with sections:
## Verdict: [CLEAR | NEEDS_INPUT]
## Problem (1-2 sentences)
## Success Criteria (numbered, testable)
## Scope (In/Out)
## Constraints
## Context Found
## Assumptions

## VERIFY
Before writing, confirm:
- Problem statement is 1-2 sentences
- Each success criterion is independently testable
- Scope explicitly lists what is out of scope
- Assumptions are falsifiable (could be checked later)"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/brief.md.raw"
[[ ! -f "\$SESSION/brief.md" ]] && [[ -f "\$SESSION/brief.md.raw" ]] && cp "\$SESSION/brief.md.raw" "\$SESSION/brief.md"
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
# Phase 2 exception: brief is already concise, pass full
BRIEF=$(cat "$SESSION/brief.md" 2>/dev/null || echo "No brief available")

PROMPT="You are the Architect Agent.

## CONSTRAINTS
- Max 6 architecture decisions. Prefer fewer, well-justified ones.
- Every decision MUST cite a source: a live documentation URL OR an existing codebase file:line.
- If you cannot find a source for a decision, mark verdict NEEDS_RESEARCH and explain what you tried.
- Prefer existing codebase patterns over inventing new ones.
- Knowledge boundary: if a library version is uncertain, WebSearch to verify.

## CONTEXT
Requirements brief:
$BRIEF

## TASK
Create a technical design grounded in research. Identify components, data changes, and risks.

## FORMAT
Write to \$SESSION/design.md with:
## Verdict: [READY_FOR_REVIEW | NEEDS_RESEARCH]
## Decisions (max 6, each: **{choice}** — {rationale} — Source: {URL or file:line})
## Components (table, max 4: Name | Purpose | Interface)
## Data Changes (SQL or 'None')
## Risks (table: Risk | Mitigation)

## VERIFY
Before writing, confirm:
- Every decision has a Source: line
- Components reference real or to-be-created paths
- Risks have concrete mitigations (not 'TBD')
- Verdict is NEEDS_RESEARCH only if a decision lacks a source"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/design.md.raw"
[[ ! -f "\$SESSION/design.md" ]] && [[ -f "\$SESSION/design.md.raw" ]] && cp "\$SESSION/design.md.raw" "\$SESSION/design.md"
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
# Compressed context: extract Decisions through Risks (case-insensitive, fallback to full)
DESIGN_CORE=$(sed -n '/[Dd]ecisions/,/[Rr]isks/p' "$SESSION/design.md" 2>/dev/null)
[[ -z "$DESIGN_CORE" ]] && DESIGN_CORE=$(cat "$SESSION/design.md" 2>/dev/null || echo "No design available")

PROMPT="You are the Adversarial Review Agent.

## CONSTRAINTS
- Critique from exactly 3 angles: Architect (scalability/coupling), Skeptic (edge cases/security), Implementer (types/testability).
- Every issue must cite a specific decision or component — no vague 'this could be better'.
- Every issue must propose a concrete fix.
- Verdict rules: Any HIGH → REVISE_DESIGN. 3+ MEDIUM → REVISE_DESIGN. Any consensus issue (raised by 2+ angles) → REVISE_DESIGN.

## CONTEXT
Design (decisions + components + data changes):
$DESIGN_CORE

## TASK
Critique the design from all 3 angles. Identify consensus issues. Issue verdict.

## FORMAT
Write to \$SESSION/critique.md with:
## Verdict: [APPROVED | REVISE_DESIGN]
## Issues (table, max 10: # | Angle | Severity | Issue | Fix)
## Consensus (issues raised by 2+ angles)
## Blocks (if REVISE_DESIGN: list of must-fix items)

## VERIFY
Before writing, confirm:
- All 3 angles contributed at least one issue (or explicitly say 'No issues from {angle}')
- Each row in the Issues table has Severity (HIGH/MEDIUM/LOW), Issue, and Fix
- If verdict is APPROVED, no HIGH issues and no consensus issues exist
- If verdict is REVISE_DESIGN, the Blocks section lists every must-fix item"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/critique.md.raw"
[[ ! -f "\$SESSION/critique.md" ]] && [[ -f "\$SESSION/critique.md.raw" ]] && cp "\$SESSION/critique.md.raw" "\$SESSION/critique.md"
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

**Spawn subprocess:**
```bash
# Compressed context: Decisions + Components + Data Changes (case-insensitive, fallback to full)
DESIGN_CORE=$(sed -n '/[Dd]ecisions/,/[Rr]isks/p' "$SESSION/design.md" 2>/dev/null)
[[ -z "$DESIGN_CORE" ]] && DESIGN_CORE=$(cat "$SESSION/design.md" 2>/dev/null || echo "No design available")

PROMPT="You are the Planning Agent.

## CONSTRAINTS
- Max 8 steps. Prefer fewer.
- Each step references exactly one file path.
- All MODIFY paths must exist on disk; otherwise use CREATE.
- BEFORE blocks must be 3-5 lines of actual current code (not paraphrased).
- AFTER blocks must be paste-ready (correct indentation, complete syntax).
- Anti-pattern: 'Update the authentication.' Concrete: 'In src/middleware/auth.ts, replace lines 45-52 with...'

## CONTEXT
Design (decisions + components + data changes):
$DESIGN_CORE

## TASK
Convert the design into atomic, paste-ready implementation steps.

## FORMAT
Write to \$SESSION/plan.md with:
## Verdict: [READY | NEEDS_DETAIL]
## Steps (table: # | File | Action | Depends)
Then for each step:
### Step N: {title}
**File:** path [MODIFY|CREATE]
**Deps:** list or None
**Before:** (current code, 3-5 lines context)
**After:** (new code, paste-ready)
**Test:** {input} -> {expected output}

## VERIFY
Before writing, confirm:
- Total step count ≤ 8
- Every MODIFY step references a path that exists
- Every step has BEFORE and AFTER blocks
- Every step has a Test line that is independently runnable"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/plan.md.raw"
[[ ! -f "\$SESSION/plan.md" ]] && [[ -f "\$SESSION/plan.md.raw" ]] && cp "\$SESSION/plan.md.raw" "\$SESSION/plan.md"
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
# Compressed context: Success Criteria from brief + step list from plan
CRITERIA=$(sed -n '/## Success Criteria/,/^## /p' "$SESSION/brief.md" 2>/dev/null | head -50)
[[ -z "$CRITERIA" ]] && CRITERIA=$(cat "$SESSION/brief.md" 2>/dev/null || echo "No criteria available")
PLAN_STEPS=$(grep -E "^### Step|^\*\*File:|^## Steps" "$SESSION/plan.md" 2>/dev/null | head -40)
[[ -z "$PLAN_STEPS" ]] && PLAN_STEPS=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")

PROMPT="You are the Drift Detection Agent.

## CONSTRAINTS
- Map every success criterion to a plan step.
- Verdict ALIGNED only if coverage ≥ 90%.
- Flag scope creep: any plan step that does not map to a design decision.
- Do not invent missing coverage — if a criterion has no matching step, list it under Missing.

## CONTEXT
Success Criteria (from brief.md):
$CRITERIA

Plan Steps (from plan.md):
$PLAN_STEPS

## TASK
Verify the plan covers all design requirements. Identify missing coverage and scope creep.

## FORMAT
Write to \$SESSION/drift-report.md with:
## Verdict: [ALIGNED | DRIFT_DETECTED]
## Coverage Matrix (table: Design Requirement | Plan Step | Status)
## Missing Coverage
## Scope Creep
## Summary (Requirements: N, Covered: N, Missing: N, Coverage: N%)

## VERIFY
Before writing, confirm:
- Coverage Matrix has one row per success criterion
- Coverage % is calculated from the matrix counts
- Verdict ALIGNED only if Coverage ≥ 90%
- Scope Creep section lists any plan step not tied to a criterion"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/drift-report.md.raw"
[[ ! -f "\$SESSION/drift-report.md" ]] && [[ -f "\$SESSION/drift-report.md.raw" ]] && cp "\$SESSION/drift-report.md.raw" "\$SESSION/drift-report.md"
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
# Phase 6 exception: builder needs full plan with paste-ready code
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")
# Compressed context for traceability: critique issues + brief criteria
CRITIQUE_ISSUES=$(grep -E "^\| [0-9]+ \|" "$SESSION/critique.md" 2>/dev/null | head -15)
REQUIREMENTS=$(sed -n '/## Success Criteria/,/^## /p' "$SESSION/brief.md" 2>/dev/null | grep -E "^[0-9]+\." | head -10)

PROMPT="You are the Builder Agent.

## CONSTRAINTS
- Plan is law. No improvisation, no refactoring untouched code, no 'improvements'.
- For each step: read only referenced files, verify BEFORE matches, apply AFTER exactly, run tests.
- Report blockers (BLOCKED status) — do not silently skip steps.
- Track traceability: every critique issue and success criterion must appear in the Traceability section.

## CONTEXT
Plan (full — paste-ready code required for execution):
$PLAN

Critique issues to address (from Phase 3):
$CRITIQUE_ISSUES

Success criteria to verify (from Phase 1):
$REQUIREMENTS

## TASK
Execute every plan step in order. Build, type-check, and verify. Produce a traceability matrix.

## FORMAT
Write to \$SESSION/build-report.md with:
## Verdict: [SUCCESS | PARTIAL | FAILED]
## Results (table: Step | File | Status | Notes)
## Verification (Build: PASS/FAIL, Types: PASS/FAIL)
## Files Changed (list)
## Traceability
### Critique Coverage (table: Critique # | Severity | Issue | Addressed In | Status)
### Requirements Coverage (table: Criterion # | Requirement | Implemented In | File(s) | Status)

Status values: RESOLVED | ADDRESSED | DEFERRED | DONE | IMPLEMENTED | VERIFIED | NOT_APPLICABLE

## VERIFY
Before writing, confirm:
- Every plan step has a row in Results
- Verification ran build AND types
- Files Changed lists every modified/created path
- Traceability has rows for ALL critique issues and ALL success criteria
- Status values are from the allowed set above"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/build-report.md.raw"
[[ ! -f "\$SESSION/build-report.md" ]] && [[ -f "\$SESSION/build-report.md.raw" ]] && cp "\$SESSION/build-report.md.raw" "\$SESSION/build-report.md"
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
# Compressed context: Files Changed list + Verdict (not full report)
FILES_CHANGED=$(grep -A30 "## Files Changed" "$SESSION/build-report.md" 2>/dev/null | head -30)
[[ -z "$FILES_CHANGED" ]] && FILES_CHANGED=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
VERDICT=$(grep "^## Verdict:" "$SESSION/build-report.md" 2>/dev/null | head -1)

PROMPT="You are the Denoiser Agent.

## CONSTRAINTS
- Operate ONLY on files in the Files Changed list.
- Remove: console.log/debug/trace, debugger statements, commented-out code, TODO/DEBUG/TEMP markers, unused imports.
- Preserve: console.error with component prefix, explanatory comments, license headers.
- Do not refactor or rename anything.

## CONTEXT
$VERDICT
Files Changed:
$FILES_CHANGED

## TASK
Strip debug artifacts from the changed files only. Report what was removed.

## FORMAT
Append to \$SESSION/qa-report.md a ## Denoise section listing files modified and noise removed (per file: count + types).

## VERIFY
- Only files from the Files Changed list were touched
- Console.error with component prefix preserved
- No code logic changed"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/qa-denoise.raw"
```

### Phase 8: Quality Fit

```bash
FILES_CHANGED=$(grep -A30 "## Files Changed" "$SESSION/build-report.md" 2>/dev/null | head -30)
[[ -z "$FILES_CHANGED" ]] && FILES_CHANGED=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Fit Agent.

## CONSTRAINTS
- Type-check and lint ONLY the changed files.
- Auto-fix lint violations where safe; flag (don't auto-fix) any change that alters behavior.
- Reference project conventions in CLAUDE.md and .claude/rules/ when judging fit.

## CONTEXT
Files Changed:
$FILES_CHANGED

## TASK
Verify type safety, lint cleanliness, and convention adherence on changed files.

## FORMAT
Append to \$SESSION/qa-report.md a ## Quality Fit section with: type-check result (PASS/FAIL + errors), lint result (PASS/FAIL + violations), conventions checked, fixes applied.

## VERIFY
- Type checker actually ran (output captured)
- Linter actually ran (output captured)
- Auto-fixes don't change behavior"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/qa-fit.raw"
```

### Phase 9: Quality Behavior

```bash
FILES_CHANGED=$(grep -A30 "## Files Changed" "$SESSION/build-report.md" 2>/dev/null | head -30)
[[ -z "$FILES_CHANGED" ]] && FILES_CHANGED=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
DESIGN_DECISIONS=$(sed -n '/[Dd]ecisions/,/[Cc]omponents/p' "$SESSION/design.md" 2>/dev/null | head -40)
CRITIQUE_CONSENSUS=$(sed -n '/## Consensus/,/^## /p' "$SESSION/critique.md" 2>/dev/null | head -20)

PROMPT="You are the Quality Behavior Agent.

## CONSTRAINTS
- Verify behavior on changed files only.
- Run the existing build and test suite — do not invent new tests beyond what was planned.
- Check edge cases flagged by the critique consensus.

## CONTEXT
Files Changed:
$FILES_CHANGED

Expected behavior (design decisions):
$DESIGN_DECISIONS

Edge cases to verify (critique consensus):
$CRITIQUE_CONSENSUS

## TASK
Verify the code behaves as designed. Run build and tests. Flag any deviation.

## FORMAT
Append to \$SESSION/qa-report.md a ## Quality Behavior section with: build result, test results, behavior verification per critique consensus item.

## VERIFY
- Build was actually executed (command + output)
- Tests were actually run (count + pass/fail)
- Each consensus item from critique is verified or marked unverifiable"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/qa-behavior.raw"
```

### Phase 10: Quality Docs

```bash
FILES_CHANGED=$(grep -A30 "## Files Changed" "$SESSION/build-report.md" 2>/dev/null | head -30)
[[ -z "$FILES_CHANGED" ]] && FILES_CHANGED=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Docs Agent.

## CONSTRAINTS
- Check documentation only on changed files.
- API routes REQUIRE docs (Swagger/OpenAPI). Public functions RECOMMEND docs. Types are nice-to-have.
- Don't generate docs unless explicitly part of the plan — flag missing instead.

## CONTEXT
Files Changed:
$FILES_CHANGED

## TASK
Check documentation coverage. Flag missing required docs.

## FORMAT
Append to \$SESSION/qa-report.md a ## Quality Docs section with: API route doc coverage (table: route | has_docs), public function coverage, missing required docs.

## VERIFY
- Every API route in changed files was checked
- Missing required docs are listed with file:line references"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/qa-docs.raw"
```

---

## Phase 11: Security (HARD gate, NEVER SKIP)

**Spawn subprocess:**
```bash
# Compressed context: changed files list only
FILES_CHANGED=$(grep -A30 "## Files Changed" "$SESSION/build-report.md" 2>/dev/null | head -30)
[[ -z "$FILES_CHANGED" ]] && FILES_CHANGED=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Security Agent.

## CONSTRAINTS
- Scan changed files only.
- False negatives (missing a real vulnerability) are far worse than false positives. When uncertain, flag [REVIEW_NEEDED] rather than marking safe.
- CRITICAL severity: injection (SQL/command) or hardcoded secrets — always pause regardless of profile.
- FAIL severity: XSS or auth bypass.
- PASS verdict requires ALL of: no injection, no secrets, no auth gaps, no XSS.

## CONTEXT
Files Changed:
$FILES_CHANGED

## TASK
Scan for: SQL/command injection, XSS, auth gaps, hardcoded secrets, access control issues. Issue verdict.

## FORMAT
Append to \$SESSION/qa-report.md:
## Findings (table: Type | File:Line | Pattern | Severity | Fix)
## Summary (Injection: CLEAR/FOUND, Auth: N/M protected, Secrets: CLEAR/FOUND)
## Verdict: [PASS | FAIL | CRITICAL]

## VERIFY
- Every changed file was inspected (or marked SKIPPED with reason)
- Severity markers are exactly CRITICAL/FAIL/PASS (no other words)
- [REVIEW_NEEDED] flag is used for any uncertain finding
- Verdict CRITICAL is set if ANY injection or secrets found"

echo "\$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "\$SESSION/qa-security.raw"
[[ ! -f "\$SESSION/qa-report.md" ]] && echo "Security scan produced no qa-report.md" >&2
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

After all phases, present the summary:

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
