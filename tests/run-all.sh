#!/usr/bin/env bash
# Full test battery — one entry point for every suite.
#
# WHY THIS EXISTS: suites used to be run by hand, one at a time, and a suite
# (milestone-4) once went red for two milestones because it was quietly
# dropped from the manual battery. This runner AUTO-DISCOVERS every
# tests/*.sh suite, so a new or forgotten suite can never be silently
# skipped, and it verifies each suite's REAL exit code — never a wrapper's.
#
# Usage:
#   bash tests/run-all.sh                 # run everything, sequentially
#   bash tests/run-all.sh -p              # run everything in parallel (faster)
#   bash tests/run-all.sh m2 kill-matrix  # run only suites whose name matches
#
# Exit code: 0 if every suite passed, 1 otherwise. Per-suite logs are written
# under a temp dir whose path is printed at the end (and on any failure).
set -uo pipefail   # deliberately NOT -e: run ALL suites, then report.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

PARALLEL=0
declare -a FILTERS=()
for arg in "$@"; do
  case "$arg" in
    -p|--parallel) PARALLEL=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 2 ;;
    *)  FILTERS+=("$arg") ;;
  esac
done

if command -v tput >/dev/null 2>&1 && [[ -t 1 ]]; then
  GREEN=$(tput setaf 2); RED=$(tput setaf 1); YEL=$(tput setaf 3)
  DIM=$(tput dim); BOLD=$(tput bold); NC=$(tput sgr0)
else
  GREEN=""; RED=""; YEL=""; DIM=""; BOLD=""; NC=""
fi

LOGDIR=$(mktemp -d "${TMPDIR:-/tmp}/pipeline-test-run.XXXXXX")

# --- Build the suite list -------------------------------------------------
# Shell suites: EVERY tests/*.sh except this runner. Auto-discovery is the
# whole point — adding tests/foo-smoke.sh makes it run here automatically.
declare -a SUITE_NAMES=()
declare -a SUITE_CMDS=()

add_suite() { SUITE_NAMES+=("$1"); SUITE_CMDS+=("$2"); }

