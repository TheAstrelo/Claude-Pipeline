#!/usr/bin/env bash
# =============================================================================
# codex-pipeline.sh — Orchestrated 12-phase AI development pipeline for Codex CLI
#
# Usage:
#   ./codex-pipeline.sh "your task description here"
#   ./codex-pipeline.sh --profile=yolo "your task description"
#   ./codex-pipeline.sh --profile=paranoid --model-strong=o3 "your task"
#
# Requirements:
#   - codex CLI installed and authenticated (npm i -g @openai/codex)
#   - instructions.md and AGENTS.md in the project root
#
# The script invokes codex once per phase, passing the appropriate agent
# context and upstream artifacts. Artifacts are saved to .pipeline/artifacts/.
# Validation gates check each artifact before proceeding.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROFILE="standard"
MODEL_STRONG="o3"
MODEL_FAST="o3-mini"
APPROVAL_MODE="suggest"          # suggest | auto-edit | full-auto
CODEX_CMD="codex"                # override with CODEX_CMD env var if needed
MAX_RETRIES_STANDARD=2
MAX_RETRIES_YOLO=1
MAX_RETRIES_PARANOID=3

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
TASK=""
for arg in "$@"; do
  case "$arg" in
    --profile=*)      PROFILE="${arg#*=}" ;;
    --model-strong=*) MODEL_STRONG="${arg#*=}" ;;
    --model-fast=*)   MODEL_FAST="${arg#*=}" ;;
    --approval=*)     APPROVAL_MODE="${arg#*=}" ;;
    --full-auto)      APPROVAL_MODE="full-auto" ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] \"task description\""
      echo ""
      echo "Options:"
      echo "  --profile=PROFILE        yolo | standard | paranoid (default: standard)"
      echo "  --model-strong=MODEL     Model for phases 2,3 (default: o3)"
      echo "  --model-fast=MODEL       Model for all other phases (default: o3-mini)"
      echo "  --approval=MODE          suggest | auto-edit | full-auto (default: suggest)"
      echo "  --full-auto              Shorthand for --approval=full-auto"
      echo "  -h, --help               Show this help"
      exit 0
      ;;
    *)
      # Treat non-flag args as the task description
      if [[ -z "$TASK" ]]; then
        TASK="$arg"
      else
        TASK="$TASK $arg"
      fi
      ;;
  esac
done

if [[ -z "$TASK" ]]; then
  echo -e "${RED}Error: No task description provided.${NC}"
  echo "Usage: $0 [--profile=standard] \"your task description\""
  exit 1
fi

# ---------------------------------------------------------------------------
# Profile configuration
# ---------------------------------------------------------------------------
declare -a SKIP_PHASES=()
GATE_MODE="mixed"

case "$PROFILE" in
  yolo)
    SKIP_PHASES=(3 5 7 8 9 10)
    GATE_MODE="soft"
    MAX_RETRIES=$MAX_RETRIES_YOLO
    ;;
  standard)
    SKIP_PHASES=()
    GATE_MODE="mixed"
    MAX_RETRIES=$MAX_RETRIES_STANDARD
    ;;
  paranoid)
    SKIP_PHASES=()
    GATE_MODE="hard"
    MAX_RETRIES=$MAX_RETRIES_PARANOID
    ;;
  *)
    echo -e "${RED}Error: Unknown profile '$PROFILE'. Use yolo, standard, or paranoid.${NC}"
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Session setup
# ---------------------------------------------------------------------------
SESSION_ID=$(date +%Y%m%d-%H%M%S)
ARTIFACTS=".pipeline/artifacts/$SESSION_ID"
mkdir -p "$ARTIFACTS"

# Tracking arrays
declare -a PHASE_RESULTS=()
declare -a PHASE_WARNINGS=()
declare -a FILES_CHANGED=()
TOTAL_PASS=0
TOTAL_FAIL=0

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  AI Development Pipeline${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Profile:  ${CYAN}$PROFILE${NC}"
echo -e "  Task:     $TASK"
echo -e "  Session:  $ARTIFACTS"
echo -e "  Strong:   $MODEL_STRONG"
echo -e "  Fast:     $MODEL_FAST"
echo -e "${BOLD}============================================${NC}"
echo ""

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

log_phase() {
  local phase=$1 name=$2 gate=$3
  echo -e "${BOLD}──── Phase $phase: $name [$gate gate] ────${NC}"
}

log_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  ((TOTAL_PASS++))
}

