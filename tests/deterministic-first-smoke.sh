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
  if [[ "${FAKE_SCENARIO:-}" == old-codex-* ]]; then
    echo "mock codex exec help --ignore-rules"
  else
    echo "mock codex exec help --ignore-user-config --ignore-rules"
  fi
  exit 0
fi

if [[ "${1:-}" == "features" && "${2:-}" == "list" ]]; then
  printf '%s\n' \
    "plugins stable true" \
    "memories stable true" \
    "tool_search experimental true" \
    "apps experimental true" \
    "multi_agent experimental true"
  exit 0
fi

: "${FAKE_SCENARIO:?}"
: "${FAKE_STATE_DIR:?}"
: "${FAKE_CALL_LOG:?}"
: "${FAKE_EVENT_LOG:?}"
mkdir -p "$FAKE_STATE_DIR"

last_file=""
schema_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message|-o)
      last_file="$2"
      shift 2
      ;;
    --output-schema)
      schema_file="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
prompt=$(cat)

next_count() {
  local key="$1"
  local count_file="$FAKE_STATE_DIR/$key.count"
  local count=0
  if [[ -f "$count_file" ]]; then
    read -r count < "$count_file"
  fi
  count=$((count + 1))
  printf '%s\n' "$count" > "$count_file"
  printf '%s\n' "$count"
}

log_call() {
  printf '%s\n' "$1" >> "$FAKE_CALL_LOG"
}

