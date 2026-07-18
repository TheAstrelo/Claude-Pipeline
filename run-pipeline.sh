#!/usr/bin/env bash
# =============================================================================
# run-pipeline.sh — Orchestrated 12-phase AI development pipeline for Claude CLI
#
# Usage:
#   ./run-pipeline.sh "your task description here"
#   ./run-pipeline.sh --profile=yolo "your task description"
#   ./run-pipeline.sh --mode=dev "your task description"
#   ./run-pipeline.sh --profile=paranoid --skip-ar "your task"
#
# Requirements:
#   - Claude CLI installed and authenticated
#   - CLAUDE.md and .claude/agents/ in the project root
#
# Each phase runs as a SEPARATE `claude -p` process to prevent Bun memory
# accumulation (~1.35GB RSS crash). Each subprocess starts fresh (~200MB).
# =============================================================================

# NOTE: errexit (-e) is deliberately NOT set. This script uses function return
# codes as control-flow signals (gate PAUSE, revise, retry). Under `set -e`,
# a signal return of 1 aborts the whole script — that was the "revise aborts
# the pipeline" and "((retries++)) kills auto-recovery" class of bugs. Genuine
# subprocess errors are handled explicitly in run_claude().
set -uo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROFILE="standard"
MODE="auto"                      # auto | dev
MAX_RETRIES_STANDARD=2
MAX_RETRIES_YOLO=1
MAX_RETRIES_PARANOID=3
SKIP_ARM=false
SKIP_AR=false
SKIP_PMATCH=false

# --- Model routing (Balanced profile) --------------------------------------
# STRONG = open-ended reasoning / adversarial finding (Phase 2 Design,
#          Phase 3 Adversarial). FAST = generation + verification (everything
#          else). Haiku is intentionally never used.
# Exact model IDs are pinned (both parse on this CLI and are the intended
# models); override per run with --model-strong= / --model-fast=.
MODEL_STRONG="claude-opus-4-8"
MODEL_FAST="claude-sonnet-5"
# Highest effort the installed CLI accepts. Probed at startup: older CLIs cap
# at "high", newer ones add "xhigh". The matrix may request "xhigh"; it is
# clamped down to this cap so an unsupported --effort can never kill a call.
EFFORT_CAP="high"

# Budget caps (safety). PER_PHASE is a hard ceiling on each `claude -p` call;
# RUN aborts the pipeline once cumulative spend crosses it. Both USD; override
# with --max-budget-usd= / --max-run-budget-usd=. TOTAL_COST accumulates the
# real per-phase cost parsed from each subprocess's JSON result.
# Informed by a full measured run (add-one-endpoint, 13 phases = $5.78):
#   Opus phases dominate — Design ~$0.90, Adversarial ~$1.27, Code-Review ~$1.73
#   (Code-Review is the priciest single phase; it scales with diff size, so a
#   larger feature can push it to ~$3-4). Sonnet phases ~$0.13-0.26 each.
# Per-phase cap clears Code-Review headroom; the RUN cap is the real runaway
# guard (a typical complete run is ~$6; this leaves room for a large feature).
MAX_BUDGET_PER_PHASE="4.00"
MAX_RUN_BUDGET="15.00"
TOTAL_COST="0"

# Phase 12: on REQUEST_CHANGES, feed the review findings back to a fix pass and
# re-review, up to this many times, before halting for a human. Bounded so a
# fix→new-finding→fix thrash can't loop forever or blow the run budget. 0 = the
# old behavior (halt for a human on the first REQUEST_CHANGES).
MAX_CODE_REVIEW_HEALS="${MAX_CODE_REVIEW_HEALS:-2}"

# Phase 9's un-fakeable signal: the orchestrator runs the project's real test
# command and gates on the captured exit code (a model can't talk past exit 1).
# TEST_COMMAND is auto-detected; TEST_EXIT: -1 = not run / no command, 0 = pass.
TEST_COMMAND=""
TEST_EXIT="-1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
TASK=""
for arg in "$@"; do
  case "$arg" in
    --profile=*)      PROFILE="${arg#*=}" ;;
    --mode=*)         MODE="${arg#*=}" ;;
    --skip-arm)       SKIP_ARM=true ;;
    --skip-ar)        SKIP_AR=true ;;
    --skip-pmatch)    SKIP_PMATCH=true ;;
    --model-strong=*) MODEL_STRONG="${arg#*=}" ;;
    --model-fast=*)   MODEL_FAST="${arg#*=}" ;;
    --max-budget-usd=*)     MAX_BUDGET_PER_PHASE="${arg#*=}" ;;
    --max-run-budget-usd=*) MAX_RUN_BUDGET="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] \"task description\""
      echo ""
      echo "Options:"
      echo "  --mode=auto|dev          auto (non-interactive) or dev (pause between phases)"
      echo "  --profile=PROFILE        yolo | fast | standard | paranoid (default: standard)"
      echo "  --skip-arm               Skip Phase 1 (Requirements)"
      echo "  --skip-ar                Skip Phase 3 (Adversarial Review)"
      echo "  --skip-pmatch            Skip Phase 5 (Drift Detection)"
      echo "  --model-strong=MODEL     Model for Phases 2,3,12 (default: claude-opus-4-8)"
      echo "  --model-fast=MODEL       Model for all other phases (default: claude-sonnet-5)"
      echo "  --max-budget-usd=N       Per-phase spend cap in USD (default: 4.00)"
      echo "  --max-run-budget-usd=N   Whole-run spend cap in USD (default: 15.00)"
      echo "  -h, --help               Show this help"
      echo ""
      echo "Examples:"
      echo "  $0 \"add health check endpoint\""
      echo "  $0 --profile=yolo \"fix login bug\""
      echo "  $0 --mode=dev --profile=paranoid \"add user authentication\""
      exit 0
      ;;
    *)
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
  echo "Usage: $0 [--mode=auto] [--profile=standard] \"your task description\""
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
  fast)
    SKIP_PHASES=(7 8 9 10)
    GATE_MODE="mixed"
    MAX_RETRIES=$MAX_RETRIES_STANDARD
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
    echo -e "${RED}Error: Unknown profile '$PROFILE'. Use yolo, fast, standard, or paranoid.${NC}"
    exit 1
    ;;