log_fail() {
  local severity=$1 msg=$2
  if [[ "$severity" == "HARD" ]]; then
    echo -e "  ${RED}✗ [HARD]${NC} $msg"
  else
    echo -e "  ${YELLOW}! [SOFT]${NC} $msg"
  fi
  ((TOTAL_FAIL++))
}

log_skip() {
  echo -e "  ${CYAN}⊘ Skipped (profile: $PROFILE)${NC}"
}

log_result() {
  local phase=$1 result=$2
  PHASE_RESULTS[$phase]="$result"
}

is_skipped() {
  local phase=$1
  # Phase 0 and 11 are NEVER skipped
  if [[ "$phase" == "0" || "$phase" == "11" ]]; then
    return 1
  fi
  for s in "${SKIP_PHASES[@]}"; do
    if [[ "$s" == "$phase" ]]; then
      return 0
    fi
  done
  return 1
}

# Get model for a phase (strong for 2,3 — fast for everything else)
get_model() {
  local phase=$1
  if [[ "$phase" == "2" || "$phase" == "3" ]]; then
    echo "$MODEL_STRONG"
  else
    echo "$MODEL_FAST"
  fi
}

# Run codex with a prompt, writing output to a file
run_codex() {
  local model=$1
  local prompt=$2
  local output_file=$3

  $CODEX_CMD \
    --model "$model" \
    --approval-mode "$APPROVAL_MODE" \
    --quiet \
    "$prompt" 2>&1 | tee "$output_file.raw"

  # If the agent was supposed to write an artifact file, check for it
  if [[ -f "$output_file" ]]; then
    return 0
  fi

  # Fallback: use the raw output as the artifact
  if [[ -f "$output_file.raw" ]]; then
    cp "$output_file.raw" "$output_file"
  fi
}

# Gate decision: returns AUTO, WARN, or PAUSE
gate_decision() {
  local hard_fails=$1 soft_fails=$2

  if [[ $hard_fails -gt 0 ]]; then
    echo "PAUSE"
    return
  fi

  if [[ $soft_fails -eq 0 ]]; then
    echo "AUTO"
    return
  fi

  # Soft fails only
  case "$GATE_MODE" in
    soft) echo "AUTO" ;;
    mixed) echo "WARN" ;;
    hard) echo "PAUSE" ;;
  esac
}

# Pause for human review
pause_for_human() {
  local phase=$1
  echo ""
  echo -e "${YELLOW}Pipeline paused at Phase $phase.${NC}"
  echo -e "Review the artifact at: ${CYAN}$ARTIFACTS/${NC}"
  echo ""
  echo "  [c] continue   — proceed to next phase"
  echo "  [r] revise     — re-run this phase"
  echo "  [o] override   — skip validation and proceed"
  echo "  [q] quit       — stop the pipeline"
  echo ""
  read -rp "  Choice [c/r/o/q]: " choice
  case "$choice" in
    c|C) return 0 ;;
    r|R) return 1 ;;
    o|O) return 0 ;;
    q|Q)
      echo -e "${RED}Pipeline aborted by user.${NC}"
      exit 1
      ;;
    *)
      echo "Defaulting to continue."
      return 0
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

validate_phase_0() {
  local file="$ARTIFACTS/pre-check.md"
  local hard=0 soft=0

  if grep -qi "Codebase Matches" "$file" 2>/dev/null; then
    log_pass "codebase_searched"
  else
    log_fail "HARD" "codebase_searched — missing 'Codebase Matches' section"
    ((hard++))
  fi

  if grep -qiE "EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW" "$file" 2>/dev/null; then
    log_pass "has_recommendation"
  else
    log_fail "HARD" "has_recommendation — no recommendation found"
    ((hard++))
  fi

  if grep -qi "Reasoning" "$file" 2>/dev/null; then
    log_pass "reasoning_present"
  else
    log_fail "SOFT" "reasoning_present — missing reasoning"
    ((soft++))
  fi

  echo "$hard $soft"
}

