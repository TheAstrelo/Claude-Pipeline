#!/usr/bin/env bash
# Resume kill-matrix: interrupt the engine immediately after each checkpoint
# (the engine's PIPELINE_TEST_INTERRUPT_AFTER_STAGE hook exits 99 there, the
# same observable state as a kill at that instant), then --resume and require
# the run to complete and commit. One extra scenario dirties the run worktree
# BETWEEN interrupt and resume to prove the checkpoint-restore path recovers a
# mid-mutation kill instead of failing closed.
#
# Usage: bash tests/resume-kill-matrix.sh          # representative subset
#        bash tests/resume-kill-matrix.sh --full   # every checkpoint cursor
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
    report=$'## Verdict: CLEAR\n\n## Problem\nKill matrix.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.' ;;
  *"Architect Agent"*)
    report=$'## Decisions\n\n**Use mock** — deterministic — Source: tests/resume-kill-matrix.sh:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |' ;;
  *"Adversarial Review Agent"*)
    report=$'## Verdict: APPROVED\n\n## Issues\n\n| # | Angle | Severity | Issue | Evidence | Fix |\n|---|---|---|---|---|---|\n| 1 | Architect | WARN | None | — | — |\n\n## Consensus\nNone.\n\n## Blocks\nNone.' ;;
  *"Planning Agent"*)
    report=$'## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | built.txt | CREATE | None |\n\n### Step 1: Kill matrix\n**File:** built.txt CREATE\n**Deps:** None\n**Before:** none\n**After:** content\n**Test:** run -> pass' ;;
  *"Drift Detection Agent"*)
    report=$'## Verdict: ALIGNED\n\n## Coverage Matrix\n\n| Design Requirement | Plan Step | Status |\n|---|---|---|\n| Mock | 1 | Covered |\n\n## Missing Coverage\nNone.\n\n## Scope Creep\nNone.\n\n## Summary\nRequirements: 1, Covered: 1, Missing: 0, Coverage: 100%' ;;
  *"Builder Agent"*)
    printf '%s\n' "kill-matrix build output" > built.txt
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | built.txt | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- built.txt' ;;
  *"Denoiser Agent"*) report=$'## Denoise\n\nNo debug artifacts.' ;;
  *"Quality Fit Agent"*) report=$'## Quality Fit\n\nMock checks passed.' ;;
  *"Quality Behavior Agent"*) report=$'## Quality Behavior\n\nNo test command; exit -1.' ;;
  *"Quality Docs Agent"*) report=$'## Quality Docs\n\nCoverage checked.' ;;
  *"Security Agent"*)
    report=$'## Findings\n\n| Type | File:Line | Pattern | Confidence | Exploit Path | Fix |\n|---|---|---|---|---|---|\n| None | — | — | — | — | — |\n\n## Advisories\nNone.\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS' ;;
  *"Commit Code-Review Agent"*)
    report=$'## Findings\n\n| Severity | File:Line | Issue | Trigger | Fix |\n|---|---|---|---|---|\n| NONE | — | None | — | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | Mock |\n\n## Verdict: APPROVE' ;;
  *) report=$'OK' ;;
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
chmod +x "$MOCK_BIN/claude"

CURSORS_SUBSET=(phase-0 phase-2 phase-6 release-verification phase-11)
CURSORS_FULL=(initialized phase-0 phase-1 phase-2 phase-3 phase-4 phase-5 \
  phase-6 phase-7 phase-8 phase-9 phase-10 release-verification phase-11 phase-12)
CURSORS=("${CURSORS_SUBSET[@]}")
[[ "${1:-}" == "--full" ]] && CURSORS=("${CURSORS_FULL[@]}")