esac

# Apply skip flags to the skip list
if [[ "$SKIP_ARM" == "true" ]]; then
  SKIP_PHASES+=(1)
fi
if [[ "$SKIP_AR" == "true" ]]; then
  SKIP_PHASES+=(3)
fi
if [[ "$SKIP_PMATCH" == "true" ]]; then
  SKIP_PHASES+=(5)
fi

# Validate mode
case "$MODE" in
  auto|dev) ;;
  *)
    echo -e "${RED}Error: Unknown mode '$MODE'. Use auto or dev.${NC}"
    exit 1
    ;;
esac

# Probe the highest effort the installed CLI supports (once). `--version`
# short-circuits before any API call, so this is free. Older CLIs reject
# "xhigh"; the matrix's xhigh requests are clamped down to EFFORT_CAP.
if env -u CLAUDECODE claude --effort xhigh --version >/dev/null 2>&1; then
  EFFORT_CAP="xhigh"
fi

# ---------------------------------------------------------------------------
# Session setup
# ---------------------------------------------------------------------------
SESSION_ID=$(date +%Y%m%d-%H%M%S)
SLUG=$(echo "$TASK" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-40)
ARTIFACTS=".claude/artifacts/${SESSION_ID}-${SLUG}"
mkdir -p "$ARTIFACTS"
echo "$ARTIFACTS" > .claude/artifacts/current.txt

# Wired hook scripts (see the detect/notify wiring in "Main pipeline execution").
HOOKS_DIR=".claude/hooks"
# Stack detected by detect-project.sh at startup; prepended to every phase prompt
# so phases match the real framework/conventions. Empty until detection runs.
PROJECT_CONTEXT=""

# Tracking arrays
declare -a PHASE_RESULTS=()
declare -a PHASE_WARNINGS=()
TOTAL_PASS=0
TOTAL_FAIL=0

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Claude Pipeline — Memory-Safe Execution${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Mode:     ${CYAN}$MODE${NC}"
echo -e "  Profile:  ${CYAN}$PROFILE${NC}"
echo -e "  Task:     $TASK"
echo -e "  Session:  $ARTIFACTS"
echo -e "  Gate:     $GATE_MODE"
if [[ ${#SKIP_PHASES[@]} -gt 0 ]]; then
  echo -e "  Skipping: ${YELLOW}${SKIP_PHASES[*]}${NC}"
fi
echo -e "${BOLD}============================================${NC}"
echo ""

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

log_phase() {
  local phase=$1 name=$2 gate=$3
  echo ""
  echo -e "${BOLD}──── Phase $phase: $name [$gate gate] ────${NC}"
}

# Validator display goes to STDERR so it stays visible even when the validator
# function is called inside a command substitution, and so it never contaminates
# the data the gate parses. Counters increment the globals; run_gate calls the
# validators in the current shell (no subshell) so these persist.
log_pass() {
  echo -e "  ${GREEN}✓${NC} $1" >&2
  TOTAL_PASS=$((TOTAL_PASS + 1))
}

log_fail() {
  local severity=$1 msg=$2
  if [[ "$severity" == "HARD" ]]; then
    echo -e "  ${RED}✗ [HARD]${NC} $msg" >&2
  else
    echo -e "  ${YELLOW}! [SOFT]${NC} $msg" >&2
  fi
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
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

# ---------------------------------------------------------------------------
# Core: run_claude() — each phase as a separate process
# ---------------------------------------------------------------------------

# Detect the project's real test command (the un-fakeable Phase 9 signal).
detect_test_command() {
  if [[ -f package.json ]] && grep -qE '"test"[[:space:]]*:' package.json 2>/dev/null \
     && ! grep -q 'no test specified' package.json 2>/dev/null; then
    TEST_COMMAND="npm test"
  elif { [[ -f pyproject.toml ]] || [[ -f pytest.ini ]] || [[ -f setup.cfg ]]; } \
       && command -v pytest >/dev/null 2>&1; then
    TEST_COMMAND="pytest -q"
  elif [[ -f go.mod ]]; then
    TEST_COMMAND="go test ./..."
  elif [[ -f Cargo.toml ]]; then
    TEST_COMMAND="cargo test"
  fi
}

# Run the project's tests in the ORCHESTRATOR (not a model), capture the real
# exit code, and stash the output. This is the one gate a model cannot fake.
run_tests() {
  if [[ -z "$TEST_COMMAND" ]]; then
    echo -e "  ${YELLOW}No test command detected — behavior gate is advisory.${NC}"
    TEST_EXIT="-1"
    return
  fi
  echo -e "  ${DIM}Running tests: $TEST_COMMAND${NC}"
  eval "$TEST_COMMAND" > "$ARTIFACTS/test-output.txt" 2>&1
  TEST_EXIT=$?
  if [[ "$TEST_EXIT" -eq 0 ]]; then
    echo -e "  ${GREEN}Tests passed (exit 0)${NC}"
  else
    echo -e "  ${RED}Tests FAILED (exit $TEST_EXIT) — see test-output.txt${NC}"
  fi
}

# Clamp a requested effort level down to what the CLI supports (see EFFORT_CAP).
clamp_effort() {
  local want="$1"
  if [[ "$want" == "xhigh" && "$EFFORT_CAP" != "xhigh" ]]; then
    echo "high"
  else
    echo "$want"
  fi
}

# Map a phase number to "MODEL|EFFORT" under the Balanced routing profile.
#   STRONG (Opus)  : 2 Design, 3 Adversarial, 12 Code-review — reasoning /
#                    adversarial finding / bug-hunting on the real diff
#   FAST   (Sonnet): everything else — generation + verification
# Effort follows cost-of-a-miss: code-review (last line of defense on built
# code) gets the deepest effort of the finding cluster.
phase_routing() {
  local phase=$1 model effort
  case $phase in
    12)       model="$MODEL_STRONG"; effort="xhigh"  ;;  # commit code-review (deepest)
    2|3)      model="$MODEL_STRONG"; effort="high"   ;;  # design, adversarial
    0|11)     model="$MODEL_FAST";   effort="xhigh"  ;;  # pre-check, security (deep)
    4|5|6|9)  model="$MODEL_FAST";   effort="medium" ;;  # planning, drift, build, behavior
    1|7|8|10) model="$MODEL_FAST";   effort="low"    ;;  # requirements, denoise, fit, docs
    *)        model="$MODEL_FAST";   effort="medium" ;;
  esac
  echo "${model}|$(clamp_effort "$effort")"
}

