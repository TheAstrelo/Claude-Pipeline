#!/usr/bin/env bash
# Provider failure-branch smoke suite.
#
# WHY THIS EXISTS: tests/smoke-provider-adapters.sh only walks the happy path
# of run_claude / run_codex. The error branches — wall-clock timeout, the
# transient api_error retry, the per-phase budget cap under strict vs elastic
# policy, junk or empty final reports, plain non-zero exits, and Codex's
# no-retry / malformed-last-message paths — were reached by no suite at all.
#
# Every scenario runs the REAL engine (run-pipeline.sh, untouched) on a fresh
# README-only git repo against a fake `claude` / `codex` on PATH. The fake
# selects its behavior from FAKE_PROVIDER_SCENARIO and appends one line per
# phase invocation to FAKE_PROVIDER_COUNT_FILE, so retry counts are asserted
# exactly rather than inferred from log text. The fake also answers the auth
# preflight probe ("Reply with exactly: OK") so the preflight-passes path is
# covered instead of being skipped with PIPELINE_AUTH_PREFLIGHT=0.
#
# Usage:
#   bash tests/provider-failure-smoke.sh                 # every scenario
#   bash tests/provider-failure-smoke.sh budget codex    # only names matching
#   PROVIDER_FAILURE_SMOKE_KEEP=1 bash tests/provider-failure-smoke.sh   # keep temp root
#
# Output: one "ok - <scenario>" / "not ok - <scenario>" line per scenario (a
# failing scenario also prints its assertion misses and the engine log tail).
# Exit code: 0 only if every scenario passed.
set -uo pipefail   # deliberately NOT -e: run every scenario, then report.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_ROOT=$(mktemp -d)
case "$TMP_ROOT" in
  /tmp/*|"${TEMP:-/nonexistent}"/*) ;;
  *) echo "Refusing unexpected temp path: $TMP_ROOT" >&2; exit 1 ;;
esac
cleanup() {
  if [[ "${PROVIDER_FAILURE_SMOKE_KEEP:-0}" == "1" ]]; then
    echo "Temp root kept: $TMP_ROOT"
  else
    rm -rf -- "$TMP_ROOT"
  fi
}
trap cleanup EXIT

MOCK_BIN="$TMP_ROOT/bin"
mkdir -p "$MOCK_BIN"

# ---------------------------------------------------------------------------
# Fake claude. Behavior by FAKE_PROVIDER_SCENARIO; one "<phase-tag>|budget=<v>"
# line per phase invocation in FAKE_PROVIDER_COUNT_FILE (the preflight probe is
# counted in "<count file>.preflight" instead). Success reports mirror
# tests/smoke-provider-adapters.sh so a "then succeed" run passes every gate.
# ---------------------------------------------------------------------------
cat > "$MOCK_BIN/claude" <<'FAKE_CLAUDE'
#!/usr/bin/env bash
set -uo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "fake claude help --bare"
  exit 0
fi
scenario="${FAKE_PROVIDER_SCENARIO:-success}"
count_file="${FAKE_PROVIDER_COUNT_FILE:?FAKE_PROVIDER_COUNT_FILE is required}"
budget=""
model=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-budget-usd) budget="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done
prompt=$(cat)

# claude_auth_preflight / claude_model_preflight probes: always succeed,
# counted separately (one line per probe, tagged with the probed model).
if [[ "$prompt" == "Reply with exactly: OK" ]]; then
  printf 'preflight|model=%s|budget=%s\n' "$model" "$budget" >> "${count_file}.preflight"
  printf '%s' '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.001,"usage":{"input_tokens":12,"output_tokens":1},"result":"OK"}'
  exit 0
fi

case "$prompt" in
  *"Unified Plan Agent"*)        tag="collapsed-plan" ;;
  *"Pre-Check Agent"*)           tag="pre-check" ;;
  *"Requirements Agent"*)        tag="requirements" ;;
  *"Architect Agent"*)           tag="design" ;;
  *"Adversarial Review Agent"*)  tag="adversarial" ;;
  *"Planning Agent"*)            tag="planning" ;;
  *"Drift Detection Agent"*)     tag="drift" ;;
  *"Builder Agent"*)             tag="build" ;;
  *"Denoiser Agent"*)            tag="denoise" ;;
  *"Quality Fit Agent"*)         tag="quality-fit" ;;
  *"Quality Behavior Agent"*)    tag="quality-behavior" ;;
  *"Quality Docs Agent"*)        tag="quality-docs" ;;
  *"Security Agent"*)            tag="security" ;;
  *"Commit Code-Review Agent"*)  tag="code-review" ;;
  *)                             tag="other" ;;
esac
printf '%s|budget=%s\n' "$tag" "$budget" >> "$count_file"
n=$(wc -l < "$count_file" | tr -d '[:space:]')

emit_success() {
  local bound_diff bound_tree report
  bound_diff=$(printf '%s\n' "$prompt" | sed -nE 's/^- Diff SHA-256: ([0-9a-f]{64})$/\1/p' | tail -1)
  bound_tree=$(printf '%s\n' "$prompt" | sed -nE 's/^- Candidate tree OID: ([0-9a-f]{40}|[0-9a-f]{64}|unavailable)$/\1/p' | tail -1)
  case "$tag" in
    collapsed-plan)
      report=$'===BRIEF===\n## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.\n===DESIGN===\n## Decisions\n\n**Use mock** — deterministic — Source: tests/mock:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |\n===PLAN===\n## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md [MODIFY]\n**Deps:** None\n**Anchor:** \x60seed\x60\n**Intent:** keep the seed line as-is\n**Test:** run -> pass' ;;
    pre-check)
      report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | — | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | — | — |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.' ;;
    requirements)
      report=$'## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.' ;;
    design)
      report=$'## Decisions\n\n**Use mock** — deterministic — Source: tests/provider-failure-smoke.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |' ;;
    adversarial)
      report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Architect | LOW | None | — |\n\n## Consensus\nNone.\n\n## Blocks\nNone.' ;;
    planning)
      report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md MODIFY\n**Deps:** None\n**Before:** existing\n**After:** existing\n**Test:** run -> pass' ;;
    drift)
      report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Mock | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%' ;;
    build)
      report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | README.md | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- None' ;;
    denoise)          report=$'## Denoise\n\nNo debug artifacts.' ;;
    quality-fit)      report=$'## Quality Fit\n\nMock checks passed.' ;;
    quality-behavior) report=$'## Quality Behavior\n\nNo test command; exit -1.' ;;
    quality-docs)     report=$'## Quality Docs\n\nCoverage checked.' ;;
    security)
      report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | — | — | NONE | — |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS'
      report+=$'\n\n## Scanned Diff SHA-256: '"$bound_diff"
      report+=$'\n## Scanned Tree OID: '"$bound_tree" ;;
    code-review)
      report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | — | None | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE'
      report+=$'\n\n## Reviewed Diff SHA-256: '"$bound_diff"
      report+=$'\n## Reviewed Tree OID: '"$bound_tree" ;;
    *) report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.' ;;
  esac
  REPORT="$report" node -e '
    process.stdout.write(JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      total_cost_usd: 0.01,
      usage: { input_tokens: 1000, output_tokens: 250 },
      result: process.env.REPORT
    }));
  '
  exit 0
}

emit_budget_cap() {
  printf '%s' '{"type":"result","subtype":"error_max_budget_usd","is_error":true,"total_cost_usd":0.05,"usage":{"input_tokens":400,"output_tokens":20},"result":"Reached max budget"}'
  exit 1
}

case "$scenario" in
  timeout)
    exec sleep 30 ;;
  api-error-then-success)
    if [[ "$n" -eq 1 ]]; then
      printf '%s' '{"type":"result","subtype":"error","is_error":true,"terminal_reason":"api_error","total_cost_usd":0,"usage":{"input_tokens":0,"output_tokens":0},"result":"boom"}'
      exit 1
    fi
    emit_success ;;
  budget-cap-strict)
    emit_budget_cap ;;
  budget-cap-elastic)
    [[ "$n" -eq 1 ]] && emit_budget_cap
    emit_success ;;
  malformed-json)
    printf 'not json\n'
    exit 0 ;;
  empty-result)
    printf '%s' '{"type":"result","subtype":"success","result":"   "}'
    exit 0 ;;
  nonzero-no-reason)
    printf '%s\n' "fake claude: connection refused by upstream (no terminal_reason)" >&2
    exit 2 ;;
  *)
    emit_success ;;
esac
FAKE_CLAUDE

# ---------------------------------------------------------------------------
# Fake codex. Answers `codex exec --help` / `codex features list` exactly as
# tests/smoke-provider-adapters.sh does so the capability probe enables the
# full isolation flag set. One "<phase-tag>|schema=<yes|no>" line per exec.
# ---------------------------------------------------------------------------
cat > "$MOCK_BIN/codex" <<'FAKE_CODEX'
#!/usr/bin/env bash
set -uo pipefail
if [[ "${1:-}" == "exec" && "${2:-}" == "--help" ]]; then
  echo "fake codex exec help --ignore-user-config --ignore-rules"
  exit 0
fi
if [[ "${1:-}" == "features" && "${2:-}" == "list" ]]; then
  printf '%s\n' \
    "plugins stable true" \
    "memories stable true" \
    "memory_tool stable true" \
    "tool_search stable true" \
    "apps stable true" \
    "apps_mcp_gateway stable true" \
    "multi_agent stable true" \
    "multi_agent_v2 stable true" \
    "child_agents_md stable true" \
    "shell_snapshot stable true" \
    "codex_git_commit stable true" \
    "js_repl stable true" \
    "js_repl_tools_only stable true" \
    "skill_mcp_dependency_install stable true" \
    "skill_env_var_dependency_prompt stable true"
  exit 0
fi
scenario="${FAKE_PROVIDER_SCENARIO:-success}"
count_file="${FAKE_PROVIDER_COUNT_FILE:?FAKE_PROVIDER_COUNT_FILE is required}"
last_file=""
schema_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message|-o) last_file="${2:-}"; shift 2 ;;
    --output-schema) schema_file="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done
prompt=$(cat)

case "$prompt" in
  *"Unified Plan Agent"*)        tag="collapsed-plan" ;;
  *"Pre-Check Agent"*)           tag="pre-check" ;;
  *"Requirements Agent"*)        tag="requirements" ;;
  *"Architect Agent"*)           tag="design" ;;
  *"Adversarial Review Agent"*)  tag="adversarial" ;;
  *"Planning Agent"*)            tag="planning" ;;
  *"Drift Detection Agent"*)     tag="drift" ;;
  *"Builder Agent"*)             tag="build" ;;
  *"Denoiser Agent"*)            tag="denoise" ;;
  *"Quality Fit Agent"*)         tag="quality-fit" ;;
  *"Quality Behavior Agent"*)    tag="quality-behavior" ;;
  *"Quality Docs Agent"*)        tag="quality-docs" ;;
  *"Security Agent"*)            tag="security" ;;
  *"Commit Code-Review Agent"*)  tag="code-review" ;;
  *)                             tag="other" ;;
esac
printf '%s|schema=%s\n' "$tag" "$([[ -n "$schema_file" ]] && echo yes || echo no)" >> "$count_file"

usage_line='{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":500,"output_tokens":250,"reasoning_output_tokens":50}}'

emit_success() {
  local report verdict=""
  case "$tag" in
    collapsed-plan)
      report=$'===BRIEF===\n## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.\n===DESIGN===\n## Decisions\n\n**Use mock** — deterministic — Source: tests/mock:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |\n===PLAN===\n## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md [MODIFY]\n**Deps:** None\n**Anchor:** \x60seed\x60\n**Intent:** keep the seed line as-is\n**Test:** run -> pass' ;;
    pre-check)
      report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | — | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | — | — |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.' ;;
    adversarial)
      report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Architect | LOW | None | — |\n\n## Consensus\nNone.\n\n## Blocks\nNone.'
      verdict="APPROVED" ;;
    build)
      report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | README.md | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- None' ;;
    security)
      report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | — | — | NONE | — |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS'
      verdict="PASS" ;;
    code-review)
      report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | — | None | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE'
      verdict="APPROVE" ;;
    *) report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.'; verdict="APPROVE" ;;
  esac
  if [[ -n "$schema_file" ]]; then
    REPORT="$report" VERDICT="$verdict" node -e '
      const fs = require("fs");
      const schema = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
      const properties = schema.properties || {};
      const payload = { artifact: process.env.REPORT, verdict: process.env.VERDICT };
      for (const field of ["scanned_diff_sha", "scanned_tree_sha", "reviewed_diff_sha", "reviewed_tree_sha"]) {
        if (properties[field] && Array.isArray(properties[field].enum)) payload[field] = properties[field].enum[0];
      }
      fs.writeFileSync(process.argv[1], JSON.stringify(payload));
    ' "$last_file" "$schema_file"
  else
    printf '%s\n' "$report" > "$last_file"
  fi
  printf '%s\n' "$usage_line"
  exit 0
}

case "$scenario" in
  codex-nonzero)
    printf '%s\n' "fake codex: sandbox bootstrap failed" >&2
    exit 1 ;;
  codex-malformed-last-message)
    # Non-empty garbage in the last-message file on a schema-less phase.
    printf '%s\n' '?? garbage ?? {not: json, not: a report}' > "$last_file"
    printf '%s\n' "$usage_line"
    exit 0 ;;
  codex-malformed-structured)
    # Garbage where --output-schema demanded {artifact, verdict}.
    if [[ -n "$schema_file" ]]; then
      printf '%s\n' '?? garbage ?? not the JSON the schema demanded' > "$last_file"
      printf '%s\n' "$usage_line"
      exit 0
    fi
    emit_success ;;
  *)
    emit_success ;;
esac
FAKE_CODEX

chmod +x "$MOCK_BIN/claude" "$MOCK_BIN/codex"

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------
PASSED=0
FAILED=0
declare -a SUMMARY=()
declare -a ERRORS=()
RUN_RC=0; RUN_SECS=0; RUN_LOG=""; RUN_STATE=""; RUN_COUNT_FILE=""; RUN_SESSION=""

make_repo() {
  local dir=$1
  mkdir -p "$dir" &&
  git -C "$dir" init -q &&
  git -C "$dir" config user.name "Pipeline Failure Smoke" &&
  git -C "$dir" config user.email "pipeline-failure-smoke@example.invalid" &&
  printf '%s\n' "seed" > "$dir/README.md" &&
  git -C "$dir" add README.md &&
  git -C "$dir" commit -q -m "seed"
}

# run_engine <scenario> <provider> <profile> [VAR=value ...] [-- engine flags...]
# Runs one engine invocation on a fresh repo; sets RUN_* for the assertions.
run_engine() {
  local name=$1 provider=$2 profile=$3
  shift 3
  local -a env_kv=() flags=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --) shift; flags=("$@"); break ;;
      *) env_kv+=("$1"); shift ;;
    esac
  done
  local repo="$TMP_ROOT/repo-$name"
  RUN_STATE="$TMP_ROOT/state-$name"
  RUN_LOG="$TMP_ROOT/$name.log"
  RUN_COUNT_FILE="$TMP_ROOT/$name.count"
  RUN_SESSION=""
  : > "$RUN_COUNT_FILE"
  if ! make_repo "$repo"; then
    ERRORS+=("could not create the temp repo $repo")
    RUN_RC=-1; RUN_SECS=0
    : > "$RUN_LOG"
    return 1
  fi
  local start end
  start=$(date +%s)
  (
    cd "$repo" &&
    env ${env_kv[@]+"${env_kv[@]}"} \
      PATH="$MOCK_BIN:$PATH" \
      FAKE_PROVIDER_SCENARIO="$name" \
      FAKE_PROVIDER_COUNT_FILE="$RUN_COUNT_FILE" \
      PIPELINE_STATE_DIR="$RUN_STATE" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_BASELINE_CHECKS=0 \
      PIPELINE_PROVIDER_RETRIES=1 \
      bash "$ROOT/run-pipeline.sh" \
        --provider="$provider" \
        --profile="$profile" \
        --no-commit \
        ${flags[@]+"${flags[@]}"} \
        "provider failure smoke: $name"
  ) > "$RUN_LOG" 2>&1
  RUN_RC=$?
  end=$(date +%s)
  RUN_SECS=$((end - start))
  if [[ -f "$RUN_STATE/artifacts/current.txt" ]]; then
    RUN_SESSION=$(head -1 "$RUN_STATE/artifacts/current.txt")
  fi
  return 0
}

invocations() { wc -l < "$RUN_COUNT_FILE" | tr -d '[:space:]'; }
preflights() {
  [[ -f "$RUN_COUNT_FILE.preflight" ]] && wc -l < "$RUN_COUNT_FILE.preflight" | tr -d '[:space:]' || echo 0
}
count_tag() { grep -c "^$1|" "$RUN_COUNT_FILE" 2>/dev/null || true; }
count_line() { sed -n "${1}p" "$RUN_COUNT_FILE"; }

# Count ledger events of a type, optionally filtered on payload fields
# (key=value pairs, all must match).
ledger_count() {
  local file="$RUN_SESSION/ledger.jsonl"
  [[ -f "$file" ]] || { echo 0; return; }
  node -e '
    const fs = require("fs");
    const [file, type, ...filters] = process.argv.slice(1);
    const pairs = filters.map(f => f.split(/=(.*)/s).slice(0, 2));
    const n = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)
      .map(l => JSON.parse(l))
      .filter(e => e.type === type &&
        pairs.every(([k, v]) => String((e.payload || {})[k]) === v))
      .length;
    process.stdout.write(String(n));
  ' "$file" "$@" 2>/dev/null || echo 0
}

expect_rc() {
  [[ "$RUN_RC" -eq "$1" ]] || ERRORS+=("expected engine exit $1, got $RUN_RC")
}
expect_log() {
  grep -qF -- "$1" "$RUN_LOG" || ERRORS+=("log lacks: $1")
}
expect_no_log() {
  ! grep -qF -- "$1" "$RUN_LOG" || ERRORS+=("log unexpectedly contains: $1")
}
expect_invocations() {
  local got; got=$(invocations)
  [[ "$got" -eq "$1" ]] || ERRORS+=("expected $1 phase invocation(s), got $got: $(tr '\n' ' ' < "$RUN_COUNT_FILE")")
}
expect_tag_count() {
  local got; got=$(count_tag "$1")
  [[ "$got" -eq "$2" ]] || ERRORS+=("expected $2 '$1' invocation(s), got $got: $(tr '\n' ' ' < "$RUN_COUNT_FILE")")
}
# Startup probes: one per DISTINCT routed model (auth probe on the fast lane,
# then the strong/review lanes), never repeated per phase or retry.
expect_preflight() {
  local got distinct; got=$(preflights)
  distinct=$( { [[ -f "$RUN_COUNT_FILE.preflight" ]] && sed 's/.*|model=\([^|]*\)|.*/\1/' "$RUN_COUNT_FILE.preflight" | sort -u | wc -l | tr -d '[:space:]'; } || echo 0)
  [[ "$got" -ge 1 && "$got" -le 3 ]] || ERRORS+=("expected 1-3 startup probes (one per distinct model), got $got")
  [[ "$got" -eq "$distinct" ]] || ERRORS+=("a model was probed more than once: $(tr '\n' ' ' < "$RUN_COUNT_FILE.preflight")")
}
expect_artifact() {
  [[ -n "$RUN_SESSION" && -s "$RUN_SESSION/$1" ]] || ERRORS+=("artifact missing or empty: ${RUN_SESSION:-<no session>}/$1")
}
expect_no_artifact() {
  [[ -z "$RUN_SESSION" || ! -s "$RUN_SESSION/$1" ]] || ERRORS+=("artifact unexpectedly present: $RUN_SESSION/$1")
}
expect_ledger() {  # type expected-count [key=value ...]
  local type=$1 want=$2; shift 2
  local got; got=$(ledger_count "$type" "$@")
  [[ "$got" -eq "$want" ]] || ERRORS+=("ledger: expected $want '$type'${*:+ [$*]} event(s), got $got")
}
expect_run_status() {
  local got=""
  if [[ -n "$RUN_SESSION" && -f "$RUN_SESSION/run.json" ]]; then
    got=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).status||""))}catch{}' "$RUN_SESSION/run.json" 2>/dev/null)
  fi
  [[ "$got" == "$1" ]] || ERRORS+=("run.json status: expected $1, got '${got:-<none>}'")
}

