#!/usr/bin/env bash
# parser-golden.sh — characterization suite for the markdown parsers inside
# run-pipeline.sh.
#
# WHY THIS EXISTS: the engine turns model-written markdown into gate decisions
# (verdict tokens, BLOCKER rows, attestation digests, plan anchors, collapsed
# plan markers). Those parsers were tuned by hand against whatever the last
# run happened to emit and never had a corpus. This suite extracts the real
# parser functions from run-pipeline.sh (no copy, no reimplementation) and
# runs them against tests/fixtures/model-outputs/**, a corpus of report shapes
# real models produce. Every case records CURRENT behavior:
#
#   status=expected  the current result is the right one; must keep holding
#   status=xfail     the current result is a known parser gap; the case records
#                    what the parser does today (so the suite stays green) AND
#                    what it should do after the fix (want_after_fix=...)
#
# The suite is GREEN when every case matches its recorded current value. An
# xfail whose actual result now equals want_after_fix is reported as XPASS and
# fails the run — flip its status to expected and update the recorded value.
#
# Usage:
#   bash tests/parser-golden.sh              # run everything
#   bash tests/parser-golden.sh -v           # also print each case's raw result / log
#   bash tests/parser-golden.sh read_verdict # only cases whose id matches a substring
#
# Output: one `ok - <kind>/<case>` line per case (xfails add
# `(xfail: current=<v> want=<w>)`), then `parser-golden: N cases, M xfail`.
# Exit 0 when every case matches its recorded status, 1 otherwise, 2 when the
# parsers could not be extracted from the engine.
#
# Fixture layout and the .expect keys are documented in
# tests/fixtures/model-outputs/README.md.
set -uo pipefail   # deliberately NOT -e: the extracted validators use ((n++)).

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENGINE="$ROOT/run-pipeline.sh"
FIXTURES="$ROOT/tests/fixtures/model-outputs"

VERBOSE=0
FILTER=""
for arg in "$@"; do
  case "$arg" in
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) grep '^#' "$0" | sed -n '2,32p' | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 2 ;;
    *) FILTER="$arg" ;;
  esac
done

[[ -f "$ENGINE" ]] || { echo "engine not found: $ENGINE" >&2; exit 2; }
[[ -d "$FIXTURES" ]] || { echo "fixture corpus not found: $FIXTURES" >&2; exit 2; }

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/parser-golden.XXXXXX")
case "$TMP_ROOT" in
  /tmp/*|"${TMPDIR:-/nonexistent}"/*) ;;
  *) echo "Refusing unexpected temp path: $TMP_ROOT" >&2; exit 2 ;;
esac
trap 'rm -rf -- "$TMP_ROOT"' EXIT

# The orchestrator-computed digests every attestation fixture echoes. They are
# constants of the corpus (see the README); the harness binds the engine's
# SECURITY_*/REVIEWED_* globals to them before each validate_phase_* case.
GOLDEN_DIFF_SHA="9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f"
GOLDEN_TREE_SHA="4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e"

# ---------------------------------------------------------------------------
# 1. Extract the parsers verbatim from the engine.
#    Each function is cut from its `name() {` line to the first `^}` line, in
#    the engine's own order, and syntax-checked before being sourced.
# ---------------------------------------------------------------------------
EXTRACTED=(
  read_verdict read_attestation
  critique_has_blockers count_gating_blockers
  split_collapsed_plan lint_plan
  validate_phase_3 validate_phase_6 validate_phase_11 validate_phase_12
)
PARSERS="$TMP_ROOT/parsers.sh"
EXTRACT_MAP=""
{
  echo "# Extracted from run-pipeline.sh by tests/parser-golden.sh — never edit."
  for fn in "${EXTRACTED[@]}"; do
    start=$(grep -n "^${fn}() {\$" "$ENGINE" | head -1 | cut -d: -f1)
    if [[ -z "$start" ]]; then
      echo "parser-golden: cannot find '${fn}() {' in run-pipeline.sh" >&2
      exit 2
    fi
    body=$(sed -n "${start},\$p" "$ENGINE" | sed -n '1,/^}$/p')
    if [[ "${body##*$'\n'}" != "}" ]]; then
      echo "parser-golden: extraction of ${fn} did not end at a closing brace" >&2
      exit 2
    fi
    printf '# %s (run-pipeline.sh:%s)\n%s\n\n' "$fn" "$start" "$body"
    EXTRACT_MAP+="${EXTRACT_MAP:+ }${fn}@${start}"
  done
} > "$PARSERS" || exit 2
if ! bash -n "$PARSERS"; then
  echo "parser-golden: extracted parsers do not parse as bash" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# 2. Stub the globals the parsers read, then source them.