# Map a phase to the minimal built-in toolset it needs. Scoping --tools shrinks
# the per-subprocess schema payload the model must load: measured full built-in
# set ~33K tokens vs ~10K (analysis) / ~12K (research) / ~15K (build) scoped —
# the biggest *controllable* slice of the ~33K bootstrap paid fresh per phase.
# Every phase keeps Write: it authors its own artifact via the Write tool, and a
# phase that writes no artifact is a hard failure (see run_claude).
phase_tools() {
  case $1 in
    0|2)      echo "Read,Write,Grep,Glob,WebSearch,WebFetch" ;;  # research: prior art / cited design
    1|3|4|5)  echo "Read,Write,Grep,Glob" ;;                     # read-only analysis + author artifact
    11|12)    echo "Read,Write,Grep,Glob,Bash" ;;                # audit / review: read + run checks, no edits
    *)        echo "Read,Write,Edit,Bash,Grep,Glob" ;;           # 6-10 build/QA: edit code, run commands
  esac
}

# Verdict schema for the gating phases (would constrain the model's final answer
# to a valid verdict token via --json-schema).
#
# DISABLED: --json-schema triggers a spurious "Prompt is too long" API error
# (HTTP-level, $0 cost, rejected before processing) on Opus at high/xhigh effort
# — reproduced with a one-line prompt. That breaks the Opus gating phases (3, 12).
# Gating instead uses read_verdict()'s anchored grep of the artifact's
# "## Verdict:" line, which extracts the exact enum token and is proven in a full
# end-to-end run. Re-enable a case below ONLY for phases that don't route to Opus
# at high effort, and only after confirming the CLI no longer errors.
phase_schema() {
  case "$1" in
    # 3)  echo '{"type":"string","enum":["APPROVED","REVISE_DESIGN"]}' ;;  # Opus/high — broken
    # 11) echo '{"type":"string","enum":["PASS","FAIL","CRITICAL"]}' ;;    # Sonnet/xhigh — untested
    # 12) echo '{"type":"string","enum":["APPROVE","REQUEST_CHANGES"]}' ;; # Opus/xhigh — broken
    *)  echo '' ;;
  esac
}

# Read a phase's verdict: prefer the typed --json-schema result ($artifact.verdict),
# fall back to an anchored grep of the artifact. Un-fakeable when the schema is on.
#   $1 = artifact path   $2 = alternation of valid tokens (e.g. "PASS|FAIL|CRITICAL")
read_verdict() {
  local artifact="$1" tokens="$2" v=""
  if [[ -s "$artifact.verdict" ]]; then
    v=$(tr -d ' \t\r\n' < "$artifact.verdict")
  fi
  # Only trust the typed value if it's one of the expected tokens.
  if [[ -n "$v" ]] && echo "$v" | grep -qxE "$tokens"; then
    echo "$v"; return
  fi
  # Anchored to a Verdict heading, but tolerant of markdown the model varies:
  # "## Verdict:", "### Verdict:" (nested under a section), "**Verdict:**",
  # with or without the colon. Last match wins (the gating phase writes last).
  grep -oE "^(#{2,}|\*\*)[[:space:]]*Verdict:?\**[[:space:]]*($tokens)" "$artifact" 2>/dev/null \
    | grep -oE "$tokens" | tail -1
}

run_claude() {
  local prompt="$1"
  local output_file="$2"
  local model="${3:-$MODEL_FAST}"
  local effort="${4:-medium}"
  local schema="${5:-}"
  # 6th arg: comma-separated built-in tools this phase may load. Default is the
  # generous superset (safe for any caller that doesn't scope) — run_phase passes
  # the tight per-phase set from phase_tools().
  local tools="${6:-Read,Write,Edit,Bash,Grep,Glob,WebSearch,WebFetch}"

  echo -e "  ${DIM}Spawning claude -p (${model}, effort=${effort}${schema:+, typed verdict})...${NC}"

  # Optional --json-schema constrains the model's FINAL answer to a typed value
  # (a verdict enum) the gate can trust — the model cannot return a
  # non-conforming verdict. The artifact is still written by the Write tool.
  local -a schema_args=()
  [[ -n "$schema" ]] && schema_args=(--json-schema "$schema")

  # env -u CLAUDECODE: the nesting guard refuses to launch `claude` from inside
  # a Claude Code session; unsetting it lets the subprocess start (verified).
  # stdout -> .raw (debug only), stderr -> .err. We deliberately do NOT use
  # `2>&1 | tee`, which made a subprocess error indistinguishable from output.
  # --strict-mcp-config: run hermetic — ignore any ambient MCP servers the host
  # has configured (keeps the pipeline deterministic and lean on other machines).
  # --tools: load only this phase's built-in tools (the bootstrap-shrinking lever).
  env -u CLAUDECODE claude -p --model "$model" --effort "$effort" \
      --output-format json --max-budget-usd "$MAX_BUDGET_PER_PHASE" \
      --strict-mcp-config --tools "$tools" \
      "${schema_args[@]}" \
      --dangerously-skip-permissions <<< "$prompt" \
      > "$output_file.raw" 2> "$output_file.err"
  local rc=$?

  # --output-format json puts a result object on stdout (in .raw); the artifact
  # is still written to disk by the subprocess's Write tool. Parse this phase's
  # cost + result subtype and add to the running total.
  local phase_cost subtype
  phase_cost=$(node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(d.total_cost_usd||0))}catch(e){process.stdout.write("0")}' "$output_file.raw" 2>/dev/null || echo "0")
  subtype=$(node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(d.subtype||""))}catch(e){process.stdout.write("")}' "$output_file.raw" 2>/dev/null || echo "")
  TOTAL_COST=$(node -e 'process.stdout.write(((parseFloat(process.argv[1])||0)+(parseFloat(process.argv[2])||0)).toFixed(4))' "$TOTAL_COST" "$phase_cost" 2>/dev/null || echo "$TOTAL_COST")
  echo -e "  ${DIM}cost: \$${phase_cost}  (run total: \$${TOTAL_COST})${NC}"

  # If a verdict schema was requested, persist the typed result token so the
  # validator can gate on it (falls back to the artifact if this is empty).
  if [[ -n "$schema" ]]; then
    node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));let r=d.result;if(typeof r!=="string")r=(r&&r.verdict)?r.verdict:JSON.stringify(r||"");require("fs").writeFileSync(process.argv[2],String(r).trim())}catch(e){require("fs").writeFileSync(process.argv[2],"")}' "$output_file.raw" "$output_file.verdict" 2>/dev/null || true
  fi

  if [[ "$subtype" == "error_max_budget_usd" ]]; then
    echo -e "  ${RED}✗ Hit per-phase budget cap (\$${MAX_BUDGET_PER_PHASE}); phase cut short.${NC}" >&2
    return 1
  fi

  if [[ $rc -ne 0 ]]; then
    echo -e "  ${RED}✗ claude -p failed (exit $rc) — see $(basename "$output_file").err${NC}" >&2
    return 1
  fi

  # A phase that did not write its artifact FAILED. We never promote .raw to the
  # artifact: a refusal or error echoed to stdout must not become a "design".
  if [[ ! -f "$output_file" ]]; then
    echo -e "  ${RED}✗ Subprocess wrote no artifact ($(basename "$output_file")).${NC}" >&2
    echo -e "  ${DIM}stdout captured in $(basename "$output_file").raw for debugging.${NC}" >&2
    return 1
  fi

  echo -e "  ${GREEN}✓ Artifact written: $(basename "$output_file")${NC}"
  return 0
}

