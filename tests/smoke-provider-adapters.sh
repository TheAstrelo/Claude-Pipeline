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
  *"Pre-Check Agent"*)
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | — | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | — | — |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.'
    verdict="" ;;
  *"Requirements Agent"*)
    report=$'## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.'
    verdict="" ;;
  *"Architect Agent"*)
    report=$'## Decisions\n\n**Use mock** — deterministic — Source: tests/smoke-provider-adapters.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |'
    verdict="" ;;
  *"Adversarial Review Agent"*)
    report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Architect | LOW | None | — |\n\n## Consensus\nNone.\n\n## Blocks\nNone.'
    verdict="APPROVED" ;;
  *"Planning Agent"*)
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md MODIFY\n**Deps:** None\n**Before:** existing\n**After:** existing\n**Test:** run -> pass'
    verdict="" ;;
  *"Drift Detection Agent"*)
    report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Mock | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%'
    verdict="" ;;
  *"Builder Agent"*)
    if [[ "${MOCK_WRITE_CODE:-0}" == "1" ]]; then
      printf '%s\n' "mock build output" > smoke-built.txt
    fi
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | README.md | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- None'
    verdict="" ;;
  *"Denoiser Agent"*) report=$'## Denoise\n\nNo debug artifacts.'; verdict="" ;;
  *"Quality Fit Agent"*) report=$'## Quality Fit\n\nMock checks passed.'; verdict="" ;;
  *"Quality Behavior Agent"*) report=$'## Quality Behavior\n\nNo test command; exit -1.'; verdict="" ;;
  *"Quality Docs Agent"*) report=$'## Quality Docs\n\nCoverage checked.'; verdict="" ;;
  *"Security Agent"*)
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | — | — | NONE | — |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS'
    verdict="PASS" ;;
  *"Commit Code-Review Agent"*)
    report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | — | None | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE'
    verdict="APPROVE" ;;
  *) report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.'; verdict="APPROVE" ;;
esac

if [[ -n "$schema_file" ]]; then
  REPORT="$report" VERDICT="$verdict" node -e '
    const fs = require("fs");
    const schema = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const properties = schema.properties || {};
    const payload = {
      artifact: process.env.REPORT,
      verdict: process.env.VERDICT
    };
    for (const field of [
      "scanned_diff_sha", "scanned_tree_sha",
      "reviewed_diff_sha", "reviewed_tree_sha"
    ]) {
      if (properties[field] && Array.isArray(properties[field].enum)) {
        payload[field] = properties[field].enum[0];
      }
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(payload));
  ' "$last_file" "$schema_file"
else
  printf '%s\n' "$report" > "$last_file"
fi
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":500,"output_tokens":250,"reasoning_output_tokens":50}}'
MOCK_CODEX

cat > "$MOCK_BIN/claude" <<'MOCK_CLAUDE'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "mock claude help --bare"
  exit 0
fi
prompt=$(cat)
bound_diff=$(printf '%s\n' "$prompt" | sed -nE 's/^- Diff SHA-256: ([0-9a-f]{64})$/\1/p' | tail -1)
bound_tree=$(printf '%s\n' "$prompt" | sed -nE 's/^- Candidate tree OID: ([0-9a-f]{40}|[0-9a-f]{64}|unavailable)$/\1/p' | tail -1)
case "$prompt" in
  *"Pre-Check Agent"*)
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | — | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | — | — |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.' ;;
  *"Requirements Agent"*)
    report=$'## Verdict: CLEAR\n\n## Problem\nSmoke test.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.' ;;
  *"Architect Agent"*)
    report=$'## Decisions\n\n**Use mock** — deterministic — Source: tests/smoke-provider-adapters.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |' ;;
  *"Adversarial Review Agent"*)
    report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Fix |\n|---|---|---|---|---|\n| 1 | Architect | LOW | None | — |\n\n## Consensus\nNone.\n\n## Blocks\nNone.' ;;
  *"Planning Agent"*)
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | README.md | MODIFY | None |\n\n### Step 1: Smoke\n**File:** README.md MODIFY\n**Deps:** None\n**Before:** existing\n**After:** existing\n**Test:** run -> pass' ;;
  *"Drift Detection Agent"*)
    report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Mock | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%' ;;
  *"Builder Agent"*)
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | README.md | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- None' ;;
  *"Denoiser Agent"*) report=$'## Denoise\n\nNo debug artifacts.' ;;
  *"Quality Fit Agent"*) report=$'## Quality Fit\n\nMock checks passed.' ;;
  *"Quality Behavior Agent"*) report=$'## Quality Behavior\n\nNo test command; exit -1.' ;;
  *"Quality Docs Agent"*) report=$'## Quality Docs\n\nCoverage checked.' ;;
  *"Security Agent"*)
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | — | — | NONE | — |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS' ;;
  *"Commit Code-Review Agent"*)
    report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | — | None | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE' ;;
  *) report=$'## Verdict: APPROVE\n\n## Findings\n\nNone.' ;;