validate_phase_1() {
  local file="$ARTIFACTS/brief.md"
  local hard=0 soft=0

  if grep -q "## Problem" "$file" 2>/dev/null; then
    log_pass "has_problem"
  else
    log_fail "SOFT" "has_problem — missing Problem section"
    ((soft++))
  fi

  if grep -q "## Success Criteria" "$file" 2>/dev/null; then
    log_pass "has_criteria"
  else
    log_fail "SOFT" "has_criteria — missing Success Criteria section"
    ((soft++))
  fi

  if grep -q "NEEDS_INPUT" "$file" 2>/dev/null; then
    log_fail "HARD" "no_ambiguity — NEEDS_INPUT flag found"
    ((hard++))
  else
    log_pass "no_ambiguity"
  fi

  echo "$hard $soft"
}

validate_phase_2() {
  local file="$ARTIFACTS/design.md"
  local hard=0 soft=0

  if grep -q "## Decisions" "$file" 2>/dev/null; then
    log_pass "has_decisions"
  else
    log_fail "SOFT" "has_decisions — missing Decisions section"
    ((soft++))
  fi

  if grep -qc "Source:" "$file" 2>/dev/null && [[ $(grep -c "Source:" "$file") -ge 1 ]]; then
    log_pass "has_sources"
  else
    log_fail "SOFT" "has_sources — no source citations found"
    ((soft++))
  fi

  if grep -q "NEEDS_RESEARCH" "$file" 2>/dev/null; then
    log_fail "HARD" "no_research_gap — NEEDS_RESEARCH flag found"
    ((hard++))
  else
    log_pass "no_research_gap"
  fi

  echo "$hard $soft"
}

validate_phase_3() {
  local file="$ARTIFACTS/critique.md"
  local hard=0 soft=0

  if grep -qE "APPROVED|REVISE_DESIGN" "$file" 2>/dev/null; then
    log_pass "has_verdict"
  else
    log_fail "HARD" "has_verdict — missing verdict"
    ((hard++))
  fi

  if grep -q "| HIGH |" "$file" 2>/dev/null; then
    log_fail "HARD" "no_high_severity — HIGH severity issues found"
    ((hard++))
  else
    log_pass "no_high_severity"
  fi

  local medium_count
  medium_count=$(grep -c "MEDIUM" "$file" 2>/dev/null || echo "0")
  if [[ $medium_count -lt 3 ]]; then
    log_pass "few_medium ($medium_count)"
  else
    log_fail "SOFT" "few_medium — $medium_count MEDIUM issues (threshold: <3)"
    ((soft++))
  fi

  echo "$hard $soft"
}

validate_phase_4() {
  local file="$ARTIFACTS/plan.md"
  local hard=0 soft=0

  local step_count
  step_count=$(grep -c "### Step" "$file" 2>/dev/null || echo "0")

  if [[ $step_count -ge 1 ]]; then
    log_pass "has_steps ($step_count)"
  else
    log_fail "HARD" "has_steps — no steps found"
    ((hard++))
  fi

  if [[ $step_count -le 8 ]]; then
    log_pass "max_8_steps"
  else
    log_fail "SOFT" "max_8_steps — $step_count steps (max 8)"
    ((soft++))
  fi

  if grep -q "NEEDS_DETAIL" "$file" 2>/dev/null; then
    log_fail "HARD" "no_detail_flag — NEEDS_DETAIL found"
    ((hard++))
  else
    log_pass "no_detail_flag"
  fi

  echo "$hard $soft"
}

validate_phase_5() {
  local file="$ARTIFACTS/drift-report.md"
  local hard=0 soft=0

  if grep -qE "ALIGNED|DRIFT_DETECTED" "$file" 2>/dev/null; then
    log_pass "has_verdict"
  else
    log_fail "HARD" "has_verdict — missing verdict"
    ((hard++))
  fi

  if grep -q "DRIFT_DETECTED" "$file" 2>/dev/null; then
    log_fail "SOFT" "no_drift — DRIFT_DETECTED"
    ((soft++))
  else
    log_pass "no_drift"
  fi

  echo "$hard $soft"
}