case "$prompt" in
  *"previous design at"*"adversarial critique at"*)
    log_call "phase2-design-retry"
    report=$'## Decisions\n\n**Use bounded recovery** - revise once - Source: tests/deterministic-first-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Recovery | Fix finding | Pipeline |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| Retry loop | Bound retries |'
    verdict=""
    ;;
  *"Planning Agent"*"Add steps for every MISSING"*)
    log_call "phase4-plan-retry"
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | smoke-built.txt | CREATE | None |\n| 2 | package.json | VERIFY | 1 |\n\n### Step 1: Implement\n**File:** smoke-built.txt CREATE\n**Deps:** None\n**Before:** absent\n**After:** present\n**Test:** npm test -> pass\n\n### Step 2: Verify missing coverage\n**File:** package.json VERIFY\n**Deps:** 1\n**Before:** test configured\n**After:** test still configured\n**Test:** npm test -> pass'
    verdict=""
    ;;
  *"Build/Fix Agent"*"Apply every requested change"*)
    log_call "phase12-heal"
    printf '%s\n' "fixed after review" > review-heal.txt
    printf '%s\n' "heal-write" >> "$FAKE_EVENT_LOG"
    report=$'## Review Heal\n\nApplied the requested change in review-heal.txt.'
    verdict=""
    ;;
  *"Pre-Check Agent"*)
    log_call "phase0-precheck"
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| Test | package.json | Harness |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | - | - |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** The smoke fixture is intentionally minimal.'
    verdict=""
    ;;
  *"Requirements Agent"*)
    log_call "phase1-requirements"
    report=$'## Verdict: CLEAR\n\n## Problem\nExercise deterministic recovery and verification.\n\n## Success Criteria\n1. The pipeline completes with real test evidence.\n\n## Scope\nSmoke fixture only.\n\n## Constraints\nUse bounded recovery.\n\n## Context Found\npackage.json.\n\n## Assumptions\nNone.'
    verdict=""
    ;;
  *"Architect Agent"*)
    log_call "phase2-design"
    report=$'## Decisions\n\n**Use the fixture** - deterministic - Source: tests/deterministic-first-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Fixture | Test pipeline | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| Flake | Fake provider |'
    verdict=""
    ;;
  *"Adversarial Review Agent"*)
    review_count=$(next_count "phase3-review")
    log_call "phase3-review"
    if [[ "$FAKE_SCENARIO" == "phase3-exhaustion" ]] ||
       [[ "$FAKE_SCENARIO" == "phase3-retry" && "$review_count" -eq 1 ]]; then
      report=$'## Verdict: REVISE_DESIGN\n\n## Issues\n\n| # | Angle | Severity | Issue | Evidence | Fix |\n|---|---|---|---|---|---|\n| 1 | Skeptic | BLOCKER | Recovery path is not explicit | design.md: no bounded retry; unattended halt -> wrong behavior | Add a bounded retry |\n\n## Consensus\nNone.\n\n## Blocks\n- Add a bounded retry.'
      verdict="REVISE_DESIGN"
    else
      report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Implementer | LOW | None | - |\n\n## Consensus\nNone.\n\n## Blocks\nNone.'
      verdict="APPROVED"
    fi
    ;;
  *"Planning Agent"*)
    log_call "phase4-plan"
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | smoke-built.txt | CREATE | None |\n\n### Step 1: Implement\n**File:** smoke-built.txt CREATE\n**Deps:** None\n**Before:** absent\n**After:** present\n**Test:** npm test -> pass'
    verdict=""
    ;;
  *"Drift Detection Agent"*)
    drift_count=$(next_count "phase5-drift")
    log_call "phase5-drift"
    if [[ "$FAKE_SCENARIO" == "phase5-exhaustion" ]] ||
       [[ "$FAKE_SCENARIO" == "phase5-retry" && "$drift_count" -eq 1 ]]; then
      report=$'## Verdict: DRIFT_DETECTED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Verify behavior | - | MISSING |\n\n## Missing Coverage\n- Add an explicit verification step.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 0, Missing: 1, Coverage: 0%'
    else
      report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Verify behavior | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%'
    fi
    verdict=""
    ;;
  *"Builder Agent"*)
    log_call "phase6-build"
    printf '%s\n' "built by deterministic smoke" > smoke-built.txt
    if [[ "$FAKE_SCENARIO" == "final-verification" ||
          "$FAKE_SCENARIO" == "final-verification-failure" ]]; then
      printf '%s\n' \
        'app.get("/fixture", (_req, res) => res.json({ ok: true }));' \
        > undocumented-api.js
    fi
    if [[ "$FAKE_SCENARIO" == "test-script-config-change" ]]; then
      printf '%s\n' '{"scripts":{"test":"changed-fixture-test"}}' > package.json
      printf '%s\n' "test-script-config-change" >> "$FAKE_EVENT_LOG"
    fi
    if [[ "$FAKE_SCENARIO" == "schema-commit" ]]; then
      printf '%s\n' '{"openapi":"3.1.0","info":{"title":"Smoke API","version":"1.0.0"}}' \
        > api.schema.json
      printf '%s\n' "api-schema-write" >> "$FAKE_EVENT_LOG"
    fi
    if [[ "$FAKE_SCENARIO" == "early-commit" ]]; then
      git add smoke-built.txt
      git commit -q -m "unauthorized early model commit"
    fi
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | smoke-built.txt | DONE | Created fixture output |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- smoke-built.txt'
    verdict=""
    ;;
  *"Denoiser Agent"*)
    log_call "phase7-denoise"
    report=$'## Denoise\n\nNo debug artifacts found.'
    verdict=""
    ;;
  *"Quality Fit Agent"*)
    log_call "phase8-quality-fit"
    report=$'## Quality Fit\n\nFixture follows project conventions.'
    verdict=""
    ;;
  *"Quality Behavior Agent"*)
    log_call "phase9-provider"
    report=$'## Quality Behavior\n\nThis response exists only to detect an unwanted provider call.'
    verdict=""
    ;;
  *"Quality Docs Agent"*)
    log_call "phase10-quality-docs"
    if [[ "$FAKE_SCENARIO" == "final-verification" ||
          "$FAKE_SCENARIO" == "final-verification-failure" ]]; then
      printf '%s\n' "written after Phase 9" > phase10-write.txt
      printf '%s\n' "phase10-write" >> "$FAKE_EVENT_LOG"
    fi
    report=$'## Quality Docs\n\nDocumentation coverage checked.'
    verdict=""
    ;;
  *"Security Agent"*)
    security_count=$(next_count "phase11-security")
    log_call "phase11-security"
    if [[ "$FAKE_SCENARIO" == "heal-security" ||
          "$FAKE_SCENARIO" == "heal-exhaustion" ||
          "$FAKE_SCENARIO" == "heal-verification-failure" ]]; then
      printf '%s\n' "phase11-security:$security_count" >> "$FAKE_EVENT_LOG"
    fi
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | - | - | NONE | - |\n\n## Summary\nInjection: CLEAR, Auth: CLEAR, Secrets: CLEAR\n\n## Verdict: PASS'
    verdict="PASS"
    ;;
  *"Commit Code-Review Agent"*)
    code_review_count=$(next_count "phase12-review")
    log_call "phase12-review"
    if [[ "$FAKE_SCENARIO" == "heal-security" ||
          "$FAKE_SCENARIO" == "heal-exhaustion" ||
          "$FAKE_SCENARIO" == "heal-verification-failure" ]]; then
      printf '%s\n' "phase12-review:$code_review_count" >> "$FAKE_EVENT_LOG"
    else
      printf '%s\n' "phase12-review" >> "$FAKE_EVENT_LOG"
    fi

    if [[ "$FAKE_SCENARIO" == "heal-exhaustion" ]] ||
       [[ "$FAKE_SCENARIO" == "heal-security" && "$code_review_count" -eq 1 ]] ||
       [[ "$FAKE_SCENARIO" == "heal-verification-failure" && "$code_review_count" -eq 1 ]]; then
      report=$'## Findings\n\n| Severity | File:Line | Issue | Trigger | Fix |\n|---|---|---|---|---|\n| BLOCKER | smoke-built.txt:1 | Needs follow-up | run without review-heal.txt -> wrong output | Create review-heal.txt |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pipeline completes | No | Follow-up required |\n\n## Verdict: REQUEST_CHANGES'
      verdict="REQUEST_CHANGES"
    else
      if [[ "$FAKE_SCENARIO" == "reviewer-mutation" ]]; then
        printf '%s\n' "mutated by the final reviewer" > reviewer-mutated.txt
        printf '%s\n' "phase12-mutation" >> "$FAKE_EVENT_LOG"
      fi
      if [[ "$FAKE_SCENARIO" == "review-anchor-tampering" ]]; then
        printf '%s\n' "mutated after the review anchors were captured" > reviewer-mutated.txt
        anchor_dir=$(dirname "$last_file")
        attacker_index=$(mktemp "${TMPDIR:-/tmp}/fake-review-index.XXXXXX")
        rm -f "$attacker_index"
        GIT_INDEX_FILE="$attacker_index" git read-tree HEAD
        GIT_INDEX_FILE="$attacker_index" git add -A -- .
        GIT_INDEX_FILE="$attacker_index" git diff --cached --binary \
          --full-index --no-ext-diff HEAD -- > "$anchor_dir/attacker-review.diff"
        node -e '
          const fs = require("fs");
          const crypto = require("crypto");
          const digest = crypto.createHash("sha256")
            .update(fs.readFileSync(process.argv[1]))
            .digest("hex");
          fs.writeFileSync(process.argv[2], digest + "\n");
        ' "$anchor_dir/attacker-review.diff" "$anchor_dir/review.diff.sha"
        GIT_INDEX_FILE="$attacker_index" git write-tree > "$anchor_dir/review.tree.sha"
        rm -f "$attacker_index"
        printf '%s\n' "phase12-anchor-tampering" >> "$FAKE_EVENT_LOG"
      fi
      report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | - | None | - |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pipeline completes | Yes | smoke-built.txt |\n\n## Verdict: APPROVE'
      verdict="APPROVE"
    fi
    ;;
  *)
    log_call "unexpected-provider-prompt"
    report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.'
    verdict="APPROVE"
    ;;
