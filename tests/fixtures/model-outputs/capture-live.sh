#!/bin/bash
# Capture the parser-relevant reports of a REAL pipeline run into this fixture
# corpus, so the engine's parsers are characterized against what models
# actually emit (the point of the corpus), not only against authored shapes.
#
#   bash tests/fixtures/model-outputs/capture-live.sh <run-artifacts-dir> <label>
#
# <run-artifacts-dir> is a run's artifact directory (…/artifacts/<run-id>-<slug>).
# <label> names the capture (e.g. 2026-09-02-version-endpoint); every case it
# creates is called live-<label> under the matching kind.
#
# What it does:
#   1. copies critique.md, build-report.md, qa-report.md.report,
#      code-review.md(.report), review.diff and collapsed-plan.md into the
#      kinds that parse them, replacing the run's diff SHA and tree OID with the
#      corpus constants so attestation cases compare against a known value;
#   2. writes each .expect with source=live, status=expected and the primary
#      key set to "?";
#   3. runs tests/parser-golden.sh on the new cases and records the parser's
#      CURRENT value into each .expect (characterization), then re-runs to
#      confirm the cases are green.
#
# Review the recorded values: if one is wrong (a verdict parsed as MISSING, a
# BLOCKER not counted), flip that case to status=xfail with want_after_fix=.
# lint_plan is not captured: live plans address the run's own tree, and the
# harness lints against tests/fixtures/model-outputs/lint_plan/tree.
set -euo pipefail

ART=${1:?run artifacts dir}
LABEL=${2:?capture label}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
FIX="$ROOT/tests/fixtures/model-outputs"
HARNESS="$ROOT/tests/parser-golden.sh"

GOLDEN_DIFF_SHA=$(grep -m1 -E '^GOLDEN_DIFF_SHA=' "$HARNESS" | cut -d= -f2 | tr -d '"')
GOLDEN_TREE_SHA=$(grep -m1 -E '^GOLDEN_TREE_SHA=' "$HARNESS" | cut -d= -f2 | tr -d '"')
[[ -n "$GOLDEN_DIFF_SHA" && -n "$GOLDEN_TREE_SHA" ]] || { echo "could not read corpus digest constants from $HARNESS" >&2; exit 2; }
[[ -d "$ART" ]] || { echo "not a directory: $ART" >&2; exit 2; }

# The run's own digests: the most frequent 64-hex / 40-hex values in the
# attestation-bearing reports (the run echoes them several times).
run_diff_sha=$(cat "$ART/code-review.md" "$ART/qa-report.md.report" 2>/dev/null | grep -oE '\b[0-9a-f]{64}\b' | sort | uniq -c | sort -rn | awk 'NR==1{print $2}' || true)
run_tree_oid=$(cat "$ART/code-review.md" "$ART/qa-report.md.report" 2>/dev/null | grep -oE '\b[0-9a-f]{40}\b' | sort | uniq -c | sort -rn | awk 'NR==1{print $2}' || true)