# ---------------------------------------------------------------------------
# Gate logic
# ---------------------------------------------------------------------------

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
  # Non-interactive (headless CI, or invoked from a tool with no TTY on stdin):
  # do NOT block on read — a HARD gate failure must halt (exit 3) so the caller
  # can surface it to the user, instead of read hitting EOF and silently
  # "defaulting to continue" (which would wave a failed security gate through).
  if [[ ! -t 0 || "${PIPELINE_NONINTERACTIVE:-0}" == "1" ]]; then
    echo -e "${RED}HARD gate failed at Phase $phase and no interactive TTY is attached.${NC}" >&2
    echo -e "${RED}Halting for review — inspect $ARTIFACTS/ then re-run (add --resume support later).${NC}" >&2
    exit 3
  fi
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

# Dev mode: present artifact and wait for user input
dev_pause() {
  local phase=$1 artifact=$2
  echo ""
  echo -e "${BOLD}── Dev Mode: Review Phase $phase ──${NC}"
  echo ""

  if [[ -f "$ARTIFACTS/$artifact" ]]; then
    echo -e "${DIM}--- Artifact preview (first 40 lines) ---${NC}"
    head -40 "$ARTIFACTS/$artifact"
    echo -e "${DIM}--- end preview ---${NC}"
  fi

  echo ""
  echo -e "  [c] continue   — proceed to next phase"
  echo -e "  [r] revise     — re-run this phase"
  echo -e "  [o] override   — skip validation and proceed"
  echo -e "  [q] quit       — stop the pipeline"
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

  if grep -qi "Codebase Matches\|Codebase Findings" "$file" 2>/dev/null; then
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

  GATE_HARD=$hard
  GATE_SOFT=$soft
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

  GATE_HARD=$hard
  GATE_SOFT=$soft
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

  if grep -c "Source:" "$file" 2>/dev/null | grep -qv "^0$"; then
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

  GATE_HARD=$hard
  GATE_SOFT=$soft
}

validate_phase_3() {
  local file="$ARTIFACTS/critique.md"
  local hard=0 soft=0

  local verdict
  verdict=$(read_verdict "$file" "APPROVED|REVISE_DESIGN")
  if [[ -n "$verdict" ]]; then
    log_pass "has_verdict ($verdict)"
  else
    log_fail "HARD" "has_verdict — no APPROVED/REVISE_DESIGN verdict"
    ((hard++))
  fi

  if grep -q "| HIGH |" "$file" 2>/dev/null; then
    log_fail "HARD" "no_high_severity — HIGH severity issues found"
    ((hard++))
  else
    log_pass "no_high_severity"
  fi

  local medium_count
  medium_count=$(grep -c "MEDIUM" "$file" 2>/dev/null || true)
  medium_count=${medium_count:-0}
  if [[ $medium_count -lt 3 ]]; then
    log_pass "few_medium ($medium_count)"
  else
    log_fail "SOFT" "few_medium — $medium_count MEDIUM issues (threshold: <3)"
    ((soft++))
  fi

  GATE_HARD=$hard
  GATE_SOFT=$soft
}

validate_phase_4() {
  local file="$ARTIFACTS/plan.md"
  local hard=0 soft=0

  local step_count
  step_count=$(grep -c "### Step" "$file" 2>/dev/null || true)
  step_count=${step_count:-0}

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

  GATE_HARD=$hard
  GATE_SOFT=$soft
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

  GATE_HARD=$hard
  GATE_SOFT=$soft
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

  GATE_HARD=$hard
  GATE_SOFT=$soft
}