esac
case "$prompt" in
  *"Security Agent"*)
    report+=$'\n\n## Scanned Diff SHA-256: '"$bound_diff"
    report+=$'\n## Scanned Tree OID: '"$bound_tree"
    ;;
  *"Commit Code-Review Agent"*)
    report+=$'\n\n## Reviewed Diff SHA-256: '"$bound_diff"
    report+=$'\n## Reviewed Tree OID: '"$bound_tree"
    ;;
esac
REPORT="$report" node -e '
  process.stdout.write(JSON.stringify({
    subtype: "success",
    total_cost_usd: 0.01,
    usage: { input_tokens: 1000, output_tokens: 250 },
    result: process.env.REPORT
  }));
'
MOCK_CLAUDE

chmod +x "$MOCK_BIN/codex" "$MOCK_BIN/claude"

run_smoke() {
  local provider="$1"
  local profile="${2:-yolo}"
  local state_dir="$TMP_ROOT/state-$provider-$profile"
  local repo_dir="$TMP_ROOT/repo-$provider-$profile"
  mkdir -p "$repo_dir"
  git -C "$repo_dir" init -q
  git -C "$repo_dir" config user.name "Pipeline Smoke"
  git -C "$repo_dir" config user.email "pipeline-smoke@example.invalid"
  printf '%s\n' "seed" > "$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" commit -q -m "seed"
  (
    cd "$repo_dir"
    PATH="$MOCK_BIN:$PATH" \
      PIPELINE_STATE_DIR="$state_dir" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      bash "$ROOT/run-pipeline.sh" \
        --provider="$provider" \
        --profile="$profile" \
        --no-commit \
        "$provider adapter smoke" >/dev/null
  )

  local session_dir
  session_dir=$(cat "$state_dir/artifacts/current.txt")
  grep -q "## Recommendation" "$session_dir/pre-check.md"
  grep -q "## Decisions" "$session_dir/design.md"
  grep -q "Build: PASS" "$session_dir/build-report.md"
  grep -q "## Verdict: PASS" "$session_dir/qa-report.md"
  grep -q "## Verdict: APPROVE" "$session_dir/code-review.md"
  if [[ "$profile" == "standard" ]]; then
    grep -q "## Verdict: APPROVED" "$session_dir/critique.md"
    grep -q "## Verdict: ALIGNED" "$session_dir/drift-report.md"
    grep -q "## Denoise" "$session_dir/qa-report.md"
    grep -q "## Quality Docs" "$session_dir/qa-report.md"
  fi
}

run_smoke codex
run_smoke claude
run_smoke codex standard

COMMIT_REPO="$TMP_ROOT/commit-repo"
mkdir -p "$COMMIT_REPO"
git -C "$COMMIT_REPO" init -q
git -C "$COMMIT_REPO" config user.name "Pipeline Smoke"
git -C "$COMMIT_REPO" config user.email "pipeline-smoke@example.invalid"
printf '%s\n' "seed" > "$COMMIT_REPO/README.md"
git -C "$COMMIT_REPO" add README.md
git -C "$COMMIT_REPO" commit -q -m "seed"
(
  cd "$COMMIT_REPO"
  PATH="$MOCK_BIN:$PATH" \
    MOCK_WRITE_CODE=1 \
    PIPELINE_STATE_DIR="$TMP_ROOT/state-commit" \
    PIPELINE_NO_NOTIFY=1 \
    PIPELINE_NONINTERACTIVE=1 \
    bash "$ROOT/run-pipeline.sh" \
      --provider=codex \
      --profile=yolo \
      --allow-untested-commit \
      "commit safety smoke" >/dev/null
)
[[ "$(git -C "$COMMIT_REPO" branch --show-current)" == pipeline/* ]]
git -C "$COMMIT_REPO" show --format= --name-only HEAD | grep -q '^smoke-built.txt$'
[[ -z "$(git -C "$COMMIT_REPO" status --porcelain)" ]]

echo "provider adapter smoke tests passed"