esac

if [[ -z "$last_file" ]]; then
  echo "mock codex did not receive an output path" >&2
  exit 2
fi

if [[ -n "$schema_file" ]]; then
  REPORT="$report" VERDICT="$verdict" SCHEMA_FILE="$schema_file" node -e '
    const fs = require("fs");
    const schema = JSON.parse(fs.readFileSync(process.env.SCHEMA_FILE, "utf8"));
    const payload = {
      artifact: process.env.REPORT,
      verdict: process.env.VERDICT
    };
    for (const field of [
      "scanned_diff_sha",
      "scanned_tree_sha",
      "reviewed_diff_sha",
      "reviewed_tree_sha"
    ]) {
      const allowed = schema.properties?.[field]?.enum;
      if (Array.isArray(allowed) && allowed.length === 1) payload[field] = allowed[0];
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(payload));
  ' "$last_file"
else
  printf '%s\n' "$report" > "$last_file"
fi

printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":500,"output_tokens":250,"reasoning_output_tokens":50}}'
MOCK_CODEX

cat > "$MOCK_BIN/npm-mock.js" <<'MOCK_NPM'
#!/usr/bin/env node
"use strict";

const fs = require("fs");
const args = process.argv.slice(2);
const supported =
  (args.length === 1 && args[0] === "test") ||
  (args.length === 2 && args[0] === "run" && args[1] === "test");
if (!supported) {
  console.error("mock npm supports only npm test or npm run test");
  process.exit(2);
}

for (const name of ["FAKE_SCENARIO", "FAKE_TEST_LOG", "FAKE_EVENT_LOG"]) {
  if (!process.env[name]) {
    console.error(`missing required environment variable: ${name}`);
    process.exit(2);
  }
}

let testState = "before-phase10";
if (fs.existsSync("phase10-write.txt")) {
  testState = "after-phase10";
} else if (fs.existsSync("review-heal.txt")) {
  testState = "after-heal";
}

const priorTestCalls = fs.readFileSync(process.env.FAKE_TEST_LOG, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.startsWith("test:"))
  .length;
const testCall = priorTestCalls + 1;

if (
  testCall === 1 &&
  ["test-mutation-pass", "test-mutation-fail"].includes(process.env.FAKE_SCENARIO)
) {
  fs.appendFileSync("README.md", `mutated by test call ${testCall}\n`);
  fs.appendFileSync(
    process.env.FAKE_EVENT_LOG,
    `test-mutation:${process.env.FAKE_SCENARIO}\n`
  );
}

for (const log of [process.env.FAKE_TEST_LOG, process.env.FAKE_EVENT_LOG]) {
  fs.appendFileSync(log, `test:${testState}\n`);
}

let testRc = 0;
if (
  process.env.FAKE_SCENARIO === "final-verification-failure" &&
  testState === "after-phase10"
) {
  testRc = 17;
} else if (
  process.env.FAKE_SCENARIO === "heal-verification-failure" &&
  testState === "after-heal"
) {
  testRc = 19;
} else if (
  process.env.FAKE_SCENARIO === "test-mutation-fail" &&
  testCall === 1
) {
  testRc = 23;
}

console.log(`mock npm test ${testRc === 0 ? "passed" : "failed"} (${testState})`);
process.exit(testRc);
MOCK_NPM

cat > "$MOCK_BIN/npm" <<'MOCK_NPM_SH'
#!/usr/bin/env bash
exec node "$(dirname "$0")/npm-mock.js" "$@"
MOCK_NPM_SH

cat > "$MOCK_BIN/npm.cmd" <<'MOCK_NPM_CMD'
@echo off
node "%~dp0npm-mock.js" %*
MOCK_NPM_CMD

chmod +x "$MOCK_BIN/codex" "$MOCK_BIN/npm"

dump_diagnostics() {
  local scenario="$1"
  local state_dir="$TMP_ROOT/state-$scenario"
  echo "---- $scenario pipeline output ----" >&2
  if [[ -f "$TMP_ROOT/$scenario.output" ]]; then
    sed -n '1,240p' "$TMP_ROOT/$scenario.output" >&2
  fi
  echo "---- $scenario provider calls ----" >&2
  if [[ -f "$TMP_ROOT/$scenario.calls" ]]; then
    cat "$TMP_ROOT/$scenario.calls" >&2
  fi
  echo "---- $scenario events ----" >&2
  if [[ -f "$TMP_ROOT/$scenario.events" ]]; then
    cat "$TMP_ROOT/$scenario.events" >&2
  fi
  echo "---- $scenario artifacts ----" >&2
  if [[ -f "$state_dir/artifacts/current.txt" ]]; then
    local session_dir
    read -r session_dir < "$state_dir/artifacts/current.txt"
    find "$session_dir" -maxdepth 1 -type f -print >&2
    if [[ -f "$session_dir/test-output.txt" ]]; then
      echo "---- $scenario test output ----" >&2
      cat "$session_dir/test-output.txt" >&2
    fi
  fi
}

fail() {
  local scenario="$1"
  shift
  echo "not ok - $*" >&2
  dump_diagnostics "$scenario"
  exit 1
}

assert_call_count() {
  local scenario="$1"
  local expected="$2"
  local call_name="$3"
  local call_log="$TMP_ROOT/$scenario.calls"
  local actual
  actual=$(grep -c -x "$call_name" "$call_log" 2>/dev/null || true)
  if [[ "$actual" -ne "$expected" ]]; then
    fail "$scenario" "expected $expected '$call_name' calls, got $actual"
  fi
}

assert_test_count() {
  local scenario="$1"
  local expected="$2"
  local test_log="$TMP_ROOT/$scenario.tests"
  local actual
  actual=$(grep -c '^test:' "$test_log" 2>/dev/null || true)
  if [[ "$actual" -ne "$expected" ]]; then
    fail "$scenario" "expected $expected test executions, got $actual"
  fi
}

