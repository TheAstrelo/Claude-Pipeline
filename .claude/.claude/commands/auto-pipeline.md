# Automated Pipeline (Memory-Safe)

Run: `/auto-pipeline [--profile=yolo|standard|paranoid] [--skip-research] [--skip-arm] [--skip-ar] [--skip-tests] [--skip-pmatch] <task>`

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
touch "$SESSION/pipeline-state.jsonl"
```

Parse flags from `$ARGUMENTS`:
- `--profile=yolo` → SKIP_PHASES=(3 5 8 10 11 12 13 14 15 17 18), GATE_MODE=soft
  # yolo skips: Cost(3), AR(5), Drift(8), Denoise(10), QFit(11), QBehavior(12), QDocs(13), PerfCheck(14), A11y(15), TechDebt(17), RollbackPlan(18)
- `--profile=standard` → SKIP_PHASES=(), GATE_MODE=mixed
- `--profile=paranoid` → SKIP_PHASES=(), GATE_MODE=hard
- `--skip-research` → add 1 to SKIP_PHASES
- `--skip-arm` → add 2 to SKIP_PHASES
- `--skip-cost` → add 3 to SKIP_PHASES
- `--skip-ar` → add 5 to SKIP_PHASES
- `--skip-tests` → add 7 to SKIP_PHASES
- `--skip-pmatch` → add 8 to SKIP_PHASES

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

echo '{"phase":0,"name":"Pre-Check","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/pre-check.md.raw"
[[ ! -f "$SESSION/pre-check.md" ]] && [[ -f "$SESSION/pre-check.md.raw" ]] && cp "$SESSION/pre-check.md.raw" "$SESSION/pre-check.md"
VERDICT=$(head -5 "$SESSION/pre-check.md.raw" | grep -oE '(EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":0,"name":"Pre-Check","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"pre-check.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators** (run via Grep on artifact):
```
codebase_searched    → grep -qi "Codebase Matches\|Codebase Findings" $SESSION/pre-check.md
has_recommendation   → grep -qiE "EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW" $SESSION/pre-check.md
reasoning_present    → grep -qi "Reasoning" $SESSION/pre-check.md  (SOFT)
```

---

## Phase 1: Research (SOFT gate)

Skip if `--skip-research` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":1,"name":"Research","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

**Spawn subprocess:**
```bash
PROMPT="You are the Researcher Agent. Your task: $TASK

Investigate libraries, APIs, prior art, and competing approaches. Search the codebase for related implementations. WebSearch for best practices and alternatives.

Write output to $SESSION/research.md with:
## Verdict: [SUFFICIENT | NEEDS_MORE_RESEARCH]
## Task Context
## Codebase Analysis (table: File | Relevance | Pattern Used)
## Technology Research (per topic: Source, Key Findings, Best Practices, Gotchas)
## Alternative Approaches (table: Approach | Pros | Cons | Effort | Source)
## Recommendation
## Sources Consulted (table: # | URL | What It Provided)"