shopt -s nullglob
for f in "$ROOT"/tests/*.sh; do
  base=$(basename "$f")
  [[ "$base" == "run-all.sh" ]] && continue
  add_suite "${base%.sh}" "bash \"$f\""
done
shopt -u nullglob

# Node evaluators need a corpus + a throwaway output path. Mapped explicitly
# (their corpus names are not mechanical), but every tests/evaluate-*.js MUST
# be covered — an unmapped one is a hard error below, so evaluators can't be
# dropped the way milestone-4 was.
eval_corpus() {
  case "$1" in
    evaluate-routing-policy.js) echo "evals/routing-corpus.v1.json" ;;
    evaluate-release-slos.js)   echo "evals/release-slo-corpus.v1.json" ;;
    *) echo "" ;;
  esac
}
shopt -s nullglob
for f in "$ROOT"/tests/evaluate-*.js; do
  base=$(basename "$f")
  corpus=$(eval_corpus "$base")
  if [[ -z "$corpus" ]]; then
    echo "${RED}FATAL: evaluator $base has no corpus mapping in run-all.sh — add one so it is not silently skipped.${NC}" >&2
    exit 2
  fi
  add_suite "${base%.js}" "node \"$f\" \"$ROOT/$corpus\" \"$LOGDIR/${base%.js}.report.json\""
done
shopt -u nullglob

# Apply name filters, if any.
if [[ ${#FILTERS[@]} -gt 0 ]]; then
  declare -a FN=() FC=()
  for i in "${!SUITE_NAMES[@]}"; do
    for want in "${FILTERS[@]}"; do
      if [[ "${SUITE_NAMES[$i]}" == *"$want"* ]]; then
        FN+=("${SUITE_NAMES[$i]}"); FC+=("${SUITE_CMDS[$i]}"); break
      fi
    done
  done
  SUITE_NAMES=("${FN[@]}"); SUITE_CMDS=("${FC[@]}")
fi

if [[ ${#SUITE_NAMES[@]} -eq 0 ]]; then
  echo "${RED}No suites matched.${NC}" >&2; exit 2
fi

echo "${BOLD}Pipeline full test battery${NC} — ${#SUITE_NAMES[@]} suites, logs in $LOGDIR"
[[ "$PARALLEL" == "1" ]] && echo "${DIM}(parallel mode)${NC}"
echo

run_one() {
  local name=$1 cmd=$2
  local start end
  start=$(date +%s 2>/dev/null || echo 0)
  eval "$cmd" > "$LOGDIR/$name.log" 2>&1
  local rc=$?
  end=$(date +%s 2>/dev/null || echo 0)
  printf '%s\n' "$rc" > "$LOGDIR/$name.rc"
  printf '%s\n' "$((end - start))" > "$LOGDIR/$name.dur"
  return $rc
}

# --- Execute --------------------------------------------------------------
if [[ "$PARALLEL" == "1" ]]; then
  for i in "${!SUITE_NAMES[@]}"; do
    run_one "${SUITE_NAMES[$i]}" "${SUITE_CMDS[$i]}" &
  done
  wait
else
  for i in "${!SUITE_NAMES[@]}"; do
    printf '  %-26s %s' "${SUITE_NAMES[$i]}" "${DIM}running...${NC}"
    run_one "${SUITE_NAMES[$i]}" "${SUITE_CMDS[$i]}"
    rc=$(cat "$LOGDIR/${SUITE_NAMES[$i]}.rc")
    dur=$(cat "$LOGDIR/${SUITE_NAMES[$i]}.dur")
    if [[ "$rc" -eq 0 ]]; then
      printf '\r  %-26s %s (%ss)\n' "${SUITE_NAMES[$i]}" "${GREEN}PASS${NC}" "$dur"
    else
      printf '\r  %-26s %s (%ss, rc=%s)\n' "${SUITE_NAMES[$i]}" "${RED}FAIL${NC}" "$dur" "$rc"
    fi
  done
fi

# --- Report ---------------------------------------------------------------
echo
echo "${BOLD}Results${NC}"
failures=0
for i in "${!SUITE_NAMES[@]}"; do
  name="${SUITE_NAMES[$i]}"
  rc=$(cat "$LOGDIR/$name.rc" 2>/dev/null || echo 1)
  dur=$(cat "$LOGDIR/$name.dur" 2>/dev/null || echo 0)
  # Show the suite's OWN last non-empty output line — the real signal.
  last=$(grep -v '^[[:space:]]*$' "$LOGDIR/$name.log" 2>/dev/null | tail -1)
  if [[ "$rc" -eq 0 ]]; then
    printf '  %s %-26s %s\n' "${GREEN}✓${NC}" "$name" "${DIM}${last}${NC}"
  else
    failures=$((failures + 1))
    printf '  %s %-26s %s\n' "${RED}✗${NC}" "$name" "${RED}rc=$rc${NC} ${DIM}(${last})${NC}"
  fi
done

echo
if [[ "$failures" -eq 0 ]]; then
  echo "${GREEN}${BOLD}All ${#SUITE_NAMES[@]} suites passed.${NC}"
  rm -rf "$LOGDIR"
  exit 0
else
  echo "${RED}${BOLD}${failures}/${#SUITE_NAMES[@]} suites FAILED.${NC} Logs: $LOGDIR"
  for i in "${!SUITE_NAMES[@]}"; do
    name="${SUITE_NAMES[$i]}"
    rc=$(cat "$LOGDIR/$name.rc" 2>/dev/null || echo 1)
    [[ "$rc" -ne 0 ]] && echo "    ${RED}$name${NC} → $LOGDIR/$name.log"
  done
  exit 1
fi