create_repo() {
  local scenario="$1"
  local repo="$TMP_ROOT/repo-$scenario"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.name "Deterministic Smoke"
  git -C "$repo" config user.email "deterministic-smoke@example.invalid"
  git -C "$repo" config core.autocrlf false
  printf '%s\n' '{"scripts":{"test":"fixture-test"}}' > "$repo/package.json"
  printf '%s\n' "fixture" > "$repo/README.md"
  git -C "$repo" add package.json README.md
  git -C "$repo" commit -q -m "seed fixture"
  git -C "$repo" rev-parse HEAD > "$TMP_ROOT/$scenario.initial-head"
}

SCENARIO_RC=0

run_scenario_capture() {
  local scenario="$1"
  local profile="$2"
  local commit_mode="${3:-audit}"
  local fixture="${4:-git-tested}"
  local state_mode="${5:-external}"
  local repo="$TMP_ROOT/repo-$scenario"
  local state_dir
  local fake_state="$TMP_ROOT/fake-state-$scenario"
  local call_log="$TMP_ROOT/$scenario.calls"
  local event_log="$TMP_ROOT/$scenario.events"
  local test_log="$TMP_ROOT/$scenario.tests"
  local -a commit_args=()

  case "$commit_mode" in
    audit) commit_args=(--allow-dirty --no-commit) ;;
    auto-commit) ;;
    no-commit) commit_args=(--no-commit) ;;
    *) fail "$scenario" "unknown commit mode '$commit_mode'" ;;
  esac

  case "$fixture" in
    git-tested)
      create_repo "$scenario"
      ;;
    no-git-no-test)
      mkdir -p "$repo"
      printf '%s\n' "fixture without Git or a test command" > "$repo/README.md"
      ;;
    project-codex-config)
      create_repo "$scenario"
      mkdir -p "$repo/.codex"
      printf '%s\n' 'model = "project-controlled"' > "$repo/.codex/config.toml"
      git -C "$repo" add .codex/config.toml
      git -C "$repo" commit -q -m "add project Codex config"
      git -C "$repo" rev-parse HEAD > "$TMP_ROOT/$scenario.initial-head"
      ;;
    *)
      fail "$scenario" "unknown fixture '$fixture'"
      ;;
  esac

  case "$state_mode" in
    external) state_dir="$TMP_ROOT/state-$scenario" ;;
    absolute-in-repo) state_dir="$repo/.pipeline-absolute" ;;
    *) fail "$scenario" "unknown state mode '$state_mode'" ;;
  esac

  mkdir -p "$fake_state"
  : > "$call_log"
  : > "$event_log"
  : > "$test_log"

  set +e
  (
    cd "$repo"
    PATH="$MOCK_BIN:$PATH" \
      FAKE_SCENARIO="$scenario" \
      FAKE_STATE_DIR="$fake_state" \
      FAKE_CALL_LOG="$call_log" \
      FAKE_EVENT_LOG="$event_log" \
      FAKE_TEST_LOG="$test_log" \
      MAX_CODE_REVIEW_HEALS=2 \
      PIPELINE_STATE_DIR="$state_dir" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_BASELINE_CHECKS=0 \
      PIPELINE_BUILD_FIX_ATTEMPTS=0 \
      bash "$ROOT/run-pipeline.sh" \
        --provider=codex \
        --profile="$profile" \
        "${commit_args[@]}" \
        "deterministic-first smoke: $scenario"
  ) > "$TMP_ROOT/$scenario.output" 2>&1
  local rc=$?
  set -e
  SCENARIO_RC=$rc
}

run_scenario() {
  local scenario="$1"
  local profile="$2"
  run_scenario_capture "$scenario" "$profile" "audit"
  if [[ "$SCENARIO_RC" -ne 0 ]]; then
    fail "$scenario" "pipeline exited $SCENARIO_RC"
  fi
}

# An absolute state directory that resolves inside the repository would make
# engine artifacts part of the candidate. Reject it before any provider phase.
run_scenario_capture \
  "absolute-state-in-repo" "standard" "auto-commit" "git-tested" "absolute-in-repo"
if [[ "$SCENARIO_RC" -ne 1 ]]; then
  fail "absolute-state-in-repo" \
    "expected an in-repository absolute state path to exit 1, got $SCENARIO_RC"
fi
[[ ! -s "$TMP_ROOT/absolute-state-in-repo.calls" ]] \
  || fail "absolute-state-in-repo" "provider ran before state-path rejection"
grep -q "absolute PIPELINE_STATE_DIR must be outside the repository" \
  "$TMP_ROOT/absolute-state-in-repo.output" \
  || fail "absolute-state-in-repo" "absolute in-repository state path was not rejected"
echo "ok - absolute in-repository pipeline state is rejected before providers"

# Outside Git there is no commit boundary to waive. The engine must downgrade
# itself to review-only and complete an untested audit without a waiver flag.
run_scenario_capture \
  "no-git-no-test" "standard" "auto-commit" "no-git-no-test" "external"
if [[ "$SCENARIO_RC" -ne 0 ]]; then
  fail "no-git-no-test" \
    "review-only no-Git/no-test run exited $SCENARIO_RC without a waiver"
fi
assert_test_count "no-git-no-test" 0
assert_call_count "no-git-no-test" 1 "phase11-security"
assert_call_count "no-git-no-test" 0 "phase12-review"
grep -q "No Git repository detected; auto-commit is disabled and this run is review-only" \
  "$TMP_ROOT/no-git-no-test.output" \
  || fail "no-git-no-test" "no-Git run did not report review-only downgrade"