validate_phase_9() {
  # Gate on the REAL test exit code captured by run_tests() — not on anything
  # the model wrote. SOFT: WARN in standard/mixed, PAUSE in paranoid/hard.
  local hard=0 soft=0
  case "$TEST_EXIT" in
    0)   log_pass "tests_pass (exit 0)" ;;
    -1)  log_pass "tests (no test command — advisory only)" ;;
    *)   log_fail "SOFT" "tests_pass — test suite exited $TEST_EXIT (see test-output.txt)"; ((soft++)) ;;
  esac
  GATE_HARD=$hard
  GATE_SOFT=$soft
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

  # Gate on the model's own anchored verdict line, not on bare word matches.
  # The old approach greped for "CRITICAL"/"Hardcoded"/"SQLi" anywhere in the
  # file, which (a) tripped on explanatory prose and a clean report's
  # "Hardcoded secrets: NONE", (b) contaminated on the QA output phases 7-10
  # already appended to qa-report.md, and (c) FAILED OPEN — an XSS or auth
  # bypass is FAIL severity and emitted none of those tokens, so it passed
  # every gate green. Reading the last "## Verdict:" line closes all three.
  local verdict
  verdict=$(read_verdict "$file" "PASS|FAIL|CRITICAL")
  verdict=${verdict:-MISSING}

  case "$verdict" in
    PASS)
      log_pass "security_verdict (PASS)"
      ;;
    FAIL)
      log_fail "HARD" "security_verdict — FAIL (XSS or auth bypass)"
      ((hard++))
      ;;
    CRITICAL)
      log_fail "HARD" "security_verdict — CRITICAL (injection or hardcoded secret)"
      ((hard++))
      ;;
    *)
      log_fail "HARD" "security_verdict — no '## Verdict: PASS|FAIL|CRITICAL' line found"
      ((hard++))
      ;;
  esac

  GATE_HARD=$hard
  GATE_SOFT=$soft
}

validate_phase_12() {
  local file="$ARTIFACTS/code-review.md"
  local hard=0 soft=0

  if grep -q "## Findings" "$file" 2>/dev/null; then
    log_pass "review_complete"
  else
    log_fail "HARD" "review_complete — missing Findings section"
    ((hard++))
  fi

  # Gate on the reviewer's typed verdict (--json-schema), anchored grep fallback.
  # REQUEST_CHANGES is NOT a hard fail here: like the Phase 3/5 recovery pattern,
  # the orchestrator owns it — it runs a bounded auto-heal loop and only halts for
  # a human after the heals are exhausted. A MISSING/malformed verdict IS hard
  # (we cannot tell what the reviewer decided).
  local verdict
  verdict=$(read_verdict "$file" "APPROVE|REQUEST_CHANGES")
  verdict=${verdict:-MISSING}

  case "$verdict" in
    APPROVE)
      log_pass "code_review_verdict (APPROVE)"
      ;;
    REQUEST_CHANGES)
      log_pass "code_review_verdict (REQUEST_CHANGES — auto-heal will run)"
      ;;
    *)
      log_fail "HARD" "code_review_verdict — no '## Verdict: APPROVE|REQUEST_CHANGES' line found"
      ((hard++))
      ;;
  esac

  GATE_HARD=$hard
  GATE_SOFT=$soft
}

# ---------------------------------------------------------------------------
# Run gate: validate + decide
# ---------------------------------------------------------------------------

run_gate() {
  local phase=$1
  local validate_fn="validate_phase_$phase"

  # Phases 7, 8, 10 have NONE gates: always proceed. Phase 9 (Quality-Behavior)
  # is NOT in this band — it gates on a real captured test exit code (validate_phase_9).
  if [[ $phase == 7 || $phase == 8 || $phase == 10 ]]; then
    echo -e "  ${GREEN}Gate: NONE — auto-fix, always proceed${NC}"
    log_result "$phase" "AUTO"
    return 0
  fi

  # Run the validator in the CURRENT shell (not a command substitution) so its
  # log_pass/log_fail counters and GATE_HARD/GATE_SOFT results persist. The
  # validator prints its ✓/✗ lines to stderr, so nothing to capture here.
  GATE_HARD=0
  GATE_SOFT=0
  "$validate_fn"
  local hard_fails=$GATE_HARD soft_fails=$GATE_SOFT

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
# Build prompts for each phase
# ---------------------------------------------------------------------------

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

Research live documentation for relevant libraries/APIs. Analyze existing codebase patterns. Make design decisions — each must cite live docs OR existing codebase patterns.

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

Rules: Any HIGH -> REVISE_DESIGN. 3+ MEDIUM -> REVISE_DESIGN. Any consensus -> REVISE_DESIGN."
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
**Test:** {input} -> {expected output}

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

Append results to $ARTIFACTS/qa-report.md with a ## Denoise section."
      ;;
    8)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Quality Fit Agent. Check changed files for type safety, lint, and conventions.

Build report:
$build_report

Run type checker and linter on changed files. Check project conventions. Auto-fix violations. Append results to $ARTIFACTS/qa-report.md with a ## Quality Fit section."
      ;;
    9)
      local build_report="" design="" critique="" test_output=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")
      [[ -f "$ARTIFACTS/critique.md" ]] && critique=$(cat "$ARTIFACTS/critique.md")
      [[ -f "$ARTIFACTS/test-output.txt" ]] && test_output=$(cat "$ARTIFACTS/test-output.txt")
      prompt="You are the Quality Behavior Agent. Verify the code works as designed.

Build report:
$build_report

Design (expected behavior):
$design

Critique (edge cases to check):
$critique