validate_phase_6() {
  local file="$ARTIFACTS/build-report.md"
  local hard=0 soft=0

  if grep -q "BLOCKED" "$file" 2>/dev/null; then
    log_fail "HARD" "no_blocked — BLOCKED steps found"
    ((hard++))
  else
    log_pass "no_blocked"
  fi

  if grep -qE "Build:.*PASS|Build.*PASS" "$file" 2>/dev/null; then
    log_pass "build_passes"
  else
    log_fail "SOFT" "build_passes — build check not confirmed"
    ((soft++))
  fi

  if grep -qE "Types:.*PASS|Types.*PASS" "$file" 2>/dev/null; then
    log_pass "types_pass"
  else
    log_fail "SOFT" "types_pass — type check not confirmed"
    ((soft++))
  fi

  echo "$hard $soft"
}

validate_phase_11() {
  local file="$ARTIFACTS/qa-report.md"
  local hard=0 soft=0

  if grep -q "## Findings" "$file" 2>/dev/null; then
    log_pass "scan_complete"
  else
    log_fail "HARD" "scan_complete — missing Findings section"
    ((hard++))
  fi

  if grep -q "CRITICAL" "$file" 2>/dev/null; then
    log_fail "HARD" "no_critical — CRITICAL vulnerability found"
    ((hard++))
  else
    log_pass "no_critical"
  fi

  if grep -qi "SQLi" "$file" 2>/dev/null; then
    log_fail "HARD" "no_sqli — SQL injection finding"
    ((hard++))
  else
    log_pass "no_sqli"
  fi

  if grep -qi "No middleware" "$file" 2>/dev/null; then
    log_fail "HARD" "auth_coverage — unprotected routes found"
    ((hard++))
  else
    log_pass "auth_coverage"
  fi

  if grep -qi "Hardcoded" "$file" 2>/dev/null; then
    log_fail "HARD" "no_secrets — hardcoded secrets found"
    ((hard++))
  else
    log_pass "no_secrets"
  fi

  echo "$hard $soft"
}

# Run validation for a phase, apply gate, return 0 to proceed or 1 to retry
run_gate() {
  local phase=$1
  local validate_fn="validate_phase_$phase"

  # Phases 7-10 have NONE gates: always proceed
  if [[ $phase -ge 7 && $phase -le 10 ]]; then
    echo -e "  ${GREEN}Gate: NONE — auto-fix, always proceed${NC}"
    log_result "$phase" "AUTO"
    return 0
  fi

  local result
  result=$($validate_fn)
  local hard_fails soft_fails
  hard_fails=$(echo "$result" | tail -1 | awk '{print $1}')
  soft_fails=$(echo "$result" | tail -1 | awk '{print $2}')

  local decision
  decision=$(gate_decision "$hard_fails" "$soft_fails")

  case "$decision" in
    AUTO)
      echo -e "  ${GREEN}Gate: AUTO — all validators passed${NC}"
      log_result "$phase" "AUTO"
      return 0
      ;;
    WARN)
      echo -e "  ${YELLOW}Gate: WARN — $soft_fails soft failures, proceeding${NC}"
      PHASE_WARNINGS+=("Phase $phase: $soft_fails soft validator failures")
      log_result "$phase" "WARN"
      return 0
      ;;
    PAUSE)
      echo -e "  ${RED}Gate: PAUSE — $hard_fails hard, $soft_fails soft failures${NC}"
      log_result "$phase" "PAUSE"
      pause_for_human "$phase"
      return $?
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Phase execution
# ---------------------------------------------------------------------------

run_phase() {
  local phase=$1 name=$2 gate=$3 artifact=$4

  if is_skipped "$phase"; then
    log_phase "$phase" "$name" "$gate"
    log_skip
    log_result "$phase" "SKIP"
    echo ""
    return 0
  fi

  log_phase "$phase" "$name" "$gate"

  local model
  model=$(get_model "$phase")
  echo -e "  Model: ${CYAN}$model${NC}"

  local prompt
  prompt=$(build_prompt "$phase")

  run_codex "$model" "$prompt" "$ARTIFACTS/$artifact"

  if [[ ! -f "$ARTIFACTS/$artifact" ]]; then
    echo -e "  ${RED}Error: Artifact $artifact was not created${NC}"
    log_result "$phase" "ERROR"
    return 1
  fi

  echo -e "  Artifact: ${CYAN}$artifact${NC} ✓"

  # Run gate
  run_gate "$phase"
  local gate_result=$?

  echo ""
  return $gate_result
}