read -r no_git_session < "$TMP_ROOT/state-no-git-no-test/artifacts/current.txt"
node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (r.result !== "UNTESTED" || r.waiver_applied !== false) process.exit(1);
' "$no_git_session/release-verification.json" \
  || fail "no-git-no-test" "review-only evidence incorrectly requires/applies a waiver"
echo "ok - no-Git/no-test execution is review-only without an untested waiver"

# A production commit requires the CLI-level user-config isolation switch.
# The same older CLI remains usable for a deliberate review-only run.
run_scenario_capture \
  "old-codex-auto-commit" "standard" "auto-commit" "git-tested" "external"
if [[ "$SCENARIO_RC" -ne 1 ]]; then
  fail "old-codex-auto-commit" \
    "expected old Codex auto-commit isolation rejection, got $SCENARIO_RC"
fi
[[ ! -s "$TMP_ROOT/old-codex-auto-commit.calls" ]] \
  || fail "old-codex-auto-commit" "provider ran without required user-config isolation"
grep -q "production auto-commit requires a Codex CLI with --ignore-user-config" \
  "$TMP_ROOT/old-codex-auto-commit.output" \
  || fail "old-codex-auto-commit" "missing old-Codex production rejection"

run_scenario_capture \
  "old-codex-no-commit" "standard" "no-commit" "git-tested" "external"
if [[ "$SCENARIO_RC" -ne 0 ]]; then
  fail "old-codex-no-commit" "old Codex review-only run exited $SCENARIO_RC"
fi
assert_call_count "old-codex-no-commit" 1 "phase0-precheck"
assert_call_count "old-codex-no-commit" 1 "phase12-review"
echo "ok - old Codex is blocked for production but allowed with --no-commit"

# Project Codex configuration is mutable repository input. Production runs must
# reject it before a model call instead of loading project-controlled behavior.
run_scenario_capture \
  "production-codex-config" "standard" "auto-commit" "project-codex-config" "external"
if [[ "$SCENARIO_RC" -ne 1 ]]; then
  fail "production-codex-config" \
    "expected project Codex config rejection, got $SCENARIO_RC"
fi
[[ ! -s "$TMP_ROOT/production-codex-config.calls" ]] \
  || fail "production-codex-config" "provider ran with a production project Codex config"
grep -q "production Codex runs do not load a mutable project .codex/config.toml" \
  "$TMP_ROOT/production-codex-config.output" \
  || fail "production-codex-config" "project Codex config rejection was not reported"
echo "ok - production Codex rejects project .codex/config.toml before providers"

# A typed REVISE_DESIGN with a real HIGH finding must enter the bounded recovery
# path in headless mode instead of halting at the first gate evaluation.
run_scenario "phase3-retry" "standard"
assert_call_count "phase3-retry" 2 "phase3-review"
assert_call_count "phase3-retry" 1 "phase2-design-retry"
grep -q "Auto-recovery (1/" "$TMP_ROOT/phase3-retry.output" \
  || fail "phase3-retry" "design auto-recovery was not reported"
echo "ok - Phase 3 headless REVISE_DESIGN reaches bounded recovery"

# If every retry still returns REVISE_DESIGN, the recovery loop must stop at
# the standard profile's configured bound and escalate before planning/build.
run_scenario_capture "phase3-exhaustion" "standard" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "phase3-exhaustion" "expected headless Phase 3 exhaustion to exit 3, got $SCENARIO_RC"
fi
assert_call_count "phase3-exhaustion" 3 "phase3-review"
assert_call_count "phase3-exhaustion" 2 "phase2-design-retry"
assert_call_count "phase3-exhaustion" 0 "phase4-plan"
assert_call_count "phase3-exhaustion" 0 "phase6-build"
grep -q "Max retries (2) reached for Phase 3 auto-recovery" \
  "$TMP_ROOT/phase3-exhaustion.output" \
  || fail "phase3-exhaustion" "bounded retry exhaustion was not reported"
echo "ok - Phase 3 retry exhaustion is bounded and halts before planning"

# Under paranoid/hard gates, DRIFT_DETECTED is likewise recoverable and must
# revise the plan before any human-only halt path.
run_scenario "phase5-retry" "paranoid"
assert_call_count "phase5-retry" 2 "phase5-drift"
assert_call_count "phase5-retry" 1 "phase4-plan-retry"
grep -q "Auto-recovery (1/" "$TMP_ROOT/phase5-retry.output" \
  || fail "phase5-retry" "plan auto-recovery was not reported"
echo "ok - Phase 5 hard-profile DRIFT_DETECTED reaches bounded recovery"

# Paranoid mode permits three plan revisions, then its hard gate must stop an
# unresolved DRIFT_DETECTED verdict before any build-capable provider call.
run_scenario_capture "phase5-exhaustion" "paranoid" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "phase5-exhaustion" "expected paranoid Phase 5 exhaustion to exit 3, got $SCENARIO_RC"
fi
assert_call_count "phase5-exhaustion" 4 "phase5-drift"
assert_call_count "phase5-exhaustion" 3 "phase4-plan-retry"
assert_call_count "phase5-exhaustion" 0 "phase6-build"
assert_call_count "phase5-exhaustion" 0 "phase11-security"
grep -q "Max retries (3) reached for Phase 5 auto-recovery" \
  "$TMP_ROOT/phase5-exhaustion.output" \
  || fail "phase5-exhaustion" "paranoid bounded retry exhaustion was not reported"
echo "ok - Phase 5 paranoid retry exhaustion is bounded and halts before build"