The orchestrator ALREADY ran the test suite (\`$TEST_COMMAND\`) and captured this REAL output — exit code was $TEST_EXIT (0 = pass). Do not claim a different result; analyze what actually happened:
--- test output ---
$test_output
--- end test output ---

Verify behavior matches design against the real test result above. If exit code is non-zero, explain which behavior is broken and what must change. Append results to $ARTIFACTS/qa-report.md with a ## Quality Behavior section (state the real exit code)."
      ;;
    10)
      local build_report=""
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Quality Docs Agent. Check documentation coverage for changed files.

Build report:
$build_report

Check: API route docs (required), public function docs (recommended), type docs (nice-to-have). Append results to $ARTIFACTS/qa-report.md with a ## Quality Docs section."
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
    12)
      local brief="" plan="" build_report=""
      [[ -f "$ARTIFACTS/brief.md" ]] && brief=$(cat "$ARTIFACTS/brief.md")
      [[ -f "$ARTIFACTS/plan.md" ]] && plan=$(cat "$ARTIFACTS/plan.md")
      [[ -f "$ARTIFACTS/build-report.md" ]] && build_report=$(cat "$ARTIFACTS/build-report.md")
      prompt="You are the Commit Code-Review Agent — the final gate before this code is committed. Review the REAL diff, not the builder's claims.

First, run \`git --no-pager diff\` (and \`git --no-pager diff --staged\` if anything is staged) yourself to see EXACTLY what changed in this run. Then review those changes against:

Success criteria (from the original brief — this is what we set out to build):
$brief

Plan that was supposed to be executed:
$plan

Build report (what the builder CLAIMS it did — verify against the actual diff):
$build_report

Judge the diff on its own terms: Does it actually satisfy every success criterion? Does it match the plan? Any bugs, security issues, missed edge cases, or unrequested/scope-creep changes? You are an unbiased reviewer seeing the real changes for the first time.

Write your review to $ARTIFACTS/code-review.md with:
## Findings (table: Severity | File:Line | Issue | Fix)
## Criteria Coverage (table: Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff)
## Verdict: [APPROVE | REQUEST_CHANGES]

APPROVE only if the diff satisfies ALL success criteria with no HIGH-severity findings. Otherwise REQUEST_CHANGES and be specific about what must change."
      ;;
  esac

  echo "$prompt"
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
    return 0
  fi

  log_phase "$phase" "$name" "$gate"

  local prompt
  prompt=$(build_prompt "$phase")
  # Prepend the detected stack note (empty unless detect-project.sh found one).
  prompt="${PROJECT_CONTEXT}${prompt}"

  local routing model effort schema tools
  routing=$(phase_routing "$phase")
  model="${routing%%|*}"; effort="${routing##*|}"
  schema=$(phase_schema "$phase")
  tools=$(phase_tools "$phase")

  # run_claude returns non-zero if the subprocess errored OR wrote no artifact.
  # A missing artifact is a real failure: downstream phases would cat a missing
  # file and cascade. Halt loudly instead of continuing on fabricated emptiness.
  if ! run_claude "$prompt" "$ARTIFACTS/$artifact" "$model" "$effort" "$schema" "$tools"; then
    echo -e "  ${RED}Phase $phase ($name) FAILED — no artifact produced. Halting.${NC}" >&2
    log_result "$phase" "ERROR"
    exit 1
  fi

  echo -e "  Artifact: ${CYAN}$artifact${NC} created"

  # Abort the whole run if cumulative spend has crossed the run cap.
  if node -e 'process.exit((parseFloat(process.argv[1])||0) > (parseFloat(process.argv[2])||0) ? 0 : 1)' "$TOTAL_COST" "$MAX_RUN_BUDGET" 2>/dev/null; then
    echo -e "${RED}Run budget cap (\$${MAX_RUN_BUDGET}) exceeded — total \$${TOTAL_COST}. Halting.${NC}" >&2
    log_result "$phase" "BUDGET"
    exit 4
  fi

  # Run gate. errexit is off, so a PAUSE/revise/quit return does not abort here;
  # capture the result explicitly.
  local gate_result=0
  run_gate "$phase" || gate_result=$?

  # Dev mode: pause for human review after artifact-producing phases (1-6)
  if [[ "$MODE" == "dev" && $phase -ge 1 && $phase -le 6 && $gate_result -eq 0 ]]; then
    dev_pause "$phase" "$artifact"
    gate_result=$?
  fi

  return $gate_result
}

# ---------------------------------------------------------------------------
# Auto-recovery handlers
# ---------------------------------------------------------------------------

handle_phase_3_retry() {
  local retries=0
  while [[ $retries -lt $MAX_RETRIES ]]; do
    retries=$((retries + 1))
    echo -e "${YELLOW}  Auto-recovery ($retries/$MAX_RETRIES): feeding critique back to Phase 2...${NC}"

    local critique=""
    [[ -f "$ARTIFACTS/critique.md" ]] && critique=$(cat "$ARTIFACTS/critique.md")

    local design=""
    [[ -f "$ARTIFACTS/design.md" ]] && design=$(cat "$ARTIFACTS/design.md")

    local prompt="You are the Architect Agent. Revise your design based on this adversarial critique.

Previous design:
$design

Critique (issues to address):
$critique

Address all HIGH and consensus issues. Write the revised design to $ARTIFACTS/design.md."

    run_claude "$prompt" "$ARTIFACTS/design.md" "$MODEL_STRONG" "$(clamp_effort high)" "" "$(phase_tools 2)"

    # Re-run adversarial review
    run_phase 3 "Adversarial (retry $retries)" "HARD" "critique.md"

    # Check if still REVISE_DESIGN
    if [[ "$(read_verdict "$ARTIFACTS/critique.md" "APPROVED|REVISE_DESIGN")" != "REVISE_DESIGN" ]]; then
      echo -e "  ${GREEN}Design approved after $retries revision(s)${NC}"
      return 0
    fi
  done

  echo -e "  ${YELLOW}Max retries ($MAX_RETRIES) reached for Phase 3 auto-recovery${NC}"
  if [[ "$MODE" == "auto" ]]; then
    pause_for_human 3
  fi
}

handle_phase_5_retry() {
  local retries=0
  while [[ $retries -lt $MAX_RETRIES ]]; do
    retries=$((retries + 1))
    echo -e "${YELLOW}  Auto-recovery ($retries/$MAX_RETRIES): adding missing plan steps...${NC}"

    local drift=""
    [[ -f "$ARTIFACTS/drift-report.md" ]] && drift=$(cat "$ARTIFACTS/drift-report.md")

    local plan=""
    [[ -f "$ARTIFACTS/plan.md" ]] && plan=$(cat "$ARTIFACTS/plan.md")

    local prompt="You are the Planning Agent. Add missing steps based on this drift report.

Current plan:
$plan

Drift report (missing coverage):
$drift

Add steps for any MISSING requirements. Keep existing steps. Write updated plan to $ARTIFACTS/plan.md."

    run_claude "$prompt" "$ARTIFACTS/plan.md" "$MODEL_FAST" "$(clamp_effort medium)" "" "$(phase_tools 4)"

    # Re-run drift detection
    run_phase 5 "Drift (retry $retries)" "SOFT" "drift-report.md"

    # Check if still DRIFT_DETECTED
    if [[ -f "$ARTIFACTS/drift-report.md" ]] && ! grep -q "DRIFT_DETECTED" "$ARTIFACTS/drift-report.md" 2>/dev/null; then
      echo -e "  ${GREEN}Plan aligned after $retries revision(s)${NC}"
      return 0
    fi
  done

  echo -e "  ${YELLOW}Max retries ($MAX_RETRIES) reached for Phase 5 auto-recovery${NC}"
  if [[ "$MODE" == "auto" ]]; then
    pause_for_human 5
  fi
}

# ---------------------------------------------------------------------------
# Main pipeline execution
# ---------------------------------------------------------------------------

# Detect the project's test command up front (used by the Phase 9 gate).
detect_test_command
if [[ -n "$TEST_COMMAND" ]]; then
  echo -e "  Test cmd: ${CYAN}$TEST_COMMAND${NC} (Phase 9 gates on its real exit code)"
else
  echo -e "  Test cmd: ${YELLOW}none detected — Phase 9 behavior gate is advisory${NC}"
fi

# detect-project.sh: identify the stack (framework, language, commands, search
# dirs) and stash it as a session artifact phases can Read. It also (a) fills
# TEST_COMMAND when the simpler detect_test_command found nothing, and (b) seeds
# PROJECT_CONTEXT, a one-line "match this stack" note prepended to every prompt.
if [[ -f "$HOOKS_DIR/detect-project.sh" ]]; then
  bash "$HOOKS_DIR/detect-project.sh" "$ARTIFACTS/project-config.json" >/dev/null 2>&1 || true
  if [[ -f "$ARTIFACTS/project-config.json" ]]; then
    _cfg="$ARTIFACTS/project-config.json"
    PROJECT_TYPE=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).projectType||""))}catch(e){}' "$_cfg" 2>/dev/null || echo "")
    FRAMEWORK=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).framework||""))}catch(e){}' "$_cfg" 2>/dev/null || echo "")
    _dtest=$(node -e 'try{process.stdout.write(String((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).commands||{}).test||""))}catch(e){}' "$_cfg" 2>/dev/null || echo "")
    if [[ -z "$TEST_COMMAND" && -n "$_dtest" ]]; then
      TEST_COMMAND="$_dtest"
      echo -e "  Test cmd: ${CYAN}$TEST_COMMAND${NC} (from detect-project.sh)"
    fi
    if [[ -n "$PROJECT_TYPE" && "$PROJECT_TYPE" != "unknown" ]]; then
      PROJECT_CONTEXT="Project context: this is a ${PROJECT_TYPE}${FRAMEWORK:+ (${FRAMEWORK})} project — match its existing conventions, imports, and file layout.

"
      echo -e "  Detected: ${CYAN}${PROJECT_TYPE}${FRAMEWORK:+ / ${FRAMEWORK}}${NC}"
    fi
  fi
fi

# notify.sh: fire a desktop notification on EVERY terminal path — normal
# completion, HARD-gate halt (exit 3), budget cut (exit 4), or error (exit 1).
# Set the trap HERE (after arg validation) so --help and usage errors don't ping.
notify_exit() {
  local rc=$?
  [[ -f "$HOOKS_DIR/notify.sh" ]] || return 0
  if [[ $rc -eq 0 ]]; then
    bash "$HOOKS_DIR/notify.sh" "Auto Pipeline ✓" "Done: ${TASK} (\$${TOTAL_COST})" success >/dev/null 2>&1 || true
  else
    bash "$HOOKS_DIR/notify.sh" "Auto Pipeline ✗" "Halted (exit ${rc}): ${TASK}" error >/dev/null 2>&1 || true
  fi
}
trap notify_exit EXIT

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
  if [[ "$(read_verdict "$ARTIFACTS/critique.md" "APPROVED|REVISE_DESIGN")" == "REVISE_DESIGN" ]]; then
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

# Phases 7-10: QA (sequential — each subprocess is independent)
for qa_phase in 7 8 9 10; do
  case $qa_phase in
    7)  run_phase 7  "Denoise"          "NONE" "qa-report.md" ;;
    8)  run_phase 8  "Quality Fit"      "NONE" "qa-report.md" ;;
    9)  run_tests    # captures the real exit code the SOFT gate reads
        run_phase 9  "Quality Behavior" "SOFT" "qa-report.md" ;;
    10) run_phase 10 "Quality Docs"     "NONE" "qa-report.md" ;;
  esac
done

# Phase 11: Security (NEVER skip)
run_phase 11 "Security" "HARD" "qa-report.md"

# Phase 12: Commit Code-Review (HARD) — review the real diff. On REQUEST_CHANGES,
# run a BOUNDED auto-heal loop (apply findings → re-test → re-review) up to
# MAX_CODE_REVIEW_HEALS times, then halt for a human. Commit only on APPROVE.
# The machine self-heals what's mechanically fixable; a human sees only the
# genuine judgment calls that survive the heals. Requires a git repo; if the
# working tree isn't git-initialized, skip cleanly.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  run_phase 12 "Commit Code-Review" "HARD" "code-review.md"

  cr_verdict() { read_verdict "$ARTIFACTS/code-review.md" "APPROVE|REQUEST_CHANGES"; }

  heals=0
  while [[ "$(cr_verdict)" != "APPROVE" && $heals -lt $MAX_CODE_REVIEW_HEALS ]]; do
    heals=$((heals + 1))
    echo -e "${YELLOW}  Code-review REQUEST_CHANGES — auto-heal $heals/$MAX_CODE_REVIEW_HEALS: applying findings...${NC}"

    cr_findings=$(cat "$ARTIFACTS/code-review.md" 2>/dev/null)
    cr_criteria=""
    [[ -f "$ARTIFACTS/brief.md" ]] && cr_criteria=$(cat "$ARTIFACTS/brief.md")

    heal_prompt="You are the Build/Fix Agent. A code review of the CURRENT working-tree diff returned REQUEST_CHANGES. Apply the requested changes directly to the working tree — fix every issue the review raised. Do not revert or rewrite unrelated work, and do not weaken or delete tests just to make them pass.

Success criteria (the change must still satisfy all of these):
$cr_criteria

Code-review findings to address:
$cr_findings

When done, write a short summary of exactly what you changed to $ARTIFACTS/heal-report.md."

    run_claude "$heal_prompt" "$ARTIFACTS/heal-report.md" "$MODEL_FAST" "$(clamp_effort medium)" "" "$(phase_tools 6)" || true

    # Re-verify behavior after the fix (the un-fakeable signal), then re-review
    # the new diff. run_phase 12 re-runs validate_phase_12 and refreshes the cost.
    run_tests
    run_phase 12 "Commit Code-Review (re-review after heal $heals)" "HARD" "code-review.md"
  done

  if [[ "$(cr_verdict)" == "APPROVE" ]]; then
    # (git add -A respects .gitignore, so node_modules/.env stay out — do NOT
    # commit without a .gitignore in a real project.)
    [[ $heals -gt 0 ]] && echo -e "  ${GREEN}Code-review APPROVE after $heals auto-heal(s).${NC}"
    BRANCH="pipeline/${SESSION_ID}"
    git checkout -b "$BRANCH" >/dev/null 2>&1 || git checkout "$BRANCH" >/dev/null 2>&1
    # Stage the built CODE, not the pipeline's own scratch. Excluding
    # .claude/artifacts (raw model JSON + stderr) keeps ephemeral machinery out of
    # the user's commit AND avoids the deep session paths that exceed the Windows
    # MAX_PATH limit and make a bare `git add -A` fail with "Filename too long"
    # (which silently produced an empty commit before this fix). .gitignore still
    # governs everything else (node_modules, .env, ...).
    git add -A -- '.' ':(exclude).claude/artifacts' ':(exclude)*.raw' ':(exclude)*.err' ':(exclude)run.log' 2>/dev/null
    if git commit -q -m "pipeline: $TASK" -m "Auto-committed after code-review APPROVE (session $SESSION_ID)"; then
      echo -e "  ${GREEN}Committed reviewed changes to branch $BRANCH${NC}"
    else
      echo -e "  ${YELLOW}Nothing to commit (no changes staged)${NC}"
    fi
  else
    # Heals exhausted, still not APPROVE — hand off to a human (pause_for_human
    # exits 3 when headless, so the caller surfaces it). The mechanical fixes were
    # already attempted; what remains is a genuine judgment call. An interactive
    # continue/override falls through WITHOUT committing (verdict != APPROVE), so
    # the human inspects and commits manually.
    echo -e "${RED}  Code-review still REQUEST_CHANGES after $heals auto-heal attempt(s) — handing to a human.${NC}" >&2
    log_result 12 "PAUSE"
    pause_for_human 12
  fi
else
  echo ""
  echo -e "${YELLOW}Phase 12 (Commit Code-Review): SKIPPED — working tree is not a git repository.${NC}"
  log_result 12 "SKIP"
fi

# ---------------------------------------------------------------------------
# Final report
# ---------------------------------------------------------------------------

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Pipeline Complete${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Mode:     ${CYAN}$MODE${NC}"
echo -e "  Profile:  ${CYAN}$PROFILE${NC}"
echo -e "  Task:     $TASK"
echo -e "  Session:  $ARTIFACTS"
echo ""
echo -e "${BOLD}  Phases:${NC}"
for i in 0 1 2 3 4 5 6 7 8 9 10 11 12; do
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
    12) printf "   %2d. %-18s [%s]\n" "$i" "Commit Review" "$local_result" ;;
  esac
done

echo ""
echo -e "  Validators: ${GREEN}$TOTAL_PASS passed${NC}, ${RED}$TOTAL_FAIL failed${NC}"
echo -e "  Est. cost:  ${CYAN}\$${TOTAL_COST}${NC} (per-phase cap \$${MAX_BUDGET_PER_PHASE}, run cap \$${MAX_RUN_BUDGET})"

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

# ---------------------------------------------------------------------------
# Record this run in .claude/history.json (best-effort; never fails the run).
# Nothing else in the pipeline writes run history, so /pipeline-history and the
# summary counters had no data source before this.
# ---------------------------------------------------------------------------
HIST=".claude/history.json"
[[ -f "$HIST" ]] || echo '{"version":1,"runs":[],"summary":{"totalRuns":0,"successCount":0,"failedCount":0,"totalCost":0,"totalTokens":0}}' > "$HIST"
if command -v node >/dev/null 2>&1; then
  HIST_FILE="$HIST" RUN_ID="$SESSION_ID" RUN_TASK="$TASK" RUN_PROFILE="$PROFILE" \
  RUN_ARTIFACTS="$ARTIFACTS" RUN_PASS="$TOTAL_PASS" RUN_FAIL="$TOTAL_FAIL" \
  RUN_COST="$TOTAL_COST" node -e '
    const fs = require("fs"), f = process.env.HIST_FILE;
    let h; try { h = JSON.parse(fs.readFileSync(f, "utf8")); }
    catch { h = { version: 1, runs: [], summary: {} }; }
    h.runs = h.runs || [];
    const fail = parseInt(process.env.RUN_FAIL || "0", 10);
    const cost = parseFloat(process.env.RUN_COST || "0") || 0;
    h.runs.push({
      id: process.env.RUN_ID, task: process.env.RUN_TASK,
      profile: process.env.RUN_PROFILE, artifacts: process.env.RUN_ARTIFACTS,
      validatorsPassed: parseInt(process.env.RUN_PASS || "0", 10),
      validatorsFailed: fail, costUSD: cost,
      status: fail === 0 ? "success" : "completed_with_failures",
      finishedAt: new Date().toISOString(),
    });
    const ok = h.runs.filter(r => r.status === "success").length;
    const total = h.runs.reduce((s, r) => s + (r.costUSD || 0), 0);
    h.summary = { totalRuns: h.runs.length, successCount: ok,
      failedCount: h.runs.length - ok,
      totalCost: +total.toFixed(4), totalTokens: 0 };
    fs.writeFileSync(f, JSON.stringify(h, null, 2) + "\n");
  ' && echo -e "  ${DIM}Run recorded in $HIST${NC}" \
    || echo -e "  ${YELLOW}Could not update $HIST${NC}" >&2
else
  echo "{\"id\":\"$SESSION_ID\",\"task\":\"$TASK\",\"profile\":\"$PROFILE\",\"validatorsFailed\":$TOTAL_FAIL}" >> ".claude/history.jsonl"
  echo -e "  ${DIM}Run recorded in .claude/history.jsonl (node not found)${NC}"
fi
echo ""

# Explicit success exit so the notify_exit EXIT trap reports success, not the
# status of whatever ran last.
exit 0