# Build the prompt for each phase, injecting upstream artifacts
build_prompt() {
  local phase=$1
  local prompt=""

  case $phase in
    0)
      prompt="You are the Pre-Check Agent. Your task: $TASK

Search the codebase for existing implementations related to this task. Check the package manifest for relevant installed libraries. Search the web for up to 3 external options.

Write your output as a markdown file to $ARTIFACTS/pre-check.md with these sections:
- ## Codebase Matches (table: Type | Path | Relevance)
- ## Installed Libraries (table: Package | Version | Purpose)
- ## Recommendation (one of: EXTEND_EXISTING, USE_LIBRARY, BUILD_NEW)
- **Reasoning:** (1-2 sentences)"
      ;;
    1)
      local precheck=""
      [[ -f "$ARTIFACTS/pre-check.md" ]] && precheck=$(cat "$ARTIFACTS/pre-check.md")
      prompt="You are the Requirements Agent. Your task: $TASK

Pre-check context:
$precheck

Extract clear, testable requirements. Write output to $ARTIFACTS/brief.md with sections:
## Verdict: [CLEAR | NEEDS_INPUT]
## Problem (1-2 sentences)
## Success Criteria (numbered, testable)
## Scope (In/Out)
## Constraints
## Context Found
## Assumptions

Max 3 clarifying questions. Skip Q&A if the task is specific. Output NEEDS_INPUT only if genuinely ambiguous."
      ;;
    2)
      local brief=""
      [[ -f "$ARTIFACTS/brief.md" ]] && brief=$(cat "$ARTIFACTS/brief.md")
      prompt="You are the Architect Agent. Create a technical design based on these requirements.

Requirements brief:
$brief

Write output to $ARTIFACTS/design.md with:
## Decisions (max 6, each: **{choice}** — {rationale} — Source: {URL or file:line})
## Components (table, max 4: Name | Purpose | Interface)
## Data Changes (SQL or 'None')
## Risks (table: Risk | Mitigation)

Every decision must cite a source. If docs can't be found, output NEEDS_RESEARCH."
      ;;
    3)
      local design=""
      [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")
      prompt="You are the Adversarial Review Agent. Critique this design from 3 angles.

Design:
$design

Angles: Architect (scalability/coupling), Skeptic (edge cases/security), Implementer (types/testability).

Write output to $ARTIFACTS/critique.md with:
## Verdict: [APPROVED | REVISE_DESIGN]
## Issues (table, max 10: # | Angle | Severity | Issue | Fix)
## Consensus (issues raised by 2+ angles)
## Blocks (if REVISE_DESIGN: list of must-fix items)

Rules: Any HIGH → REVISE_DESIGN. 3+ MEDIUM → REVISE_DESIGN. Any consensus → REVISE_DESIGN."
      ;;
    4)
      local design=""
      [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")
      prompt="You are the Planning Agent. Convert this design into implementation steps.

Design:
$design

Write output to $ARTIFACTS/plan.md with:
## Verdict: [READY | NEEDS_DETAIL]
## Steps (table: # | File | Action | Depends)
Then for each step:
### Step N: {title}
**File:** path [MODIFY|CREATE]
**Deps:** list or None
**Before:** (current code, 3-5 lines context)
**After:** (new code, paste-ready)
**Test:** {input} → {expected output}

Max 8 steps. All MODIFY paths must exist on disk."
      ;;
    5)
      local design="" plan=""
      [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")
      [[ -f "$ARTIFACTS/plan.md" ]] && plan=$(cat "$ARTIFACTS/plan.md")
      prompt="You are the Drift Detection Agent. Verify the plan covers all design requirements.

Design:
$design

Plan:
$plan

Write output to $ARTIFACTS/drift-report.md with:
## Verdict: [ALIGNED | DRIFT_DETECTED]
## Coverage Matrix (table: Design Requirement | Plan Step | Status)
## Missing Coverage
## Scope Creep
## Summary (Requirements: N, Covered: N, Missing: N, Coverage: N%)"
      ;;
    6)
      local plan=""
      [[ -f "$ARTIFACTS/plan.md" ]] && plan=$(cat "$ARTIFACTS/plan.md")
      prompt="You are the Builder Agent. Execute this plan exactly as specified.

Plan:
$plan