sanitize() { # $1 src, $2 dst
  local expr=()
  [[ -n "$run_diff_sha" ]] && expr+=(-e "s/$run_diff_sha/$GOLDEN_DIFF_SHA/g")
  [[ -n "$run_tree_oid" ]] && expr+=(-e "s/$run_tree_oid/$GOLDEN_TREE_SHA/g")
  if [[ ${#expr[@]} -gt 0 ]]; then sed "${expr[@]}" "$1" > "$2"; else cp "$1" "$2"; fi
}

declare -a CASES=()
add_case() { # kind case src key [extra expect lines...]
  local kind=$1 case=$2 src=$3 key=$4; shift 4
  mkdir -p "$FIX/$kind"
  sanitize "$src" "$FIX/$kind/$case.md"
  {
    printf 'status=expected\n'
    for line in "$@"; do printf '%s\n' "$line"; done
    printf '%s=?\n' "$key"
    printf 'note=Captured from a real run (%s). The recorded value is what the parser returned at capture time: review it, and flip to xfail with want_after_fix= if it is wrong.\n' "$LABEL"
    printf 'source=live\n'
  } > "$FIX/$kind/$case.expect"
  CASES+=("$kind/$case")
}

L="live-$LABEL"
if [[ -s "$ART/critique.md" ]]; then
  add_case read_verdict "p3-$L" "$ART/critique.md" verdict 'tokens=APPROVED|REVISE_DESIGN' 'artifact=critique.md'
  add_case count_gating_blockers "p3-$L" "$ART/critique.md" blockers 'artifact=critique.md'
  add_case validate_phase_3 "$L" "$ART/critique.md" gate
fi
if [[ -s "$ART/build-report.md" ]]; then
  add_case read_verdict "p6-$L" "$ART/build-report.md" verdict 'tokens=SUCCESS|PARTIAL|FAILED' 'artifact=build-report.md'
  add_case validate_phase_6 "$L" "$ART/build-report.md" gate
fi
if [[ -s "$ART/qa-report.md.report" ]]; then
  add_case read_verdict "p11-$L" "$ART/qa-report.md.report" verdict 'tokens=PASS|FAIL|CRITICAL' 'artifact=qa-report.md.report'
  add_case read_attestation "p11-$L" "$ART/qa-report.md.report" attestation 'field=scanned_diff_sha' 'artifact=qa-report.md'
  add_case validate_phase_11 "$L" "$ART/qa-report.md.report" gate
fi
if [[ -s "$ART/code-review.md" ]]; then
  report="$ART/code-review.md.report"; [[ -s "$report" ]] || report="$ART/code-review.md"
  add_case read_verdict "p12-$L" "$ART/code-review.md" verdict 'tokens=APPROVE|REQUEST_CHANGES' 'artifact=code-review.md'
  add_case read_attestation "p12-$L" "$report" attestation 'field=reviewed_diff_sha' 'artifact=code-review.md'
  add_case count_gating_blockers "p12-$L" "$ART/code-review.md" blockers 'artifact=code-review.md'
  add_case validate_phase_12 "$L" "$report" gate
  if [[ -s "$ART/review.diff" ]]; then
    sanitize "$ART/review.diff" "$FIX/count_gating_blockers/p12-$L.diff"
    sanitize "$ART/review.diff" "$FIX/validate_phase_12/$L.diff"
  fi
fi
if [[ -s "$ART/collapsed-plan.md" ]]; then
  add_case split_collapsed_plan "$L" "$ART/collapsed-plan.md" split
fi
[[ ${#CASES[@]} -gt 0 ]] || { echo "no parser-relevant reports found in $ART" >&2; exit 2; }

# Record the parser's current value for each new case. A "?" placeholder never
# matches, so the harness reports "got <key>=<value>, recorded <key>=?" per
# case; that value becomes the characterization.
echo "capturing ${#CASES[@]} case(s) as $L"
filled=0
while IFS= read -r line; do
  # fail_case prints: not ok - <kind>/<case> (got <key>=<value>, recorded <key>=?)
  if [[ "$line" =~ ^not\ ok\ -\ ([^\ ]+)\ \(got\ ([a-z_]+)=(.*),\ recorded\ [a-z_]+=\?\)$ ]]; then
    id=${BASH_REMATCH[1]}; key=${BASH_REMATCH[2]}; value=${BASH_REMATCH[3]}
    expect="$FIX/$id.expect"
    [[ -f "$expect" ]] || continue
    python3 - "$expect" "$key" "$value" <<'PY'
import sys
p,k,v=sys.argv[1:4]
lines=open(p).read().split("\n")
lines=[f"{k}={v}" if l==f"{k}=?" else l for l in lines]
open(p,"w").write("\n".join(lines))
PY
    filled=$((filled + 1))
    echo "  $id: $key=$value"
  fi
done < <(bash "$HARNESS" "$L" 2>/dev/null || true)
if [[ $filled -ne ${#CASES[@]} ]]; then
  echo "recorded $filled of ${#CASES[@]} values; the rest still read '?': run 'bash tests/parser-golden.sh -v $L' to see why" >&2
fi
echo "verifying…"
bash "$HARNESS" "$L" | tail -n +1 | grep -E "^(ok|not ok) - " | sed 's/^/  /'
bash "$HARNESS" "$L" >/dev/null && echo "capture $L is green; review the recorded values in $FIX/*/*$L.expect"
