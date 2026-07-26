#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_ROOT=$(mktemp -d)
case "$TMP_ROOT" in
  /tmp/*|"${TEMP:-/nonexistent}"/*) ;;
  *) echo "Refusing unexpected temp path: $TMP_ROOT" >&2; exit 1 ;;
esac
trap 'rm -rf -- "$TMP_ROOT"' EXIT

MOCK_BIN="$TMP_ROOT/bin"
mkdir -p "$MOCK_BIN"

cat > "$MOCK_BIN/codex" <<'MOCK_CODEX'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "exec" && "${2:-}" == "--help" ]]; then
  echo "mock codex exec help --ignore-user-config --ignore-rules"
  exit 0
fi
if [[ "${1:-}" == "features" && "${2:-}" == "list" ]]; then
  printf '%s\n' \
    "plugins stable true" \
    "memories stable true" \
    "tool_search stable true" \
    "apps stable true" \
    "multi_agent stable true"
  exit 0
fi

: "${M3_SCENARIO:?}"
: "${M3_CALL_LOG:?}"
last_file=""
schema_file=""
model=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) model="$2"; shift 2 ;;
    --output-last-message|-o) last_file="$2"; shift 2 ;;
    --output-schema) schema_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
prompt=$(cat)

case "$prompt" in
  *"Pre-Check Agent"*)
    phase="0"
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | - | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | - | - |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No existing match.'
    verdict="" ;;
  *"Requirements Agent"*)
    phase="1"
    report=$'## Verdict: CLEAR\n\n## Problem\nExercise Milestone 3.\n\n## Success Criteria\n1. Deterministic QA is enforced.\n\n## Scope\nFixture only.\n\n## Constraints\nNo network.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.'
    verdict="" ;;
  *"Architect Agent"*)
    phase="2"
    report=$'## Decisions\n\n**Use fixture** - deterministic - Source: tests/milestone-3-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Fixture | Test policy | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| Drift | Frozen corpus |'
    verdict="" ;;
  *"Adversarial Review Agent"*)
    phase="3"
    report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Skeptic | LOW | None | - |\n\n## Consensus\nNone.\n\n## Blocks\nNone.'
    verdict="APPROVED" ;;
  *"Planning Agent"*)
    phase="4"
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | app.js | CREATE | None |\n\n### Step 1: Fixture\n**File:** app.js CREATE\n**Deps:** None\n**Before:** absent\n**After:** fixture\n**Test:** npm test -> pass'
    verdict="" ;;
  *"Drift Detection Agent"*)
    phase="5"
    report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Fixture | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%'
    verdict="" ;;
  *"Builder Agent"*)
    phase="6"
    if [[ "$M3_SCENARIO" == "findings" ]]; then
      printf 'console.log("debug");\napp.get("/secure", (_req, res) => res.json({ ok: true }));   \n' > app.js
    fi
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | app.js | DONE | Fixture |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- app.js'
    verdict="" ;;
  *"Denoiser Agent"*)
    phase="7"
    sed -i '/console\.log/d' app.js
    report=$'## Denoise\n\nRemoved deterministic debug finding.'
    verdict="" ;;
  *"Quality Fit Agent"*)
    phase="8"
    sed -i 's/[[:space:]]*$//' app.js
    report=$'## Quality Fit\n\nFixed deterministic diff-check finding.'
    verdict="" ;;
  *"Quality Docs Agent"*)
    phase="10"
    sed -i '1i// @openapi summary: secure fixture' app.js
    report=$'## Quality Docs\n\nAdded deterministic route documentation.'
    verdict="" ;;
  *)
    phase="unexpected"
    report=$'## Verdict: APPROVE\n\nUnexpected prompt.'
    verdict="APPROVE" ;;
esac

printf '%s|%s\n' "$phase" "$model" >> "$M3_CALL_LOG"
if [[ -n "$schema_file" ]]; then
  REPORT="$report" VERDICT="$verdict" node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      artifact: process.env.REPORT,
      verdict: process.env.VERDICT
    }));
  ' "$last_file"
else
  printf '%s\n' "$report" > "$last_file"
fi
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":20}}'
MOCK_CODEX

cat > "$MOCK_BIN/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
if [[ "${1:-}" == "test" ]]; then
  echo "milestone 3 mock test passed"
  exit 0
fi
echo "unsupported mock npm invocation" >&2
exit 2
MOCK_NPM

chmod +x "$MOCK_BIN/codex" "$MOCK_BIN/npm"

run_case() {
  local scenario=$1 task=$2
  local repo="$TMP_ROOT/repo-$scenario"
  local state="$TMP_ROOT/state-$scenario"
  local calls="$TMP_ROOT/$scenario.calls"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.name "Milestone 3 Smoke"
  git -C "$repo" config user.email "milestone3@example.invalid"
  git -C "$repo" config core.autocrlf false
  printf '%s\n' '{"scripts":{"test":"fixture"}}' > "$repo/package.json"
  printf '%s\n' "seed" > "$repo/README.md"
  git -C "$repo" add package.json README.md
  git -C "$repo" commit -q -m seed
  : > "$calls"

  set +e
  (
    cd "$repo"
    PATH="$MOCK_BIN:$PATH" \
      M3_SCENARIO="$scenario" \
      M3_CALL_LOG="$calls" \
      PIPELINE_STATE_DIR="$state" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_TEST_MODE=1 \
      PIPELINE_TEST_INTERRUPT_AFTER_STAGE=phase-10 \
      bash "$ROOT/run-pipeline.sh" \
        --provider=codex --profile=standard --allow-dirty --no-commit "$task"
  ) > "$TMP_ROOT/$scenario.output" 2>&1
  local rc=$?
  set -e
  if [[ $rc -ne 99 ]]; then
    sed -n '1,260p' "$TMP_ROOT/$scenario.output" >&2
    echo "expected controlled phase-10 interruption for $scenario, got $rc" >&2
    exit 1
  fi
}

run_case clean "add a routine health endpoint with tests"
clean_calls="$TMP_ROOT/clean.calls"
for phase in 7 8 10; do
  [[ "$(grep -c "^${phase}|" "$clean_calls" || true)" -eq 0 ]]
done
clean_session=$(< "$TMP_ROOT/state-clean/artifacts/current.txt")
for phase in 7 8 10; do
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.result !== "CLEAN" || value.policyVersion !== "1.0") process.exit(1);
  ' "$clean_session/qa-phase-${phase}-pre.json"
done
node -e '
  const fs = require("fs");
  const events = fs.readFileSync(process.argv[1], "utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const skips = events.filter(event =>
    event.type === "routing_decided" &&
    event.payload.action === "SKIP_MODEL" &&
    [7, 8, 10].includes(Number(event.payload.phase)));
  if (skips.length !== 3) process.exit(1);
' "$clean_session/ledger.jsonl"

run_case findings "add JWT authentication and payment authorization"
findings_calls="$TMP_ROOT/findings.calls"
for phase in 7 8 10; do
  [[ "$(grep -c "^${phase}|gpt-5.6-terra$" "$findings_calls" || true)" -eq 1 ]]
done
findings_session=$(< "$TMP_ROOT/state-findings/artifacts/current.txt")
for phase in 7 8 10; do
  node -e '
    const fs = require("fs");
    const pre = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const post = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    if (pre.result !== "FINDINGS" || post.result !== "CLEAN") process.exit(1);
  ' "$findings_session/qa-phase-${phase}-pre.json" \
     "$findings_session/qa-phase-${phase}-post.json"
done
for phase in 1 4 6; do
  [[ "$(grep -c "^${phase}|gpt-5.6-sol$" "$findings_calls" || true)" -eq 1 ]]
done
node -e '
  const fs = require("fs");
  const events = fs.readFileSync(process.argv[1], "utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  for (const phase of [1, 4, 6]) {
    const route = events.find(event =>
      event.type === "routing_decided" &&
      Number(event.payload.phase) === phase &&
      event.payload.purpose === "PRIMARY");
    if (!route || route.payload.policyVersion !== "1.0" ||
        route.payload.action !== "ESCALATE" ||
        route.payload.selected.model !== "gpt-5.6-sol") process.exit(1);
    const attempt = events.find(event =>
      event.type === "attempt_started" &&
      Number(event.payload.phase) === phase &&
      event.sequence > route.sequence);
    if (!attempt) process.exit(1);
  }
' "$findings_session/ledger.jsonl"

node "$ROOT/tests/evaluate-routing-policy.js" \
  "$ROOT/evals/routing-corpus.v1.json" "$TMP_ROOT/routing-report.json"
node -e '
  const fs = require("fs");
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const frozen = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (!report.passed ||
      report.metrics.classificationPrecision < 1 ||
      report.metrics.classificationRecall < 1 ||
      report.metrics.cleanQaCallReduction < 0.75 ||
      report.metrics.requiredCheckPassRate.delta < 0 ||
      frozen.corpusSha256 !== report.corpusSha256 ||
      frozen.policyVersion !== report.policyVersion ||
      frozen.passed !== report.passed ||
      JSON.stringify(frozen.metrics) !== JSON.stringify(report.metrics) ||
      JSON.stringify(frozen.thresholds) !== JSON.stringify(report.thresholds)) process.exit(1);
' "$TMP_ROOT/routing-report.json" "$ROOT/evals/routing-eval-report.v1.json"

echo "milestone 3 deterministic QA and routing smoke tests passed"