For each step: read only referenced files, verify BEFORE matches, apply AFTER exactly, run tests. No improvisation, no refactoring untouched code.

Write output to $ARTIFACTS/build-report.md with:
## Verdict: [SUCCESS | PARTIAL | FAILED]
## Results (table: Step | File | Status | Notes)
## Verification (Build: PASS/FAIL, Types: PASS/FAIL)
## Files Changed (list)"
      ;;
    7)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Denoiser Agent. Remove debug artifacts from changed files.

Build report:
$build_report

Remove: console.log/debug/trace, debugger statements, commented-out code, TODO/DEBUG/TEMP markers, unused imports.
Preserve: console.error with component prefix, explanatory comments, license headers.

Append results to $ARTIFACTS/qa-report.md."
      ;;
    8)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Quality Fit Agent. Check changed files for type safety, lint, and conventions.

Build report:
$build_report

Run type checker and linter on changed files. Check project conventions. Auto-fix violations. Append results to $ARTIFACTS/qa-report.md."
      ;;
    9)
      local build_report="" design="" critique=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")
      [[ -f "$ARTIFACTS/critique.md" ]] && critique=$(cat "$ARTIFACTS/critique.md")
      prompt="You are the Quality Behavior Agent. Verify the code works as designed.

Build report:
$build_report

Design (expected behavior):
$design

Critique (edge cases to check):
$critique

Run build, run tests, verify behavior matches design. Append results to $ARTIFACTS/qa-report.md."
      ;;
    10)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Quality Docs Agent. Check documentation coverage for changed files.

Build report:
$build_report

Check: API route docs (required), public function docs (recommended), type docs (nice-to-have). Append results to $ARTIFACTS/qa-report.md."
      ;;
    11)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Security Agent. Scan changed files for vulnerabilities.

Build report:
$build_report

Scan for: SQL/command injection, XSS, auth gaps, hardcoded secrets, access control issues.

Append findings to $ARTIFACTS/qa-report.md with:
## Findings (table: Type | File:Line | Pattern | Severity | Fix)
## Summary (Injection: CLEAR/FOUND, Auth: N/M protected, Secrets: CLEAR/FOUND)
## Verdict: [PASS | FAIL | CRITICAL]

CRITICAL = injection or secrets. FAIL = XSS or auth bypass. PASS = all clear."
      ;;
  esac

  echo "$prompt"
}

# ---------------------------------------------------------------------------
# Auto-recovery handlers
# ---------------------------------------------------------------------------

handle_phase_3_retry() {
  echo -e "${YELLOW}  Auto-recovery: feeding critique back to Phase 2...${NC}"
  local critique=""
  [[ -f "$ARTIFACTS/critique.md" ]] && critique=$(cat "$ARTIFACTS/critique.md")

  local design=""
  [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")

  local model
  model=$(get_model 2)

  local prompt="You are the Architect Agent. Revise your design based on this adversarial critique.

Previous design:
$design

Critique (issues to address):
$critique

Address all HIGH and consensus issues. Write the revised design to $ARTIFACTS/design.md."

  run_codex "$model" "$prompt" "$ARTIFACTS/design.md"

  # Re-run adversarial review
  run_phase 3 "Adversarial (retry)" "HARD" "critique.md"
}

handle_phase_5_retry() {
  echo -e "${YELLOW}  Auto-recovery: adding missing plan steps...${NC}"
  local drift=""
  [[ -f "$ARTIFACTS/drift-report.md" ]] && drift=$(cat "$ARTIFACTS/drift-report.md")

  local plan=""
  [[ -f "$ARTIFACTS/plan.md" ]] && plan=$(cat "$ARTIFACTS/plan.md")

  local model
  model=$(get_model 4)

  local prompt="You are the Planning Agent. Add missing steps based on this drift report.

Current plan:
$plan

Drift report (missing coverage):
$drift

Add steps for any MISSING requirements. Keep existing steps. Write updated plan to $ARTIFACTS/plan.md."

  run_codex "$model" "$prompt" "$ARTIFACTS/plan.md"

  # Re-run drift detection
  run_phase 5 "Drift (retry)" "SOFT" "drift-report.md"
}

# ---------------------------------------------------------------------------
# Main pipeline execution
# ---------------------------------------------------------------------------

# Phase 0: Pre-Check (NEVER skip)
run_phase 0 "Pre-Check" "HARD" "pre-check.md"

# Phase 1: Requirements
run_phase 1 "Requirements" "SOFT" "brief.md"

# Phase 2: Design
run_phase 2 "Design" "SOFT" "design.md"

# Phase 3: Adversarial Review
if ! is_skipped 3; then
  run_phase 3 "Adversarial Review" "HARD" "critique.md"
  # Check for REVISE_DESIGN and auto-recover
  if [[ -f "$ARTIFACTS/critique.md" ]] && grep -q "REVISE_DESIGN" "$ARTIFACTS/critique.md" 2>/dev/null; then
    handle_phase_3_retry
  fi
fi

# Phase 4: Planning
run_phase 4 "Planning" "SOFT" "plan.md"

# Phase 5: Drift Detection
if ! is_skipped 5; then
  run_phase 5 "Drift Detection" "SOFT" "drift-report.md"
  # Check for DRIFT_DETECTED and auto-recover
  if [[ -f "$ARTIFACTS/drift-report.md" ]] && grep -q "DRIFT_DETECTED" "$ARTIFACTS/drift-report.md" 2>/dev/null; then
    handle_phase_5_retry
  fi
fi

# Phase 6: Build
run_phase 6 "Build" "NONE" "build-report.md"

# Phases 7-10: QA (can run sequentially — Codex doesn't support true parallel)
for qa_phase in 7 8 9 10; do
  case $qa_phase in
    7)  run_phase 7  "Denoise"          "NONE" "qa-report.md" ;;
    8)  run_phase 8  "Quality Fit"      "NONE" "qa-report.md" ;;
    9)  run_phase 9  "Quality Behavior" "NONE" "qa-report.md" ;;
    10) run_phase 10 "Quality Docs"     "NONE" "qa-report.md" ;;
  esac