echo '{"phase":1,"name":"Research","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/research.md.raw"
[[ ! -f "$SESSION/research.md" ]] && [[ -f "$SESSION/research.md.raw" ]] && cp "$SESSION/research.md.raw" "$SESSION/research.md"
VERDICT=$(head -5 "$SESSION/research.md.raw" | grep -oE '(SUFFICIENT|NEEDS_MORE_RESEARCH)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":1,"name":"Research","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"research.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_recommendation   → grep -iE "## Recommendation" $SESSION/research.md
has_sources          → grep -c "Source:" $SESSION/research.md >= 1
no_research_gap      → ! grep "NEEDS_MORE_RESEARCH" $SESSION/research.md  (SOFT)
```

---

## Phase 2: Requirements (SOFT gate)

Skip if `--skip-arm` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":2,"name":"Requirements","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

**Spawn subprocess:**
```bash
PRECHECK=$(cat "$SESSION/pre-check.md" 2>/dev/null || echo "No pre-check available")
RESEARCH=$(cat "$SESSION/research.md" 2>/dev/null || echo "")

PROMPT="You are the Requirements Agent. Your task: $TASK

Pre-check context:
$PRECHECK

Research findings:
$RESEARCH

Extract clear, testable requirements. Write output to $SESSION/brief.md with sections:
## Verdict: [CLEAR | NEEDS_INPUT]
## Problem (1-2 sentences)
## Success Criteria (numbered, testable)
## Scope (In/Out)
## Constraints
## Context Found
## Assumptions

Max 3 clarifying questions. Skip Q&A if the task is specific. Output NEEDS_INPUT only if genuinely ambiguous."

echo '{"phase":2,"name":"Requirements","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/brief.md.raw"
[[ ! -f "$SESSION/brief.md" ]] && [[ -f "$SESSION/brief.md.raw" ]] && cp "$SESSION/brief.md.raw" "$SESSION/brief.md"
VERDICT=$(head -5 "$SESSION/brief.md.raw" | grep -oE '(CLEAR|NEEDS_INPUT)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":2,"name":"Requirements","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"brief.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_problem       → grep "## Problem" $SESSION/brief.md
has_criteria      → grep "## Success Criteria" $SESSION/brief.md
no_ambiguity      → ! grep "NEEDS_INPUT" $SESSION/brief.md  (HARD)
```

---

## Phase 3: Cost Estimate (SOFT gate)

Skip if `--skip-cost` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":3,"name":"Cost Estimate","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

**Spawn subprocess:**
```bash
BRIEF=$(cat "$SESSION/brief.md" 2>/dev/null || echo "No brief available")

PROMPT="You are the Cost Estimator Agent. Your task: $TASK

Requirements brief:
$BRIEF

Estimate API costs, infrastructure impact, and database growth for this feature. Check Serper (\$0.001/search), Groq, HubSpot, Redis usage patterns in the codebase.

Write output to $SESSION/cost-estimate.md with:
## Verdict: [ACCEPTABLE | REVIEW_COSTS | EXPENSIVE]
## Summary (1-2 sentences)
## API Cost Breakdown (table: Service | Cost/Call | Calls/User/Day | Monthly at 100u | Monthly at 1000u)
## Infrastructure Impact (DB growth, cache impact, query load)
## Cost Projections (table: Scale | API | Infra | Total for 100/500/1000 users)
## Cost Optimization Suggestions
## Comparison to Existing Features"

echo '{"phase":3,"name":"Cost Estimate","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/cost-estimate.md.raw"
[[ ! -f "$SESSION/cost-estimate.md" ]] && [[ -f "$SESSION/cost-estimate.md.raw" ]] && cp "$SESSION/cost-estimate.md.raw" "$SESSION/cost-estimate.md"
VERDICT=$(head -5 "$SESSION/cost-estimate.md.raw" | grep -oE '(ACCEPTABLE|REVIEW_COSTS|EXPENSIVE)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":3,"name":"Cost Estimate","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"cost-estimate.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_verdict        → grep -iE "ACCEPTABLE|REVIEW_COSTS|EXPENSIVE" $SESSION/cost-estimate.md
has_projections    → grep -i "Cost Projections" $SESSION/cost-estimate.md
no_expensive       → ! grep "EXPENSIVE" $SESSION/cost-estimate.md  (SOFT)
```

---

## Phase 4: Design (SOFT gate)

**Spawn subprocess:**
```bash
BRIEF=$(cat "$SESSION/brief.md" 2>/dev/null || echo "No brief available")
RESEARCH=$(cat "$SESSION/research.md" 2>/dev/null || echo "")

PROMPT="You are the Architect Agent. Create a technical design based on these requirements.

Requirements brief:
$BRIEF

Research findings (libraries, APIs, prior art):
$RESEARCH

Research live documentation for relevant libraries/APIs. Analyze existing codebase patterns. Make design decisions — each must cite live docs OR existing codebase patterns.

Write output to $SESSION/design.md with:
## Decisions (max 6, each: **{choice}** — {rationale} — Source: {URL or file:line})
## Components (table, max 4: Name | Purpose | Interface)
## Data Changes (SQL or 'None')
## Risks (table: Risk | Mitigation)

Every decision must cite a source. If docs can't be found, output NEEDS_RESEARCH."

echo '{"phase":4,"name":"Design","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/design.md.raw"
[[ ! -f "$SESSION/design.md" ]] && [[ -f "$SESSION/design.md.raw" ]] && cp "$SESSION/design.md.raw" "$SESSION/design.md"
VERDICT=$(head -5 "$SESSION/design.md.raw" | grep -oE '(APPROVED|NEEDS_RESEARCH)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":4,"name":"Design","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"design.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_decisions      → grep "## Decisions" $SESSION/design.md
has_sources        → grep -c "Source:" $SESSION/design.md >= 1
no_research_gap    → ! grep "NEEDS_RESEARCH" $SESSION/design.md  (HARD)
```

---

## Phase 5: Adversarial Review (HARD gate)

Skip if `--skip-ar` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":4,"name":"Adversarial Review","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

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

echo '{"phase":5,"name":"Adversarial Review","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/critique.md.raw"
[[ ! -f "$SESSION/critique.md" ]] && [[ -f "$SESSION/critique.md.raw" ]] && cp "$SESSION/critique.md.raw" "$SESSION/critique.md"
VERDICT=$(head -5 "$SESSION/critique.md.raw" | grep -oE '(APPROVED|REVISE_DESIGN)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":5,"name":"Adversarial Review","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"critique.md"}' >> "$SESSION/pipeline-state.jsonl"
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
Then re-run Phase 4 (max 1 retry). If still REVISE_DESIGN after retry, PAUSE.

---

## Phase 6: Planning (SOFT gate)

**Spawn subprocess:**
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

echo '{"phase":6,"name":"Planning","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/plan.md.raw"
[[ ! -f "$SESSION/plan.md" ]] && [[ -f "$SESSION/plan.md.raw" ]] && cp "$SESSION/plan.md.raw" "$SESSION/plan.md"
VERDICT=$(head -5 "$SESSION/plan.md.raw" | grep -oE '(READY|NEEDS_DETAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":6,"name":"Planning","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"plan.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_steps          → grep -c "### Step" $SESSION/plan.md >= 1  (HARD)
max_8_steps        → grep -c "### Step" $SESSION/plan.md <= 8
no_detail_flag     → ! grep "NEEDS_DETAIL" $SESSION/plan.md  (HARD)
```

---

## Phase 7: Test Planning (SOFT gate)

Skip if `--skip-tests` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":6,"name":"Test Planning","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

**Spawn subprocess:**
```bash
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "")
CRITIQUE=$(cat "$SESSION/critique.md" 2>/dev/null || echo "")

PROMPT="You are the Test Writer Agent. Generate test cases from this plan.

Plan:
$PLAN

Design:
$DESIGN

Critique (edge cases):
$CRITIQUE

Write output to $SESSION/test-plan.md with:
## Verdict: [READY | INCOMPLETE]
## Test Summary (table: Type | Count | Files)
## Test Cases (Unit, Integration, Edge Case tables)
## Test Files Created
## Compilation Check
## Coverage Gaps"

echo '{"phase":7,"name":"Test Planning","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/test-plan.md.raw"
[[ ! -f "$SESSION/test-plan.md" ]] && [[ -f "$SESSION/test-plan.md.raw" ]] && cp "$SESSION/test-plan.md.raw" "$SESSION/test-plan.md"
VERDICT=$(head -5 "$SESSION/test-plan.md.raw" | grep -oE '(READY|INCOMPLETE)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":7,"name":"Test Planning","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"test-plan.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
has_test_cases     → grep -c -iE "test case|it should|describe\(|test\(" $SESSION/test-plan.md >= 1  (HARD)
covers_plan_steps  → grep -ci "step" $SESSION/test-plan.md >= 1  (SOFT)
has_coverage_goal  → grep -iE "coverage|critical path|edge case" $SESSION/test-plan.md  (SOFT)
```

---

## Phase 8: Drift Detection (SOFT gate)

Skip if `--skip-pmatch` or in SKIP_PHASES. If skipped, emit:
```bash
echo '{"phase":7,"name":"Drift Detection","status":"skipped","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
```

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

echo '{"phase":8,"name":"Drift Detection","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/drift-report.md.raw"
[[ ! -f "$SESSION/drift-report.md" ]] && [[ -f "$SESSION/drift-report.md.raw" ]] && cp "$SESSION/drift-report.md.raw" "$SESSION/drift-report.md"
VERDICT=$(head -5 "$SESSION/drift-report.md.raw" | grep -oE '(ALIGNED|DRIFT_DETECTED)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":8,"name":"Drift Detection","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"drift-report.md"}' >> "$SESSION/pipeline-state.jsonl"
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
Then re-run Phase 8 (max 1 retry). If still drifting, PAUSE.

---

## Phase 9: Build (NONE gate, HARD on blocked)

**Spawn subprocess:**
```bash
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "No plan available")
TEST_PLAN=$(cat "$SESSION/test-plan.md" 2>/dev/null || echo "")

PROMPT="You are the Builder Agent. Execute this plan exactly as specified.

Plan:
$PLAN

Test plan (tests to generate after implementation):
$TEST_PLAN

For each step: read only referenced files, verify BEFORE matches, apply AFTER exactly, run tests. No improvisation, no refactoring untouched code.

Write output to $SESSION/build-report.md with:
## Verdict: [SUCCESS | PARTIAL | FAILED]
## Results (table: Step | File | Status | Notes)
## Verification (Build: PASS/FAIL, Types: PASS/FAIL)
## Files Changed (list)"

echo '{"phase":9,"name":"Build","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/build-report.md.raw"
[[ ! -f "$SESSION/build-report.md" ]] && [[ -f "$SESSION/build-report.md.raw" ]] && cp "$SESSION/build-report.md.raw" "$SESSION/build-report.md"
VERDICT=$(head -5 "$SESSION/build-report.md.raw" | grep -oE '(SUCCESS|PARTIAL|FAILED)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":9,"name":"Build","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"build-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

**Validators:**
```
no_blocked         → ! grep "BLOCKED" $SESSION/build-report.md  (HARD)
build_passes       → grep -E "Build:.*PASS|Build.*PASS" $SESSION/build-report.md
types_pass         → grep -E "Types:.*PASS|Types.*PASS" $SESSION/build-report.md
```

---

## Phases 10-19: QA (NONE gate, auto-fix)

Run sequentially. Each is a separate subprocess. No pauses.

### Phase 10: Denoise

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Denoiser Agent. Remove debug artifacts from changed files.

Build report:
$BUILD_REPORT

Remove: console.log/debug/trace, debugger statements, commented-out code, TODO/DEBUG/TEMP markers, unused imports.
Preserve: console.error with component prefix, explanatory comments, license headers.

Append results to $SESSION/qa-report.md with a ## Denoise section."

echo '{"phase":10,"name":"Denoise","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-denoise.raw"
VERDICT=$(head -5 "$SESSION/qa-denoise.raw" | grep -oE '(CLEAN|CLEANED)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":10,"name":"Denoise","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

### Phase 11: Quality Fit

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Fit Agent. Check changed files for type safety, lint, and conventions.

Build report:
$BUILD_REPORT

Run type checker and linter on changed files. Check project conventions. Auto-fix violations. Append results to $SESSION/qa-report.md with a ## Quality Fit section."

echo '{"phase":11,"name":"Quality Fit","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-fit.raw"
VERDICT=$(head -5 "$SESSION/qa-fit.raw" | grep -oE '(PASS|WARN|FAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":11,"name":"Quality Fit","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

### Phase 12: Quality Behavior

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "")
CRITIQUE=$(cat "$SESSION/critique.md" 2>/dev/null || echo "")
TEST_PLAN=$(cat "$SESSION/test-plan.md" 2>/dev/null || echo "")

PROMPT="You are the Quality Behavior Agent. Verify the code works as designed.

Build report:
$BUILD_REPORT

Design (expected behavior):
$DESIGN

Critique (edge cases to check):
$CRITIQUE

Test plan (expected coverage):
$TEST_PLAN

Run build, run tests, verify behavior matches design. Append results to $SESSION/qa-report.md with a ## Quality Behavior section."

echo '{"phase":12,"name":"Quality Behavior","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-behavior.raw"
VERDICT=$(head -5 "$SESSION/qa-behavior.raw" | grep -oE '(PASS|WARN|FAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":12,"name":"Quality Behavior","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

### Phase 13: Quality Docs

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Quality Docs Agent. Check documentation coverage for changed files.

Build report:
$BUILD_REPORT

Check: API route docs (required), public function docs (recommended), type docs (nice-to-have). Append results to $SESSION/qa-report.md with a ## Quality Docs section."

echo '{"phase":13,"name":"Quality Docs","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-docs.raw"
VERDICT=$(head -5 "$SESSION/qa-docs.raw" | grep -oE '(PASS|WARN|FAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":13,"name":"Quality Docs","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

---

### Phase 14: Performance Check

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Performance Profiler Agent. Scan changed files for performance issues.

Build report:
$BUILD_REPORT

Scan for: N+1 queries, unbounded queries, missing indexes, memory leaks, synchronous blocking, bundle size regressions.

Append findings to $SESSION/qa-report.md with:
## Performance Profile
**Verdict:** [PASS | WARN | FAIL]
(N+1 Detection, Unbounded Queries, Missing Indexes, Memory Leaks, Bundle Size, Blocking Ops tables + Summary)"

echo '{"phase":14,"name":"Perf Check","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-perf.raw"
VERDICT=$(head -5 "$SESSION/qa-perf.raw" | grep -oE '(PASS|WARN|FAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":14,"name":"Perf Check","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

---

### Phase 15: Accessibility Check

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")

PROMPT="You are the Accessibility Auditor Agent. Scan changed UI files for WCAG 2.1 AA issues.

Build report:
$BUILD_REPORT

If no .tsx files changed, append 'No UI changes — skipped' and exit with PASS.

Scan for: missing alt text, onClick without keyboard handlers, missing aria-labels on interactive elements, hardcoded colors bypassing theme, form inputs without labels, semantic HTML misuse.

Append findings to $SESSION/qa-report.md with:
## Accessibility Audit
**Verdict:** [PASS | WARN | FAIL]
**Standard:** WCAG 2.1 Level AA
(Alt Text, Keyboard Nav, ARIA, Contrast, Forms, Semantics tables + Summary)"

echo '{"phase":15,"name":"A11y Check","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-a11y.raw"
VERDICT=$(head -5 "$SESSION/qa-a11y.raw" | grep -oE '(PASS|WARN|FAIL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":15,"name":"A11y Check","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

---

## Phase 16: Security (HARD gate, NEVER SKIP)

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

echo '{"phase":16,"name":"Security","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-security.raw"
[[ ! -f "$SESSION/qa-report.md" ]] && echo "Security scan produced no qa-report.md" >&2
VERDICT=$(head -5 "$SESSION/qa-security.raw" | grep -oE '(PASS|FAIL|CRITICAL)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":16,"name":"Security","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
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

### Phase 17: Tech Debt

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "")

PROMPT="You are the Tech Debt Tracker Agent. Scan changed files for technical debt.

Build report:
$BUILD_REPORT

Design:
$DESIGN

Scan for: TODO/FIXME/HACK/TEMP/XXX, 'as any', hardcoded values, design deviations, missing error handling.

Append findings to $SESSION/qa-report.md with:
## Tech Debt Report
**Verdict:** [CLEAN | DEBT_LOGGED]
(Debt Items, Design Deviations, Type Safety Issues, Recommended Cleanup tables)"

echo '{"phase":17,"name":"Tech Debt","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/qa-debt.raw"
VERDICT=$(head -5 "$SESSION/qa-debt.raw" | grep -oE '(CLEAN|DEBT_LOGGED)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":17,"name":"Tech Debt","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"qa-report.md"}' >> "$SESSION/pipeline-state.jsonl"
```

### Phase 18: Rollback Plan

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
PLAN=$(cat "$SESSION/plan.md" 2>/dev/null || echo "")

PROMPT="You are the Rollback Planner Agent. Generate a rollback plan.

Build report:
$BUILD_REPORT

Plan:
$PLAN

Write output to $SESSION/rollback-plan.md with:
## Risk Level: [LOW | MEDIUM | HIGH | IRREVERSIBLE]
## Quick Rollback (git revert command)
## Detailed Steps
## Pre-Rollback Checklist
## Post-Rollback Verification
## Warnings"

echo '{"phase":18,"name":"Rollback Plan","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/rollback-plan.md.raw"
[[ ! -f "$SESSION/rollback-plan.md" ]] && [[ -f "$SESSION/rollback-plan.md.raw" ]] && cp "$SESSION/rollback-plan.md.raw" "$SESSION/rollback-plan.md"
VERDICT=$(head -5 "$SESSION/rollback-plan.md.raw" | grep -oE '(LOW|MEDIUM|HIGH|IRREVERSIBLE)' | head -1); [ -z "$VERDICT" ] && VERDICT="UNKNOWN"
echo '{"phase":18,"name":"Rollback Plan","status":"complete","verdict":"'"$VERDICT"'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"rollback-plan.md"}' >> "$SESSION/pipeline-state.jsonl"
```

### Phase 19: Changelog

```bash
BUILD_REPORT=$(cat "$SESSION/build-report.md" 2>/dev/null || echo "No build report")
BRIEF=$(cat "$SESSION/brief.md" 2>/dev/null || echo "")
DESIGN=$(cat "$SESSION/design.md" 2>/dev/null || echo "")

PROMPT="You are the Changelog Generator Agent. Generate release notes from build artifacts.

Build report:
$BUILD_REPORT

Brief:
$BRIEF

Design:
$DESIGN

Run git log --oneline for recent commits. Categorize changes as Feature/Enhancement/Fix/Internal.

Write output to $SESSION/changelog.md with:
# Changelog: [Task Title]
## Date: [YYYY-MM-DD]
## User-Facing Changes (New Features, Improvements, Bug Fixes)
## Developer Notes (Technical Changes, New API Endpoints, Database Changes, Config Changes)
## Migration Notes
## Commit Summary"

echo '{"phase":19,"name":"Changelog","status":"running","verdict":null,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":null}' >> "$SESSION/pipeline-state.jsonl"
echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1 | tee "$SESSION/changelog.md.raw"
[[ ! -f "$SESSION/changelog.md" ]] && [[ -f "$SESSION/changelog.md.raw" ]] && cp "$SESSION/changelog.md.raw" "$SESSION/changelog.md"
echo '{"phase":19,"name":"Changelog","status":"complete","verdict":"DONE","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","artifact":"changelog.md"}' >> "$SESSION/pipeline-state.jsonl"
```

---

## Final Output

After all phases, present the summary:

```
Pipeline Complete [PROFILE: $PROFILE]

Task: $TASK
Session: $SESSION

Phases:
 0. Pre-Check        [result]
 1. Research          [result]
 2. Requirements     [result]
 3. Cost Estimate    [result]
 4. Design           [result]
 5. Adversarial      [result]
 6. Planning         [result]
 7. Test Planning    [result]
 8. Drift Detection  [result]
 9. Build            [result]
10. Denoise          [result]
11. Quality Fit      [result]
12. Quality Behavior [result]
13. Quality Docs     [result]
14. Perf Check       [result]
15. A11y Check       [result]
16. Security         [result]
17. Tech Debt        [result]
18. Rollback Plan    [result]
19. Changelog        [result]

Validators: N passed, N failed
Warnings: [list or none]
Artifacts: $SESSION/
```

---

## Profiles

| Profile | Skips | Gate Mode | Use Case |
|---------|-------|-----------|----------|
| yolo | 3,5,8,10-14,15,17,18 | soft | Prototypes |
| standard | none | mixed | Normal dev |
| paranoid | none | hard | Production |

---

## Validation Summary

| Profile | HARD fail | SOFT fail | Result |
|---------|-----------|-----------|--------|
| yolo | PAUSE | AUTO | Only critical issues stop |
| standard | PAUSE | WARN | Log warnings, pause on critical |
| paranoid | PAUSE | PAUSE | Any issue stops |