# scenario <name> <fn>: runs fn (which calls run_engine + expect_*), reports.
# Optional CLI args are substring filters on the scenario name.
declare -a FILTERS=("$@")
selected() {
  [[ ${#FILTERS[@]} -eq 0 ]] && return 0
  local want
  for want in "${FILTERS[@]}"; do [[ "$1" == *"$want"* ]] && return 0; done
  return 1
}
scenario() {
  local name=$1 fn=$2
  selected "$name" || return 0
  ERRORS=()
  "$fn"
  local detail="${RUN_SECS}s, invocations=$(invocations), preflight=$(preflights), exit=$RUN_RC"
  if [[ ${#ERRORS[@]} -eq 0 ]]; then
    PASSED=$((PASSED + 1))
    SUMMARY+=("ok - $name ($detail)")
    echo "ok - $name ($detail)"
  else
    FAILED=$((FAILED + 1))
    SUMMARY+=("not ok - $name ($detail)")
    echo "not ok - $name ($detail)"
    local e
    for e in "${ERRORS[@]}"; do echo "    # $e"; done
    echo "    # invocation log: $(tr '\n' ' ' < "$RUN_COUNT_FILE" 2>/dev/null)"
    echo "    # --- engine log tail ($RUN_LOG) ---"
    tail -n 40 "$RUN_LOG" 2>/dev/null | sed 's/^/    | /'
  fi
}

# ---------------------------------------------------------------------------
# Claude scenarios
# ---------------------------------------------------------------------------

# 1. Stub sleeps past PIPELINE_PROVIDER_TIMEOUT_SECONDS=3: GNU timeout yields
#    124, run_claude retries once (transient class), the retry also times out,
#    the phase fails and the run halts with exit 1.
s_timeout() {
  run_engine timeout claude yolo PIPELINE_PROVIDER_TIMEOUT_SECONDS=3
  expect_rc 1
  expect_log "Transient provider failure (exit 124); retrying (1/2)"
  expect_log "claude -p timed out after 3s"
  expect_log "Phase 0 (Pre-Check) FAILED — no artifact produced. Halting."
  expect_invocations 2
  expect_tag_count pre-check 2
  expect_preflight
  expect_no_artifact pre-check.md
  expect_run_status HALTED
}

# 2. First call: exit 1 + terminal_reason=api_error JSON. Retried once, second
#    call succeeds, and the run carries on to a review-only completion.
s_api_error_then_success() {
  run_engine api-error-then-success claude yolo
  expect_rc 0
  expect_log "Transient provider failure (exit 1, api_error); retrying (1/2)"
  expect_log "Artifact written: pre-check.md"
  expect_no_log "claude -p failed"
  expect_tag_count pre-check 2
  expect_preflight
  expect_artifact pre-check.md
  expect_artifact code-review.md
  # Both attempts live inside ONE attempt envelope: the retry loop is internal
  # to run_claude, so the ledger records a single Phase 0 model attempt.
  expect_ledger attempt_finished 1 executorKind=MODEL phase=0
  expect_run_status COMPLETED
}

# 3. error_max_budget_usd under --budget=strict: run_claude returns 4, run_model
#    does not extend, run_phase exits 4 with the budget message. No retry.
s_budget_cap_strict() {
  run_engine budget-cap-strict claude yolo -- --budget=strict --max-budget-usd=0.05
  expect_rc 4
  expect_log 'Hit per-phase budget cap ($0.05); phase cut short.'
  expect_log "Phase 0 exceeded its budget estimate. Halting."
  expect_no_log "extending to"
  expect_no_log "retrying"
  expect_invocations 1
  expect_preflight
  expect_ledger budget_extended 0
  expect_run_status HALTED
}

# 4. Same cap hit on the first call under the default elastic policy: run_model
#    doubles the cap, records budget_extended, re-invokes with the new cap, and
#    the second call succeeds. Each attempt is its own ledger envelope. A run
#    cap turns budgeting on (per-phase default $4); without one phases are
#    effectively uncapped.
s_budget_cap_elastic() {
  run_engine budget-cap-elastic claude yolo -- --max-run-budget-usd=100
  expect_rc 0
  expect_log 'Hit per-phase budget cap ($4.00); phase cut short.'
  expect_log 'cap — extending to $8.00 within the'
  expect_log "Artifact written: pre-check.md"
  expect_tag_count pre-check 2
  expect_preflight
  expect_artifact pre-check.md
  expect_ledger budget_extended 1
  expect_ledger attempt_finished 2 executorKind=MODEL phase=0
  expect_ledger attempt_finished 1 executorKind=MODEL phase=0 status=FAILED
  expect_run_status COMPLETED
  # The extension must actually reach the CLI: the 2nd call's --max-budget-usd
  # is exactly double the 1st call's.
  local first second
  first=$(count_line 1 | sed 's/.*budget=//')
  second=$(count_line 2 | sed 's/.*budget=//')
  node -e 'process.exit(Math.abs((+process.argv[2]) - 2 * (+process.argv[1])) < 1e-9 && +process.argv[1] > 0 ? 0 : 1)' "$first" "$second" 2>/dev/null ||
    ERRORS+=("expected the retry cap to be double the first cap; got first=$first second=$second")
}

# 5. stdout is not JSON, exit 0: no retry (not a transient class), the report
#    parse fails, phase fails, exit 1.
s_malformed_json() {
  run_engine malformed-json claude yolo
  expect_rc 1
  expect_log "Claude returned no usable final report."
  expect_log "Phase 0 (Pre-Check) FAILED — no artifact produced. Halting."
  expect_no_log "retrying"
  expect_invocations 1
  expect_preflight
  expect_no_artifact pre-check.md
  expect_run_status HALTED
}

# 6. Valid success JSON whose result is whitespace only: same no-report path.
s_empty_result() {
  run_engine empty-result claude yolo
  expect_rc 1
  expect_log "Claude returned no usable final report."
  expect_no_log "retrying"
  expect_invocations 1
  expect_preflight
  expect_no_artifact pre-check.md
  expect_run_status HALTED
}

# 7. Plain non-zero exit (2), text on stderr, no JSON at all: not retried, the
#    stderr snippet is surfaced in the failure line.
s_nonzero_no_reason() {
  run_engine nonzero-no-reason claude yolo
  expect_rc 1
  expect_log "claude -p failed (exit 2)"
  expect_log "stderr: fake claude: connection refused by upstream"
  expect_no_log "retrying"
  expect_invocations 1
  expect_preflight
  expect_no_artifact pre-check.md
  expect_run_status HALTED
}

# ---------------------------------------------------------------------------
# Codex scenarios
# ---------------------------------------------------------------------------

# 8. codex exec exits 1 with stderr. run_codex has NO retry loop (unlike
#    run_claude): exactly one invocation, the stderr tail is surfaced, exit 1.
s_codex_nonzero() {
  run_engine codex-nonzero codex yolo
  expect_rc 1
  expect_log "codex exec failed (exit 1)"
  expect_log "fake codex: sandbox bootstrap failed"
  expect_log "Phase 0 (Pre-Check) FAILED — no artifact produced. Halting."
  expect_no_log "retrying"
  expect_invocations 1
  expect_no_artifact pre-check.md
  expect_run_status HALTED
}

# 9a. Non-empty garbage in --output-last-message on a schema-less phase (Phase
#     0): run_codex only checks for EMPTINESS, so the garbage is persisted as
#     the artifact and it is the Phase 0 validator that rejects it — a HARD
#     gate failure, which headless runs report as exit 3, not exit 1.
s_codex_malformed_last_message() {
  run_engine codex-malformed-last-message codex yolo
  expect_rc 3
  expect_log "Artifact written: pre-check.md"
  expect_log "codebase_searched — missing 'Codebase Matches' section"
  expect_log "HARD gate failed at Phase 0"
  expect_no_log "Codex returned no usable final report"
  expect_invocations 1
  expect_artifact pre-check.md
  expect_run_status HALTED
}

# 9b. Garbage where --output-schema demanded {artifact, verdict}: the typed
#     parse fails inside run_codex and the phase fails with exit 1. `fast`
#     keeps Phase 3 (the first schema phase), reached after Phase 0 and the
#     collapsed plan call.
s_codex_malformed_structured() {
  run_engine codex-malformed-structured codex fast
  expect_rc 1
  expect_log "Codex structured report could not be parsed."
  expect_log "Phase 3 (Adversarial Review) FAILED — no artifact produced. Halting."
  expect_no_log "retrying"
  expect_invocations 3
  expect_tag_count pre-check 1
  expect_tag_count collapsed-plan 1
  expect_tag_count adversarial 1
  [[ "$(count_line 3)" == "adversarial|schema=yes" ]] ||
    ERRORS+=("expected the 3rd invocation to be the schema-constrained Adversarial call, got '$(count_line 3)'")
  expect_artifact pre-check.md
  expect_no_artifact critique.md
  expect_run_status HALTED
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
SUITE_START=$(date +%s)
scenario timeout                      s_timeout
scenario api-error-then-success       s_api_error_then_success
scenario budget-cap-strict            s_budget_cap_strict
scenario budget-cap-elastic           s_budget_cap_elastic
scenario malformed-json               s_malformed_json
scenario empty-result                 s_empty_result
scenario nonzero-no-reason            s_nonzero_no_reason
scenario codex-nonzero                s_codex_nonzero
scenario codex-malformed-last-message s_codex_malformed_last_message
scenario codex-malformed-structured   s_codex_malformed_structured
SUITE_END=$(date +%s)

echo
TOTAL=$((PASSED + FAILED))
if [[ "$FAILED" -eq 0 ]]; then
  echo "provider failure smoke tests passed ($PASSED/$TOTAL scenarios, $((SUITE_END - SUITE_START))s)"
  exit 0
fi
echo "provider failure smoke tests FAILED ($FAILED/$TOTAL scenarios failed, $((SUITE_END - SUITE_START))s)"
exit 1