# Test commands are untrusted application code. Whether the mutating command
# returns success or failure, the first changed candidate must hard-stop Phase 9
# and cannot be laundered through a later green rerun.
for mutation_scenario in test-mutation-pass test-mutation-fail; do
  run_scenario_capture "$mutation_scenario" "standard" "audit"
  if [[ "$SCENARIO_RC" -ne 3 ]]; then
    fail "$mutation_scenario" \
      "expected a mutating test command to exit 3, got $SCENARIO_RC"
  fi
  assert_test_count "$mutation_scenario" 1
  assert_call_count "$mutation_scenario" 0 "phase9-provider"
  assert_call_count "$mutation_scenario" 0 "phase10-quality-docs"
  assert_call_count "$mutation_scenario" 0 "phase11-security"
  assert_call_count "$mutation_scenario" 0 "phase12-review"
  grep -q "Verification integrity failed (UNSTABLE)" \
    "$TMP_ROOT/$mutation_scenario.output" \
    || fail "$mutation_scenario" "candidate mutation was not reported as UNSTABLE"
  read -r mutation_session \
    < "$TMP_ROOT/state-$mutation_scenario/artifacts/current.txt"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (
      r.result !== "UNSTABLE" ||
      r.exit_code !== 86 ||
      !r.candidate_tree_before ||
      !r.candidate_tree_after ||
      r.candidate_tree_before === r.candidate_tree_after
    ) process.exit(1);
  ' "$mutation_session/test-attempt-01.json" \
    || fail "$mutation_scenario" "normalized test evidence did not bind the mutation"
done
echo "ok - pass/fail test-process mutations halt once before security"

# The selected test descriptor and package script body are frozen before model
# writes begin. A Phase 6 package.json rewrite must be CONFIG_CHANGED, not a new
# command silently adopted by Phase 9.
run_scenario_capture "test-script-config-change" "standard" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "test-script-config-change" \
    "expected frozen test-script drift to exit 3, got $SCENARIO_RC"
fi
assert_test_count "test-script-config-change" 0
assert_call_count "test-script-config-change" 0 "phase9-provider"
assert_call_count "test-script-config-change" 0 "phase10-quality-docs"
assert_call_count "test-script-config-change" 0 "phase11-security"
assert_call_count "test-script-config-change" 0 "phase12-review"
grep -q "Verification descriptors changed during the run" \
  "$TMP_ROOT/test-script-config-change.output" \
  || fail "test-script-config-change" "verification descriptor drift was not reported"
read -r config_change_session \
  < "$TMP_ROOT/state-test-script-config-change/artifacts/current.txt"
[[ "$(< "$config_change_session/verification-plan.integrity-failure")" == "CONFIG_CHANGED" ]] \
  || fail "test-script-config-change" "missing CONFIG_CHANGED machine evidence"
echo "ok - Phase 6 cannot replace the frozen package test script"

# Phase 9 is orchestrator-owned: it must use the real command and exit status
# without spending a provider call. A Phase 10 write then invalidates that
# evidence, so tests must run again before the final review sees the diff.
run_scenario "final-verification" "standard"
assert_call_count "final-verification" 0 "phase9-provider"

final_state="$TMP_ROOT/state-final-verification"
read -r final_session < "$final_state/artifacts/current.txt"
qa_report="$final_session/qa-report.md"
grep -Eq 'npm( run)? test' "$qa_report" \
  || fail "final-verification" "qa-report.md does not record the real test command"
grep -Eiq 'exit[^0-9]{0,30}0' "$qa_report" \
  || fail "final-verification" "qa-report.md does not record real exit 0"
[[ "$(< "$final_session/test-exit-code.txt")" == "0" ]] \
  || fail "final-verification" "captured test-exit-code.txt is not 0"
node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (r.source !== "orchestrator" || r.result !== "PASS" || r.exit_code !== 0) process.exit(1);
' "$final_session/quality-behavior.json" \
  || fail "final-verification" "quality-behavior.json is not a machine-owned PASS record"

event_log="$TMP_ROOT/final-verification.events"
initial_test_line=$(grep -n -m1 -x "test:before-phase10" "$event_log" | cut -d: -f1 || true)
phase10_line=$(grep -n -m1 -x "phase10-write" "$event_log" | cut -d: -f1 || true)
verified_test_line=$(grep -n -m1 -x "test:after-phase10" "$event_log" | cut -d: -f1 || true)
review_line=$(grep -n -m1 -x "phase12-review" "$event_log" | cut -d: -f1 || true)

[[ -n "$initial_test_line" ]] \
  || fail "final-verification" "initial Phase 9 test execution was not observed"
[[ -n "$phase10_line" ]] \
  || fail "final-verification" "the fake Phase 10 write was not observed"
[[ -n "$verified_test_line" ]] \
  || fail "final-verification" "tests were not rerun after the Phase 10 write"
[[ -n "$review_line" ]] \
  || fail "final-verification" "Phase 12 review was not observed"
if ! (( initial_test_line < phase10_line \
       && phase10_line < verified_test_line \
       && verified_test_line < review_line )); then
  fail "final-verification" \
    "expected initial test < Phase 10 write < verification test < Phase 12 review"
fi

echo "ok - Phase 9 is deterministic and records real command/exit evidence"
echo "ok - a Phase 10 write forces test re-verification before final review"

# A failing replacement test result after Phase 10 is a release invariant, not
# a soft warning. Security and review must never consume that unverified tree.
run_scenario_capture "final-verification-failure" "standard" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "final-verification-failure" \
    "expected failed post-Phase-10 verification to exit 3, got $SCENARIO_RC"
fi
assert_call_count "final-verification-failure" 0 "phase9-provider"
assert_call_count "final-verification-failure" 0 "phase11-security"
assert_call_count "final-verification-failure" 0 "phase12-review"
grep -Eq "Required (post-mutation|release) verification failed" \
  "$TMP_ROOT/final-verification-failure.output" \
  || fail "final-verification-failure" "required verification failure was not reported"
read -r failed_final_session \
  < "$TMP_ROOT/state-final-verification-failure/artifacts/current.txt"
[[ "$(< "$failed_final_session/test-exit-code.txt")" == "17" ]] \
  || fail "final-verification-failure" "final captured test exit was not 17"
echo "ok - failed post-Phase-10 tests stop before security and review"