# ---------------------------------------------------------------------------
RED="" GREEN="" YELLOW="" CYAN="" BOLD="" DIM="" NC=""
TOTAL_PASS=0 TOTAL_FAIL=0
PROVIDER="claude"          # the anchored-markdown path; codex reads typed sidecars
PROFILE="golden"
ARTIFACTS=""
GATE_HARD=0 GATE_SOFT=0
PLAN_LINT_ERRORS=""
SECURITY_DIFF_SHA="" SECURITY_TREE_SHA="" REVIEWED_DIFF_SHA="" REVIEWED_TREE_SHA=""
declare -a GOLDEN_LOG=()
# The engine's log_pass/log_fail print to stderr; here they only record what
# the validator decided so a case can assert on it (log_match=...).
log_pass() { GOLDEN_LOG+=("pass:$1"); }
log_fail() { GOLDEN_LOG+=("$1:$2"); }
# shellcheck disable=SC1090
source "$PARSERS"
for fn in "${EXTRACTED[@]}"; do
  if ! declare -F "$fn" >/dev/null; then
    echo "parser-golden: ${fn} was not defined after sourcing" >&2
    exit 2
  fi
done
echo "# parsers extracted from run-pipeline.sh: $EXTRACT_MAP"

# ---------------------------------------------------------------------------
# 3. Case runner.
# ---------------------------------------------------------------------------
declare -A E=()
read_expect() {
  E=()
  local line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key=${line%%=*}
    E[$key]=${line#*=}
  done < "$1"
}

log_joined() { printf '%s\n' "${GOLDEN_LOG[@]:-}"; }

CASES=0 XFAIL=0 FAILED=0
declare -a FAILURES=()

fail_case() {   # id, message
  echo "not ok - $1 ($2)"
  FAILURES+=("$1: $2")
  FAILED=$((FAILED + 1))
}

run_case() {
  local kind=$1 md=$2
  local base=${md%.md} name
  name=$(basename "$base")
  local id="$kind/$name"
  read_expect "$base.expect"

  ARTIFACTS="$TMP_ROOT/cases/$kind/$name"
  mkdir -p "$ARTIFACTS"
  GOLDEN_LOG=(); GATE_HARD=0; GATE_SOFT=0; PLAN_LINT_ERRORS=""
  SECURITY_DIFF_SHA=$GOLDEN_DIFF_SHA; REVIEWED_DIFF_SHA=$GOLDEN_DIFF_SHA
  SECURITY_TREE_SHA=$GOLDEN_TREE_SHA; REVIEWED_TREE_SHA=$GOLDEN_TREE_SHA
  if [[ "${E[tree]:-}" == "unavailable" ]]; then
    SECURITY_TREE_SHA=""; REVIEWED_TREE_SHA=""
  fi

  local key actual art rc extra_fail=""
  case "$kind" in
    read_verdict)
      key=verdict
      art="$ARTIFACTS/${E[artifact]:-report.md}"
      cp "$md" "$art"
      [[ -f "$base.verdict" ]] && cp "$base.verdict" "$art.verdict"
      actual=$(read_verdict "$art" "${E[tokens]:?tokens= missing in $base.expect}")
      actual=${actual:-MISSING}
      ;;
    read_attestation)
      key=attestation
      art="$ARTIFACTS/${E[artifact]:-code-review.md}"
      cp "$md" "$art.report"
      actual=$(read_attestation "$art" "${E[field]:-reviewed_diff_sha}") || actual=""
      actual=${actual:-MISSING}
      ;;
    count_gating_blockers)
      key=blockers
      art="$ARTIFACTS/${E[artifact]:-critique.md}"
      cp "$md" "$art"
      [[ -f "$base.diff" ]] && cp "$base.diff" "$ARTIFACTS/review.diff"
      [[ -f "$base.refuted" ]] && cp "$base.refuted" "$art.refuted"
      actual=$(count_gating_blockers "$art")
      ;;
    lint_plan)
      key=lint_errors
      # MODIFY paths and anchors resolve against the cwd, exactly as in the
      # engine (which runs inside the run worktree). The corpus ships a tiny
      # tree for that purpose.
      pushd "$FIXTURES/lint_plan/tree" >/dev/null || return
      lint_plan "$md"; rc=$?
      popd >/dev/null || return
      actual=$(printf '%s' "$PLAN_LINT_ERRORS" | grep -c .)
      if [[ $rc -eq 0 && "$actual" != "0" ]] || [[ $rc -ne 0 && "$actual" == "0" ]]; then
        extra_fail="lint_plan exit $rc disagrees with $actual recorded error(s)"
      fi
      if [[ -n "${E[lint_match]:-}" && "$PLAN_LINT_ERRORS" != *"${E[lint_match]}"* ]]; then
        extra_fail="lint_match '${E[lint_match]}' not found in: $(printf '%s' "$PLAN_LINT_ERRORS" | tr '\n' ' ')"
      fi
      ;;
    split_collapsed_plan)
      key=split
      split_collapsed_plan "$md"; rc=$?
      local sections="" s
      for s in brief design plan; do
        [[ -s "$ARTIFACTS/$s.md" ]] && sections+="${sections:+,}$s"
      done
      actual="$([[ $rc -eq 0 ]] && echo ok || echo fail):${sections:-none}"
      ;;
    validate_phase_3)
      key=gate
      cp "$md" "$ARTIFACTS/critique.md"
      [[ -f "$base.refuted" ]] && cp "$base.refuted" "$ARTIFACTS/critique.md.refuted"
      validate_phase_3
      actual="hard=$GATE_HARD soft=$GATE_SOFT"
      ;;
    validate_phase_6)
      key=gate
      cp "$md" "$ARTIFACTS/build-report.md"
      validate_phase_6
      actual="hard=$GATE_HARD soft=$GATE_SOFT"
      ;;
    validate_phase_11)
      key=gate
      # Claude phases append to qa-report.md; the validator reads the isolated
      # per-call report at qa-report.md.report (run-pipeline.sh:6330).
      cp "$md" "$ARTIFACTS/qa-report.md"
      cp "$md" "$ARTIFACTS/qa-report.md.report"
      validate_phase_11
      actual="hard=$GATE_HARD soft=$GATE_SOFT"
      ;;
    validate_phase_12)
      key=gate
      # The verdict is read from code-review.md itself, but read_attestation
      # (Claude path) reads the per-call code-review.md.report that run_model
      # writes alongside it — stage both, as a real run has both.
      cp "$md" "$ARTIFACTS/code-review.md"
      cp "$md" "$ARTIFACTS/code-review.md.report"
      [[ -f "$base.diff" ]] && cp "$base.diff" "$ARTIFACTS/review.diff"
      [[ -f "$base.refuted" ]] && cp "$base.refuted" "$ARTIFACTS/code-review.md.refuted"
      validate_phase_12
      actual="hard=$GATE_HARD soft=$GATE_SOFT"
      ;;
    *)
      fail_case "$id" "unknown fixture kind '$kind'"
      return
      ;;
  esac

  if [[ -n "${E[log_match]:-}" ]] && [[ "$(log_joined)" != *"${E[log_match]}"* ]]; then
    extra_fail="log_match '${E[log_match]}' not found in: $(log_joined | tr '\n' ';')"
  fi

  CASES=$((CASES + 1))
  local status=${E[status]:-expected} recorded=${E[$key]:-} want=${E[want_after_fix]:-}
  if [[ -z "$recorded" ]]; then
    fail_case "$id" "malformed expect: no ${key}= line"
    return
  fi
  if [[ "$status" == "xfail" && ( -z "$want" || "$want" == "$recorded" ) ]]; then
    fail_case "$id" "malformed expect: xfail needs want_after_fix= different from ${key}="
    return
  fi
  if [[ "$status" == "expected" && -n "$want" ]]; then
    fail_case "$id" "malformed expect: want_after_fix= only belongs on xfail cases"
    return
  fi
  if [[ "$status" != "expected" && "$status" != "xfail" ]]; then
    fail_case "$id" "malformed expect: status must be expected|xfail"
    return
  fi

  if [[ -n "$extra_fail" ]]; then
    fail_case "$id" "$extra_fail"
  elif [[ "$actual" == "$recorded" ]]; then
    if [[ "$status" == "xfail" ]]; then
      echo "ok - $id (xfail: current=$actual want=$want)"
      XFAIL=$((XFAIL + 1))
    else
      echo "ok - $id"
    fi
  elif [[ "$status" == "xfail" && "$actual" == "$want" ]]; then
    fail_case "$id" "XPASS: now ${key}=$actual which is want_after_fix — flip status=expected and set ${key}=$actual"
  else
    fail_case "$id" "got ${key}=$actual, recorded ${key}=$recorded"
  fi

  if [[ $VERBOSE -eq 1 ]]; then
    echo "    ${key}=$actual"
    [[ "$kind" == lint_plan && -n "$PLAN_LINT_ERRORS" ]] && printf '%s' "$PLAN_LINT_ERRORS" | sed 's/^/    lint: /'
    [[ ${#GOLDEN_LOG[@]} -gt 0 ]] && printf '    log: %s\n' "${GOLDEN_LOG[@]}"
  fi
}

# ---------------------------------------------------------------------------
# 4. Discover cases: every <kind>/<case>.expect with a sibling <case>.md.
# ---------------------------------------------------------------------------
shopt -s nullglob
for kind_dir in "$FIXTURES"/*/; do
  kind=$(basename "$kind_dir")
  for expect in "$kind_dir"*.expect; do
    md="${expect%.expect}.md"
    id="$kind/$(basename "${expect%.expect}")"
    [[ -n "$FILTER" && "$id" != *"$FILTER"* ]] && continue
    if [[ ! -f "$md" ]]; then
      CASES=$((CASES + 1))
      fail_case "$id" "expect file without a sibling .md fixture"
      continue
    fi
    run_case "$kind" "$md"
  done
done
shopt -u nullglob

echo "parser-golden: $CASES cases, $XFAIL xfail"
if [[ $FAILED -gt 0 ]]; then
  echo "parser-golden: $FAILED FAILED" >&2
  printf '  - %s\n' "${FAILURES[@]}" >&2
  exit 1
fi
if [[ $CASES -eq 0 ]]; then
  echo "parser-golden: no cases matched" >&2
  exit 1
fi
exit 0
