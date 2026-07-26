#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_ROOT=$(mktemp -d)
case "$TMP_ROOT" in
  /tmp/*|"${TEMP:-/nonexistent}"/*) ;;
  *) echo "Refusing unexpected temp path: $TMP_ROOT" >&2; exit 1 ;;
esac
trap 'rm -rf -- "$TMP_ROOT"' EXIT

SECRET_MARKER="ghp_1234567890abcdefghijklmnopqrstuvwxyz"
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

: "${M4_SCENARIO:?}"
: "${M4_CALL_LOG:?}"
: "${M4_SECRET_MARKER:?}"
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
phase="unexpected"
verdict=""

case "$prompt" in
  *"Pre-Check Agent"*)
    phase="0"
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | - | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | - | - |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** Milestone 4 fixture.' ;;
  *"Requirements Agent"*)
    phase="1"
    report=$'## Verdict: CLEAR\n\n## Problem\nExercise Milestone 4.\n\n## Success Criteria\n1. Security controls are enforced.\n\n## Scope\nFixture only.\n\n## Constraints\nNo network.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.' ;;
  *"Architect Agent"*)
    phase="2"
    report=$'## Decisions\n\n**Use fixture** - deterministic - Source: tests/milestone-4-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Fixture | Test controls | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| Leakage | Redaction |' ;;
  *"Adversarial Review Agent"*)
    phase="3"
    report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Skeptic | LOW | None | - |\n\n## Consensus\nNone.\n\n## Blocks\nNone.'
    verdict="APPROVED" ;;
  *"Planning Agent"*)
    phase="4"
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | app.js | CREATE | None |\n\n### Step 1: Fixture\n**File:** app.js CREATE\n**Deps:** None\n**Before:** absent\n**After:** fixture\n**Test:** npm test -> pass' ;;
  *"Drift Detection Agent"*)
    phase="5"
    report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Fixture | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%' ;;
  *"Builder Agent"*)
    phase="6"
    printf '%s\n' '// @openapi summary: fixture' \
      'app.get("/fixture", (_req, res) => res.json({ ok: true }));' > app.js
    if [[ "$M4_SCENARIO" == "blocked" ]]; then
      printf 'const credential = "%s";\n' "$M4_SECRET_MARKER" > leak.js
      printf '%s\n' 'SAFE_FIXTURE=1' > .env
    fi
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | app.js | DONE | Fixture |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- app.js' ;;
  *"Denoiser Agent"*)
    phase="7"
    report=$'## Denoise\n\nNo changes required.' ;;
  *"Quality Fit Agent"*)
    phase="8"
    report=$'## Quality Fit\n\nNo changes required.' ;;
  *"Quality Behavior Agent"*)
    phase="9"
    report=$'## Quality Behavior\n\nReal test exit code: 0.' ;;
  *"Quality Docs Agent"*)
    phase="10"
    report=$'## Quality Docs\n\nRoute documentation present.' ;;
  *"Security Agent"*)
    phase="11"
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| none | - | - | - | - |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS'
    verdict="PASS" ;;
  *)
    report=$'## Verdict: APPROVE\n\nUnexpected fixture prompt.'
    verdict="APPROVE" ;;
esac

printf '%s|%s\n' "$phase" "$model" >> "$M4_CALL_LOG"
printf 'provider stderr marker: %s\n' "$M4_SECRET_MARKER" >&2
if [[ -n "$schema_file" ]]; then
  SCHEMA_FILE="$schema_file" REPORT="$report" VERDICT="$verdict" node -e '
    const fs = require("fs");
    const schema = JSON.parse(fs.readFileSync(process.env.SCHEMA_FILE, "utf8"));
    const payload = { artifact: process.env.REPORT, verdict: process.env.VERDICT };
    for (const field of ["scanned_diff_sha", "scanned_tree_sha",
        "reviewed_diff_sha", "reviewed_tree_sha"]) {
      if (schema.properties[field]) payload[field] = schema.properties[field].enum[0];
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(payload));
  ' "$last_file"
else
  printf '%s\n\nProvider marker: %s\n' "$report" "$M4_SECRET_MARKER" > "$last_file"
fi
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":20}}'
MOCK_CODEX

cat > "$MOCK_BIN/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
if [[ "${1:-}" == "test" ]]; then
  printf 'test output marker: %s\n' "${M4_SECRET_MARKER:?}"
  exit 0
fi
echo "unsupported mock npm invocation" >&2
exit 2
MOCK_NPM
chmod +x "$MOCK_BIN/codex" "$MOCK_BIN/npm"

new_repo() {
  local name=$1
  local repo="$TMP_ROOT/repo-$name"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.name "Milestone 4 Smoke"
  git -C "$repo" config user.email "milestone4@example.invalid"
  git -C "$repo" config core.autocrlf false
  printf '%s\n' '{"scripts":{"test":"fixture"}}' > "$repo/package.json"
  printf '%s\n' "seed" > "$repo/README.md"
  git -C "$repo" add package.json README.md
  git -C "$repo" commit -q -m seed
  printf '%s\n' "$repo"
}

run_case() {
  local scenario=$1 rollout=$2 interrupt=$3 expected_rc=$4
  local repo state calls
  repo=$(new_repo "$scenario-$rollout")
  state="$TMP_ROOT/state-$scenario-$rollout"
  calls="$TMP_ROOT/$scenario-$rollout.calls"
  mkdir -p "$state/artifacts/old-terminal" "$state/artifacts/preserve-running"
  printf '%s\n' '{"schemaVersion":"1.0","runId":"old","status":"HALTED","createdAt":"2000-01-01T00:00:00.000Z","updatedAt":"2000-01-01T00:00:00.000Z"}' \
    > "$state/artifacts/old-terminal/run.json"
  printf '%s\n' '{"schemaVersion":"1.0","runId":"running","status":"RUNNING","createdAt":"2000-01-01T00:00:00.000Z","updatedAt":"2000-01-01T00:00:00.000Z"}' \
    > "$state/artifacts/preserve-running/run.json"
  : > "$calls"

  set +e
  (
    cd "$repo"
    PATH="$MOCK_BIN:$PATH" \
      M4_SCENARIO="$scenario" \
      M4_CALL_LOG="$calls" \
      M4_SECRET_MARKER="$SECRET_MARKER" \
      PIPELINE_STATE_DIR="$state" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_TEST_MODE=1 \
      PIPELINE_TEST_INTERRUPT_AFTER_STAGE="$interrupt" \
      bash "$ROOT/run-pipeline.sh" --provider=codex --profile=standard \
        --allow-dirty --no-commit --policy-rollout="$rollout" \
        --retention-days=1 "exercise milestone four controls"
  ) > "$TMP_ROOT/$scenario-$rollout.output" 2>&1
  local rc=$?
  set -e
  if [[ $rc -ne $expected_rc ]]; then
    sed -n '1,320p' "$TMP_ROOT/$scenario-$rollout.output" >&2
    echo "expected rc $expected_rc for $scenario/$rollout, got $rc" >&2
    exit 1
  fi
  [[ ! -e "$state/artifacts/old-terminal" ]]
  [[ -e "$state/artifacts/preserve-running" ]]
  if grep -R -a -F "$SECRET_MARKER" "$state" >/dev/null 2>&1; then
    echo "durable state retained a secret marker for $scenario/$rollout" >&2
    exit 1
  fi
  printf '%s|%s|%s\n' "$repo" "$state" "$calls"
}

IFS='|' read -r shadow_repo shadow_state shadow_calls < <(
  run_case clean shadow phase-11 99
)
shadow_session=$(< "$shadow_state/artifacts/current.txt")
for phase in 7 8 9 10 11; do
  [[ "$(grep -c "^${phase}|" "$shadow_calls" || true)" -eq 1 ]]
done
for phase in 7 8 10; do
  node -e '
    const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    if (d.result !== "CLEAN") process.exit(1);
  ' "$shadow_session/qa-phase-${phase}-pre.json"
done
node -e '
  const fs=require("fs");
  const scan=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if (scan.result !== "CLEAN" || scan.policyVersion !== "1.0") process.exit(1);
  const events=fs.readFileSync(process.argv[2],"utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const security=events.find(e=>e.type==="security_scanner_completed");
  const model=events.findIndex(e=>e.type==="attempt_started" &&
    e.payload.executorKind==="MODEL" && Number(e.payload.phase)===11);
  const scanner=events.findIndex(e=>e.type==="security_scanner_completed");
  if (!security || scanner < 0 || model < 0 || scanner >= model) process.exit(1);
  if (!events.some(e=>e.type==="release_verification_completed")) process.exit(1);
' "$shadow_session/security-scanners.json" "$shadow_session/ledger.jsonl"
[[ -s "$shadow_state/operations.json" ]]

IFS='|' read -r blocked_repo blocked_state blocked_calls < <(
  run_case blocked enforced phase-11 3
)
blocked_session=$(< "$blocked_state/artifacts/current.txt")
[[ "$(grep -c '^11|' "$blocked_calls" || true)" -eq 0 ]]
[[ ! -e "$blocked_session/review.diff" ]]
node -e '
  const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  if (d.result !== "BLOCK") process.exit(1);
  const rules=new Set(d.findings.map(f=>f.rule));
  if (!rules.has("protected-control-or-secret-file") ||
      !rules.has("github-token")) process.exit(1);
  if (JSON.stringify(d).includes(process.argv[2])) process.exit(1);
' "$blocked_session/security-scanners.json" "$SECRET_MARKER"

IFS='|' read -r legacy_repo legacy_state legacy_calls < <(
  run_case clean legacy phase-7 99
)
legacy_session=$(< "$legacy_state/artifacts/current.txt")
[[ "$(grep -c '^7|' "$legacy_calls" || true)" -eq 1 ]]
[[ ! -e "$legacy_session/qa-phase-7-pre.json" ]]
node -e '
  const events=require("fs").readFileSync(process.argv[1],"utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const routes=events.filter(e=>e.type==="routing_decided");
  if (!routes.length || routes.some(e=>e.payload.policyMode!=="fixed")) process.exit(1);
' "$legacy_session/ledger.jsonl"

node "$ROOT/tests/evaluate-release-slos.js" \
  "$ROOT/evals/release-slo-corpus.v1.json" "$TMP_ROOT/release-slo-report.json"
node -e '
  const fs=require("fs");
  const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if (!d.passed || d.liveProviderCanary || d.gaEligible) process.exit(1);
  const frozen=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
  if (JSON.stringify(d) !== JSON.stringify(frozen)) process.exit(1);
' "$TMP_ROOT/release-slo-report.json" "$ROOT/evals/release-slo-report.v1.json"

echo "milestone 4 security hardening and rollout smoke tests passed"