# A normal auto-commit path with a real test command proves that the passing
# tested tree, reviewed tree, recaptured candidate, and staged tree agree.
run_scenario_capture "tested-commit" "standard" "auto-commit"
if [[ "$SCENARIO_RC" -ne 0 ]]; then
  fail "tested-commit" "pipeline rejected an unchanged tested/reviewed candidate"
fi
assert_call_count "tested-commit" 0 "phase9-provider"
assert_call_count "tested-commit" 1 "phase12-review"
read -r tested_initial_head < "$TMP_ROOT/tested-commit.initial-head"
tested_final_head=$(git -C "$TMP_ROOT/repo-tested-commit" rev-parse HEAD)
[[ "$tested_final_head" != "$tested_initial_head" ]] \
  || fail "tested-commit" "approved tested candidate was not committed"
read -r tested_session \
  < "$TMP_ROOT/state-tested-commit/artifacts/current.txt"
read -r tested_reviewed_tree < "$tested_session/review.tree.sha"
tested_commit_tree=$(git -C "$TMP_ROOT/repo-tested-commit" \
  rev-parse "${tested_final_head}^{tree}")
tested_commit_parent=$(git -C "$TMP_ROOT/repo-tested-commit" \
  rev-parse "${tested_final_head}^")
[[ "$tested_commit_tree" == "$tested_reviewed_tree" ]] \
  || fail "tested-commit" "commit object tree differs from the reviewed tree"
[[ "$tested_commit_parent" == "$tested_initial_head" ]] \
  || fail "tested-commit" "commit object parent differs from the immutable base"
echo "ok - committed object uses the exact reviewed tree and immutable base parent"

# Application schema files must not be mistaken for provider scratch schemas.
# The exact approved api.schema.json bytes must be reachable from the new commit.
run_scenario_capture "schema-commit" "standard" "auto-commit"
if [[ "$SCENARIO_RC" -ne 0 ]]; then
  fail "schema-commit" "pipeline rejected an application schema candidate"
fi
assert_call_count "schema-commit" 1 "phase12-review"
read -r schema_initial_head < "$TMP_ROOT/schema-commit.initial-head"
schema_final_head=$(git -C "$TMP_ROOT/repo-schema-commit" rev-parse HEAD)
[[ "$schema_final_head" != "$schema_initial_head" ]] \
  || fail "schema-commit" "application schema candidate was not committed"
schema_committed=$(git -C "$TMP_ROOT/repo-schema-commit" \
  show "${schema_final_head}:api.schema.json")
[[ "$schema_committed" == \
   '{"openapi":"3.1.0","info":{"title":"Smoke API","version":"1.0.0"}}' ]] \
  || fail "schema-commit" "api.schema.json bytes are absent from the committed tree"
echo "ok - application api.schema.json bytes survive review and exact-tree commit"

# A write-capable model must not be able to hide changes by committing them
# before the review diff is captured. The isolated run branch can retain that
# early commit for inspection, but the pipeline must refuse its final commit.
run_scenario_capture "early-commit" "standard" "auto-commit"
if [[ "$SCENARIO_RC" -eq 0 ]]; then
  fail "early-commit" "pipeline accepted a model-made commit before final review"
fi
grep -q "HEAD moved after the pipeline captured its baseline" "$TMP_ROOT/early-commit.output" \
  || fail "early-commit" "pipeline did not report the moved immutable baseline"
read -r early_initial_head < "$TMP_ROOT/early-commit.initial-head"
early_commit_count=$(git -C "$TMP_ROOT/repo-early-commit" rev-list --count "$early_initial_head..HEAD")
[[ "$early_commit_count" -eq 1 ]] \
  || fail "early-commit" "expected only the model's isolated early commit, got $early_commit_count"
echo "ok - an early model-made commit cannot bypass the final commit boundary"

# The final reviewer receives a read-only sandbox, but the commit boundary must
# still defend itself. This fake ignores the sandbox, mutates the candidate
# after review.diff was captured, and lies with APPROVE. The tree binding must
# stop the commit and leave HEAD at the seed commit.
run_scenario_capture "reviewer-mutation" "standard" "auto-commit"
if [[ "$SCENARIO_RC" -eq 0 ]]; then
  fail "reviewer-mutation" "pipeline committed after the reviewer mutated the candidate"
fi
assert_call_count "reviewer-mutation" 1 "phase12-review"
[[ -f "$TMP_ROOT/repo-reviewer-mutation/reviewer-mutated.txt" ]] \
  || fail "reviewer-mutation" "fake reviewer mutation did not occur"
grep -q "candidate changed after Phase 12 reviewed it" "$TMP_ROOT/reviewer-mutation.output" \
  || fail "reviewer-mutation" "pipeline did not report a stale reviewed candidate"
read -r reviewer_initial_head < "$TMP_ROOT/reviewer-mutation.initial-head"
reviewer_final_head=$(git -C "$TMP_ROOT/repo-reviewer-mutation" rev-parse HEAD)
[[ "$reviewer_final_head" == "$reviewer_initial_head" ]] \
  || fail "reviewer-mutation" "HEAD changed despite stale-review rejection"
echo "ok - reviewer-side mutation invalidates APPROVE and cannot commit"

# A hostile reviewer can also rewrite the on-disk diff/tree anchor files after
# mutating the candidate. Reject either at the provider-artifact boundary or,
# on older engines, through the orchestrator's pre-review in-memory anchors.
run_scenario_capture "review-anchor-tampering" "standard" "auto-commit"
if [[ "$SCENARIO_RC" -eq 0 ]]; then
  fail "review-anchor-tampering" "pipeline trusted reviewer-rewritten anchor files"
fi
assert_call_count "review-anchor-tampering" 1 "phase12-review"
[[ -f "$TMP_ROOT/repo-review-anchor-tampering/reviewer-mutated.txt" ]] \
  || fail "review-anchor-tampering" "fake anchor-tampering mutation did not occur"