done

# Phase 11: Security (NEVER skip)
run_phase 11 "Security" "HARD" "qa-report.md"

# ---------------------------------------------------------------------------
# Final report
# ---------------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Pipeline Complete [PROFILE: $PROFILE]${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Task:     $TASK"
echo -e "  Session:  $ARTIFACTS"
echo ""
echo -e "${BOLD}  Phases:${NC}"
for i in 0 1 2 3 4 5 6 7 8 9 10 11; do
  local_result="${PHASE_RESULTS[$i]:-N/A}"
  case $i in
    0)  printf "   %2d. %-18s [%s]\n" "$i" "Pre-Check" "$local_result" ;;
    1)  printf "   %2d. %-18s [%s]\n" "$i" "Requirements" "$local_result" ;;
    2)  printf "   %2d. %-18s [%s]\n" "$i" "Design" "$local_result" ;;
    3)  printf "   %2d. %-18s [%s]\n" "$i" "Adversarial" "$local_result" ;;
    4)  printf "   %2d. %-18s [%s]\n" "$i" "Planning" "$local_result" ;;
    5)  printf "   %2d. %-18s [%s]\n" "$i" "Drift Detection" "$local_result" ;;
    6)  printf "   %2d. %-18s [%s]\n" "$i" "Build" "$local_result" ;;
    7)  printf "   %2d. %-18s [%s]\n" "$i" "Denoise" "$local_result" ;;
    8)  printf "   %2d. %-18s [%s]\n" "$i" "Quality Fit" "$local_result" ;;
    9)  printf "   %2d. %-18s [%s]\n" "$i" "Quality Behavior" "$local_result" ;;
    10) printf "   %2d. %-18s [%s]\n" "$i" "Quality Docs" "$local_result" ;;
    11) printf "   %2d. %-18s [%s]\n" "$i" "Security" "$local_result" ;;
  esac
done

echo ""
echo -e "  Validators: ${GREEN}$TOTAL_PASS passed${NC}, ${RED}$TOTAL_FAIL failed${NC}"

if [[ ${#PHASE_WARNINGS[@]} -gt 0 ]]; then
  echo -e "  ${YELLOW}Warnings:${NC}"
  for w in "${PHASE_WARNINGS[@]}"; do
    echo "    - $w"
  done
else
  echo -e "  Warnings: none"
fi

echo ""
echo -e "  Artifacts: ${CYAN}$ARTIFACTS/${NC}"
echo ""
