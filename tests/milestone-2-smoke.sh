#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENGINE="$ROOT/run-pipeline.sh"
TMP_ROOT=$(mktemp -d)
case "$TMP_ROOT" in
  /tmp/*|"${TEMP:-/nonexistent}"/*) ;;
  *) echo "Refusing unexpected temp path: $TMP_ROOT" >&2; exit 1 ;;
esac
cleanup() {
  local rc=$?
  if [[ "${KEEP_M2_TMP:-0}" == "1" || $rc -ne 0 ]]; then
    echo "milestone-2 temp retained: $TMP_ROOT" >&2
  else
    rm -rf -- "$TMP_ROOT"
  fi
}
trap cleanup EXIT

MOCK_BIN="$TMP_ROOT/bin"
MOCK_CALL_LOG="$TMP_ROOT/provider-calls.log"
mkdir -p "$MOCK_BIN"
: > "$MOCK_CALL_LOG"

cat > "$MOCK_BIN/codex" <<'MOCK_CODEX'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "exec" && "${2:-}" == "--help" ]]; then
  echo "mock codex exec help --ignore-user-config --ignore-rules"
  exit 0
fi
if [[ "${1:-}" == "features" && "${2:-}" == "list" ]]; then
  printf '%s\n' \
    "plugins stable true" "memories stable true" "memory_tool stable true" \
    "tool_search stable true" "multi_agent stable true" "codex_git_commit stable true"
  exit 0
fi

last_file=""
schema_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message|-o) last_file="$2"; shift 2 ;;
    --output-schema) schema_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
prompt=$(cat)
case "$prompt" in
  *"Unified Plan Agent"*)
    kind="collapsed-plan"
    report=$'===BRIEF===\n## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.\n===DESIGN===\n## Decisions\n\n**Use mock** — deterministic — Source: tests/mock:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |\n===PLAN===\n## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md [MODIFY]\n**Deps:** None\n**Anchor:** \x60seed\x60\n**Intent:** keep the seed line as-is\n**Test:** run -> pass'
    verdict="" ;;
  *"Pre-Check Agent"*)
    kind="phase-0"
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | - | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | - | - |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.'
    verdict="" ;;
  *"Requirements Agent"*)
    kind="phase-1"
    report=$'## Verdict: CLEAR\n\n## Problem\nResume test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.'
    verdict="" ;;
  *"Architect Agent"*)
    kind="phase-2"
    report=$'## Decisions\n\n**Mock** - deterministic - Source: tests/milestone-2-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | - |'
    verdict="" ;;
  *"Planning Agent"*)
    kind="phase-4"
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Mock\n**File:** README.md MODIFY\n**Deps:** None\n**Before:** seed\n**After:** seed\n**Test:** test -> pass'
    verdict="" ;;
  *"Builder Agent"*)
    kind="phase-6"
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | README.md | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- None'
    verdict="" ;;
  *"Security Agent"*)
    kind="phase-11"
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | - | - | NONE | - |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS'
    verdict="PASS" ;;
  *"Commit Code-Review Agent"*)
    kind="phase-12"
    report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | - | None | - |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE'
    verdict="APPROVE" ;;
  *)
    kind="other"
    report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.'
    verdict="APPROVE" ;;
esac
printf '%s\n' "$kind" >> "$MOCK_CALL_LOG"

if [[ -n "$schema_file" ]]; then
  REPORT="$report" VERDICT="$verdict" node -e '
    const fs = require("fs");
    const schema = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const properties = schema.properties || {};
    const payload = { artifact: process.env.REPORT, verdict: process.env.VERDICT };
    for (const field of [
      "scanned_diff_sha", "scanned_tree_sha",
      "reviewed_diff_sha", "reviewed_tree_sha"
    ]) {
      if (properties[field] && Array.isArray(properties[field].enum))
        payload[field] = properties[field].enum[0];
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(payload));
  ' "$last_file" "$schema_file"
else
  printf '%s\n' "$report" > "$last_file"
fi
printf '%s\n' \
  '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":400,"output_tokens":200}}'
MOCK_CODEX
chmod +x "$MOCK_BIN/codex"

REPO="$TMP_ROOT/repo"
STATE="$TMP_ROOT/state"
TASK="milestone two resume smoke"
mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.name "Pipeline Smoke"
git -C "$REPO" config user.email "pipeline-smoke@example.invalid"
printf '%s\n' "seed" > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -q -m "seed"

run_pipeline() {
  local engine=$1
  shift
  (
    cd "$REPO"
    PATH="$MOCK_BIN:$PATH" \
      MOCK_CALL_LOG="$MOCK_CALL_LOG" \
      PIPELINE_STATE_DIR="$STATE" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_TEST_MODE="${PIPELINE_TEST_MODE:-0}" \
      PIPELINE_TEST_INTERRUPT_AFTER_STAGE="${PIPELINE_TEST_INTERRUPT_AFTER_STAGE:-}" \
      bash "$engine" --provider=codex --profile=yolo --no-commit "$@" "$TASK"
  )
}

set +e
PIPELINE_TEST_MODE=1 PIPELINE_TEST_INTERRUPT_AFTER_STAGE=phase-1 \
  run_pipeline "$ENGINE" >"$TMP_ROOT/interrupted.log" 2>&1
interrupt_rc=$?
set -e
[[ $interrupt_rc -eq 99 ]] || {
  sed -n '1,240p' "$TMP_ROOT/interrupted.log" >&2
  echo "Expected checkpoint interruption exit 99, got $interrupt_rc" >&2
  exit 1
}

SESSION_DIR=$(tr -d '\r\n' < "$STATE/artifacts/current.txt")
RUN_ID=$(node -e '
  const fs = require("fs");
  for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "run_started") {
      process.stdout.write(event.runId);
      process.exit(0);
    }
  }
  process.exit(1);
' "$SESSION_DIR/ledger.jsonl")
[[ -n "$RUN_ID" ]]
[[ "$(grep -c '^phase-0$' "$MOCK_CALL_LOG")" -eq 1 ]]
[[ "$(grep -c '^phase-1$' "$MOCK_CALL_LOG")" -eq 1 ]]

expect_resume_failure() {
  local label=$1 expected=$2 engine=${3:-$ENGINE}
  shift 3 || true
  set +e
  run_pipeline "$engine" --resume="$RUN_ID" "$@" >"$TMP_ROOT/$label.log" 2>&1
  local rc=$?
  set -e
  [[ $rc -ne 0 ]] || {
    echo "$label unexpectedly resumed" >&2
    exit 1
  }
  grep -qi "$expected" "$TMP_ROOT/$label.log" || {
    sed -n '1,180p' "$TMP_ROOT/$label.log" >&2
    echo "$label did not report expected invariant: $expected" >&2
    exit 1
  }
}

# Task and configuration mismatches are rejected without touching the ledger.
set +e
(
  cd "$REPO"
  PATH="$MOCK_BIN:$PATH" PIPELINE_STATE_DIR="$STATE" PIPELINE_NO_NOTIFY=1 \
    PIPELINE_NONINTERACTIVE=1 bash "$ENGINE" --provider=codex --profile=yolo \
    --no-commit --resume="$RUN_ID" "different task"
) >"$TMP_ROOT/task-mismatch.log" 2>&1
task_rc=$?
set -e
[[ $task_rc -ne 0 ]]
grep -qi "task hash mismatch" "$TMP_ROOT/task-mismatch.log"

set +e
(
  cd "$REPO"
  PATH="$MOCK_BIN:$PATH" PIPELINE_STATE_DIR="$STATE" PIPELINE_NO_NOTIFY=1 \
    PIPELINE_NONINTERACTIVE=1 bash "$ENGINE" --provider=codex --profile=standard \
    --no-commit --resume="$RUN_ID" "$TASK"
) >"$TMP_ROOT/config-mismatch.log" 2>&1
config_rc=$?
set -e
[[ $config_rc -ne 0 ]]
grep -qi "configuration hash mismatch" "$TMP_ROOT/config-mismatch.log"

# Worktree, artifact, ledger, schema, engine, and baseline mutations all fail closed.
cp "$REPO/README.md" "$TMP_ROOT/README.backup"
printf '%s\n' "mutation" >> "$REPO/README.md"
expect_resume_failure worktree-mismatch "worktree fingerprint mismatch" "$ENGINE"
mv -f "$TMP_ROOT/README.backup" "$REPO/README.md"

cp "$SESSION_DIR/pre-check.md" "$TMP_ROOT/pre-check.backup"
printf '%s\n' "tamper" >> "$SESSION_DIR/pre-check.md"
expect_resume_failure artifact-mismatch "artifact hash mismatch" "$ENGINE"
mv -f "$TMP_ROOT/pre-check.backup" "$SESSION_DIR/pre-check.md"

cp "$SESSION_DIR/ledger.jsonl" "$TMP_ROOT/ledger.backup"
printf '%s\n' '{}' >> "$SESSION_DIR/ledger.jsonl"
expect_resume_failure ledger-mismatch "ledger" "$ENGINE"
mv -f "$TMP_ROOT/ledger.backup" "$SESSION_DIR/ledger.jsonl"

cp "$SESSION_DIR/ledger.jsonl" "$TMP_ROOT/ledger-schema.backup"
node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const file = process.argv[1];
  const events = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  events[0].schemaVersion = "2.0";
  let previous = null;
  for (const event of events) {
    event.prevEventHash = previous;
    delete event.eventHash;
    event.eventHash = "sha256:" + crypto.createHash("sha256")
      .update(JSON.stringify(event)).digest("hex");
    previous = event.eventHash;
  }
  fs.writeFileSync(file, events.map(JSON.stringify).join("\n") + "\n");
' "$SESSION_DIR/ledger.jsonl"
expect_resume_failure schema-mismatch "unsupported ledger schema" "$ENGINE"
mv -f "$TMP_ROOT/ledger-schema.backup" "$SESSION_DIR/ledger.jsonl"

ENGINE_COPY="$TMP_ROOT/run-pipeline-modified.sh"
cp "$ENGINE" "$ENGINE_COPY"
printf '\n# test-only engine hash mutation\n' >> "$ENGINE_COPY"
expect_resume_failure engine-mismatch "engine hash mismatch" "$ENGINE_COPY"

git -C "$REPO" checkout -q -b resume-mismatch
git -C "$REPO" commit -q --allow-empty -m "moved baseline"
expect_resume_failure baseline-mismatch "baseline commit mismatch" "$ENGINE"
git -C "$REPO" checkout -q master

# A compatible resume reuses Phase 0/1 and completes from the next checkpoint.
run_pipeline "$ENGINE" --resume="$RUN_ID" >"$TMP_ROOT/resumed.log" 2>&1
[[ "$(grep -c '^phase-0$' "$MOCK_CALL_LOG")" -eq 1 ]]
[[ "$(grep -c '^phase-1$' "$MOCK_CALL_LOG")" -eq 1 ]]
grep -q "Resume verified" "$TMP_ROOT/resumed.log"

node -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const root = process.argv[1];
  const ledger = fs.readFileSync(path.join(root, "ledger.jsonl"), "utf8")
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  let previous = null;
  const types = new Set();
  for (let index = 0; index < ledger.length; index++) {
    const event = ledger[index];
    if (event.sequence !== index + 1 || event.prevEventHash !== previous)
      throw new Error(`sequence/previous mismatch at ${index + 1}`);
    const unsigned = { ...event };
    delete unsigned.eventHash;
    const hash = "sha256:" + crypto.createHash("sha256")
      .update(JSON.stringify(unsigned)).digest("hex");
    if (hash !== event.eventHash) throw new Error(`hash mismatch at ${index + 1}`);
    previous = event.eventHash;
    types.add(event.type);
  }
  for (const required of [
    "run_started", "attempt_started", "attempt_finished", "validation_finished",
    "gate_evaluated", "phase_skipped", "checkpoint_written", "run_halted",
    "run_resumed", "run_completed"
  ]) {
    if (!types.has(required)) throw new Error(`missing event type ${required}`);
  }
  const summary = JSON.parse(fs.readFileSync(path.join(root, "run.json"), "utf8"));
  if (summary.schemaVersion !== "1.0" || summary.status !== "COMPLETED")
    throw new Error("run summary is not completed schema 1.0");
  if (!summary.checkpoint || summary.checkpoint.cursor !== "phase-12")
    throw new Error("final checkpoint is missing");
  if (!(summary.totals.cachedTokens > 0) || summary.cache.correctnessIndependent !== true)
    throw new Error("cache telemetry is missing");
  const attempts = fs.readdirSync(path.join(root, "attempts"));
  if (!attempts.length) throw new Error("attempt envelopes are missing");
  for (const name of attempts) {
    const resultPath = path.join(root, "attempts", name, "result.json");
    if (!fs.existsSync(resultPath)) continue;
    const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    if (result.executor.kind === "MODEL" &&
        (!result.executor.stablePrefixSha256 || !result.executor.cacheKey))
      throw new Error(`cache identity missing for ${name}`);
  }
' "$SESSION_DIR"

node -e '
  const fs = require("fs");
  const history = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (history.schemaVersion !== "2.0" ||
      history.source !== "derived-from-run-ledgers" ||
      !history.runs.some(run => run.status === "COMPLETED"))
    process.exit(1);
' "$STATE/history.json"

echo "milestone 2 ledger/resume smoke tests passed"