read -r anchor_session \
  < "$TMP_ROOT/state-review-anchor-tampering/artifacts/current.txt"
if grep -q "Provider modified orchestrator-owned phase artifacts" \
     "$TMP_ROOT/review-anchor-tampering.output"; then
  [[ ! -e "$anchor_session/precommit.diff.sha" ]] \
    || fail "review-anchor-tampering" "provider-artifact rejection ran after precommit capture"
elif grep -q "candidate changed after Phase 12 reviewed it" \
       "$TMP_ROOT/review-anchor-tampering.output"; then
  cmp -s "$anchor_session/review.diff.sha" "$anchor_session/precommit.diff.sha" \
    || fail "review-anchor-tampering" "forged diff anchor does not match the attacked candidate"
  cmp -s "$anchor_session/review.tree.sha" "$anchor_session/precommit.tree.sha" \
    || fail "review-anchor-tampering" "forged tree anchor does not match the attacked candidate"
else
  fail "review-anchor-tampering" "pipeline did not reject the anchor-tampered candidate"
fi
read -r anchor_initial_head < "$TMP_ROOT/review-anchor-tampering.initial-head"
anchor_final_head=$(git -C "$TMP_ROOT/repo-review-anchor-tampering" rev-parse HEAD)
[[ "$anchor_final_head" == "$anchor_initial_head" ]] \
  || fail "review-anchor-tampering" "HEAD changed despite forged-anchor rejection"
echo "ok - reviewer-side anchor tampering cannot rebind approval to a changed tree"

# A review heal is another write-capable code generation step. Its replacement
# candidate needs fresh tests and a fresh security pass before the second
# reviewer invocation.
run_scenario "heal-security" "standard"
assert_call_count "heal-security" 2 "phase11-security"
assert_call_count "heal-security" 2 "phase12-review"
assert_call_count "heal-security" 1 "phase12-heal"

heal_event_log="$TMP_ROOT/heal-security.events"
first_security_line=$(grep -n -m1 -x "phase11-security:1" "$heal_event_log" | cut -d: -f1 || true)
first_review_line=$(grep -n -m1 -x "phase12-review:1" "$heal_event_log" | cut -d: -f1 || true)
heal_write_line=$(grep -n -m1 -x "heal-write" "$heal_event_log" | cut -d: -f1 || true)
heal_test_line=$(grep -n -m1 -x "test:after-heal" "$heal_event_log" | cut -d: -f1 || true)
second_security_line=$(grep -n -m1 -x "phase11-security:2" "$heal_event_log" | cut -d: -f1 || true)
second_review_line=$(grep -n -m1 -x "phase12-review:2" "$heal_event_log" | cut -d: -f1 || true)

[[ -n "$first_security_line" && -n "$first_review_line" \
   && -n "$heal_write_line" && -n "$heal_test_line" \
   && -n "$second_security_line" && -n "$second_review_line" ]] \
  || fail "heal-security" "missing one or more heal verification events"
if ! (( first_security_line < first_review_line \
       && first_review_line < heal_write_line \
       && heal_write_line < heal_test_line \
       && heal_test_line < second_security_line \
       && second_security_line < second_review_line )); then
  fail "heal-security" \
    "expected security 1 < review 1 < heal < tests < security 2 < review 2"
fi
echo "ok - review heal reruns tests and Phase 11 before Phase 12 re-review"

# A heal that breaks the real test command must halt at verification. Neither a
# second security scan nor a second review may run against the failed candidate.
run_scenario_capture "heal-verification-failure" "standard" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "heal-verification-failure" \
    "expected failed post-heal verification to exit 3, got $SCENARIO_RC"
fi
assert_call_count "heal-verification-failure" 1 "phase12-heal"
assert_call_count "heal-verification-failure" 1 "phase11-security"
assert_call_count "heal-verification-failure" 1 "phase12-review"
grep -Eq "Required (post-mutation|release) verification failed" \
  "$TMP_ROOT/heal-verification-failure.output" \
  || fail "heal-verification-failure" "failed heal verification was not reported"
read -r failed_heal_session \
  < "$TMP_ROOT/state-heal-verification-failure/artifacts/current.txt"
[[ "$(< "$failed_heal_session/test-exit-code.txt")" == "19" ]] \
  || fail "heal-verification-failure" "post-heal captured test exit was not 19"
echo "ok - failed post-heal tests stop before security re-review"

# A reviewer that never approves must receive exactly the configured number of
# heal attempts. Each attempt is re-tested and re-scanned, then headless mode
# hands the unresolved result to a human without looping or committing.
run_scenario_capture "heal-exhaustion" "standard" "audit"
if [[ "$SCENARIO_RC" -ne 3 ]]; then
  fail "heal-exhaustion" "expected exhausted review heals to exit 3, got $SCENARIO_RC"
fi
assert_call_count "heal-exhaustion" 2 "phase12-heal"
assert_call_count "heal-exhaustion" 3 "phase11-security"
assert_call_count "heal-exhaustion" 3 "phase12-review"
grep -q "still REQUEST_CHANGES after 2 auto-heal attempt(s)" \
  "$TMP_ROOT/heal-exhaustion.output" \
  || fail "heal-exhaustion" "bounded heal exhaustion was not reported"
read -r heal_exhaustion_initial_head < "$TMP_ROOT/heal-exhaustion.initial-head"
heal_exhaustion_final_head=$(git -C "$TMP_ROOT/repo-heal-exhaustion" rev-parse HEAD)
[[ "$heal_exhaustion_final_head" == "$heal_exhaustion_initial_head" ]] \
  || fail "heal-exhaustion" "HEAD changed after unresolved review exhaustion"
echo "ok - Phase 12 heal exhaustion stays bounded and cannot commit"
echo "deterministic-first smoke tests passed"