TASK="resume kill matrix"
run_case() {
  local cursor=$1 dirty_worktree=${2:-0}
  local label="cursor=$cursor dirty=$dirty_worktree"
  local repo_dir="$TMP_ROOT/repo-$cursor-$dirty_worktree"
  local state_dir="$TMP_ROOT/state-$cursor-$dirty_worktree"
  mkdir -p "$repo_dir"
  git -C "$repo_dir" init -q
  git -C "$repo_dir" config user.name "Kill Matrix"
  git -C "$repo_dir" config user.email "kill-matrix@example.invalid"
  printf '%s\n' "seed" > "$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" commit -q -m "seed"
  local user_branch
  user_branch=$(git -C "$repo_dir" branch --show-current)

  # Leg 1: run until the engine self-interrupts right after the checkpoint.
  local rc=0
  (
    cd "$repo_dir"
    PATH="$MOCK_BIN:$PATH" \
      PIPELINE_STATE_DIR="$state_dir" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      PIPELINE_TEST_MODE=1 \
      PIPELINE_TEST_INTERRUPT_AFTER_STAGE="$cursor" \
      bash "$ROOT/run-pipeline.sh" \
        --provider=claude \
        --profile=standard \
        --allow-untested-commit \
        "$TASK" >/dev/null 2>&1
  ) || rc=$?
  if [[ $rc -ne 99 ]]; then
    echo "FAIL($label): expected interrupt exit 99, got $rc" >&2
    return 1
  fi

  local session_dir run_id
  session_dir=$(cat "$state_dir/artifacts/current.txt")
  run_id=$(basename "$session_dir" | sed -E 's/^([0-9]{8}-[0-9]{6}-[0-9]+-[0-9a-f]+)-.*/\1/')

  # Optional mid-mutation damage: dirty the engine-owned worktree so resume
  # must restore the checkpointed candidate tree rather than fail closed.
  if [[ "$dirty_worktree" == "1" ]]; then
    local wt="$state_dir/worktrees/$run_id"
    [[ -d "$wt" ]] || { echo "FAIL($label): run worktree missing at $wt" >&2; return 1; }
    printf 'partial write\n' > "$wt/interrupted-junk.txt"
    printf 'mutated\n' >> "$wt/README.md"
  fi

  # Leg 2: resume must complete the run (exit 0).
  rc=0
  (
    cd "$repo_dir"
    PATH="$MOCK_BIN:$PATH" \
      PIPELINE_STATE_DIR="$state_dir" \
      PIPELINE_NO_NOTIFY=1 \
      PIPELINE_NONINTERACTIVE=1 \
      bash "$ROOT/run-pipeline.sh" \
        --provider=claude \
        --profile=standard \
        --allow-untested-commit \
        --resume="$run_id" \
        "$TASK" >/dev/null 2>&1
  ) || rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "FAIL($label): resume exited $rc" >&2
    return 1
  fi

  # The user's checkout never changes; the result lands on the run branch.
  [[ "$(git -C "$repo_dir" branch --show-current)" == "$user_branch" ]] ||
    { echo "FAIL($label): user branch changed" >&2; return 1; }
  [[ -z "$(git -C "$repo_dir" status --porcelain)" ]] ||
    { echo "FAIL($label): user tree dirtied" >&2; return 1; }
  local run_branch
  run_branch=$(git -C "$repo_dir" for-each-ref --format='%(refname:short)' 'refs/heads/pipeline/*' | head -1)
  [[ -n "$run_branch" ]] ||
    { echo "FAIL($label): no pipeline branch published" >&2; return 1; }
  git -C "$repo_dir" show --format= --name-only "$run_branch" | grep -q '^built.txt$' ||
    { echo "FAIL($label): built.txt missing from published commit" >&2; return 1; }
  echo "  ok: $label"
}

failures=0
for cursor in "${CURSORS[@]}"; do
  run_case "$cursor" 0 || failures=$((failures + 1))
done
# The restore scenario: interrupted after the build checkpoint, then the
# worktree is damaged before resume.
run_case phase-6 1 || failures=$((failures + 1))

if [[ $failures -gt 0 ]]; then
  echo "resume kill-matrix: $failures case(s) FAILED" >&2
  exit 1
fi
echo "resume kill-matrix passed (${#CURSORS[@]}+1 cases)"
