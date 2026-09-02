#!/bin/bash
# Regression: the engine symlinks gitignored build state (node_modules, …)
# into the run worktree. A `node_modules/` gitignore pattern does not match a
# SYMLINK named node_modules, so before the fix the engine's own link showed up
# as untracked, was swept into the candidate tree, and tripped the non-waivable
# escaping-symlink scanner — every real Node project halted at Phase 11 (found
# by the first corpus task, evals/corpus/express-version-endpoint).
#
# Asserts, on a repo whose .gitignore says `node_modules/`:
#   - the run completes (exit 0) with a fake provider;
#   - the worktree's git status never lists node_modules;
#   - the deterministic scanner result is not BLOCK and cites no symlink;
#   - review.diff does not mention node_modules;
#   - the origin checkout is untouched and its .git/info/exclude unmodified.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d /tmp/worktree-link-smoke.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAILED=0
ok()  { echo "ok - $1"; }
bad() { echo "not ok - $1"; FAILED=1; }

# --- fake claude: preflight + the yolo phase set, always succeeding -------
BIN="$TMP/bin"; mkdir -p "$BIN"
cat > "$BIN/claude" <<'STUB'
#!/bin/bash
prompt=$(cat)
if [[ "$prompt" == "Reply with exactly: OK" ]]; then
  printf '%s' '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.001,"usage":{"input_tokens":1,"output_tokens":1},"result":"OK"}'; exit 0
fi
bound_diff=$(printf '%s\n' "$prompt" | sed -nE 's/^- Diff SHA-256: ([0-9a-f]{64})$/\1/p' | tail -1)
bound_tree=$(printf '%s\n' "$prompt" | sed -nE 's/^- Candidate tree OID: ([0-9a-f]{40}|[0-9a-f]{64}|unavailable)$/\1/p' | tail -1)
case "$prompt" in
  *"Pre-Check Agent"*)
    report=$'## Codebase Matches\n\n| Type | Path | Relevance |\n|---|---|---|\n| none | — | none |\n\n## Installed Libraries\n\n| Package | Version | Purpose |\n|---|---|---|\n| none | — | — |\n\n## Recommendation\n\nBUILD_NEW\n\n**Reasoning:** No match exists.' ;;
  *"Unified Plan Agent"*)
    report=$'===BRIEF===\n## Verdict: CLEAR\n\n## Problem\nSmoke.\n\n## Success Criteria\n1. Pass.\n\n## Scope\nIn.\n\n## Constraints\nNone.\n\n## Context Found\nMock.\n\n## Assumptions\nNone.\n===DESIGN===\n## Decisions\n\n**Use mock** — deterministic — Source: tests/mock:1\n\n## Components\n\n| Name | Purpose | Interface |\n|---|---|---|\n| Mock | Test | CLI |\n\n## Data Changes\nNone\n\n## Risks\n\n| Risk | Mitigation |\n|---|---|\n| none | — |\n===PLAN===\n## Verdict: READY\n\n## Steps\n\n| # | File | Action | Depends |\n|---|---|---|---|\n| 1 | built.txt | CREATE | None |\n\n### Step 1: Smoke\n**File:** built.txt [CREATE]\n**Deps:** None\n**Intent:** create the marker file\n**Test:** run -> pass' ;;
  *"Builder Agent"*)
    printf 'built by the smoke test\n' > built.txt
    report=$'## Verdict: SUCCESS\n\n## Results\n\n| Step | File | Status | Notes |\n|---|---|---|---|\n| 1 | built.txt | DONE | Mock |\n\n## Verification\nBuild: PASS\nTypes: PASS\n\n## Files Changed\n- built.txt' ;;
  *"Security Agent"*)
    report=$'## Findings\n\n| Type | File:Line | Pattern | Severity | Fix |\n|---|---|---|---|---|\n| None | — | — | NONE | — |\n\n## Summary\nInjection: CLEAR, Auth: 0/0 protected, Secrets: CLEAR\n\n## Verdict: PASS\n\n## Scanned Diff SHA-256: '"$bound_diff"$'\n## Scanned Tree OID: '"$bound_tree" ;;
  *"Commit Code-Review Agent"*)
    report=$'## Findings\n\n| Severity | File:Line | Issue | Fix |\n|---|---|---|---|\n| NONE | — | None | — |\n\n## Criteria Coverage\n\n| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |\n|---|---|---|\n| Pass | Yes | built.txt |\n\n## Verdict: APPROVE\n\n## Reviewed Diff SHA-256: '"$bound_diff"$'\n## Reviewed Tree OID: '"$bound_tree" ;;
  *) report=$'## Verdict: APPROVE\n\nMock.' ;;
esac
REPORT="$report" node -e 'process.stdout.write(JSON.stringify({type:"result",subtype:"success",is_error:false,total_cost_usd:0.01,usage:{input_tokens:100,output_tokens:50},result:process.env.REPORT}))'
STUB
chmod +x "$BIN/claude"

# --- a Node-shaped repo: ignored real node_modules, README seed ------------
REPO="$TMP/repo"; STATE="$TMP/state"
mkdir -p "$REPO/node_modules/left-pad" "$STATE"
printf 'module.exports = s => s;\n' > "$REPO/node_modules/left-pad/index.js"
printf 'node_modules/\n' > "$REPO/.gitignore"
printf '# seed\n' > "$REPO/README.md"
git -C "$REPO" init -q
git -C "$REPO" -c user.email=t@t -c user.name=t add -A
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm baseline
before_status=$(git -C "$REPO" status --porcelain)
before_exclude=$(cat "$REPO/.git/info/exclude" 2>/dev/null | sha256sum)

( cd "$REPO" && PATH="$BIN:$PATH" PIPELINE_NONINTERACTIVE=1 PIPELINE_NO_NOTIFY=1 \
    PIPELINE_BASELINE_CHECKS=0 PIPELINE_STATE_DIR="$STATE" PIPELINE_PROVIDER_RETRIES=0 \
    bash "$ROOT/run-pipeline.sh" --provider=claude --profile=yolo --no-commit "smoke: link paths" \
    > "$TMP/engine.log" 2>&1 )
rc=$?
if [[ $rc -eq 0 ]]; then ok "run completes with an ignored node_modules present (exit 0)"; else
  bad "engine exit $rc"; sed 's/\x1b\[[0-9;]*m//g' "$TMP/engine.log" | tail -25; fi

WT=$(ls -d "$STATE"/worktrees/*/ 2>/dev/null | head -1)
if [[ -n "$WT" && -L "${WT%/}/node_modules" ]]; then ok "engine linked node_modules into the worktree"; else bad "no node_modules symlink in the worktree (${WT:-none})"; fi
ex="$STATE/worktrees/$(basename "${WT%/}").exclude"
if [[ -f "$ex" ]] && grep -qx '/node_modules' "$ex"; then ok "run exclude file lists /node_modules"; else bad "missing exclude file $ex"; fi
st=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0="$ex" git -C "${WT%/}" status --porcelain 2>/dev/null)
if [[ "$st" != *node_modules* ]]; then ok "worktree status does not list node_modules"; else bad "worktree status lists node_modules: $st"; fi

ART=$(cat "$STATE/artifacts/current.txt" 2>/dev/null)
if [[ -f "$ART/security-scanners.json" ]]; then
  res=$(node -e 'const s=require(process.argv[1]);process.stdout.write(String(s.result))' "$ART/security-scanners.json")
  sym=$(node -e 'const s=require(process.argv[1]);process.stdout.write(String((s.findings||[]).filter(f=>f.adapter==="escaping-symlinks").length))' "$ART/security-scanners.json")
  [[ "$res" != "BLOCK" ]] && ok "scanner result is $res, not BLOCK" || bad "scanner BLOCKed"
  [[ "$sym" == "0" ]] && ok "no escaping-symlink finding" || bad "$sym escaping-symlink finding(s)"
else bad "no scanner evidence at $ART"; fi
if [[ -f "$ART/review.diff" ]] && ! grep -q node_modules "$ART/review.diff"; then ok "review.diff does not mention node_modules"; else bad "review.diff missing or mentions node_modules"; fi
if grep -q 'built.txt' "$ART/review.diff" 2>/dev/null; then ok "review.diff carries the real change (built.txt)"; else bad "review.diff lacks built.txt"; fi

after_status=$(git -C "$REPO" status --porcelain)
after_exclude=$(cat "$REPO/.git/info/exclude" 2>/dev/null | sha256sum)
[[ "$before_status" == "$after_status" ]] && ok "origin checkout untouched" || bad "origin status changed: $after_status"
[[ "$before_exclude" == "$after_exclude" ]] && ok "origin .git/info/exclude untouched" || bad "origin info/exclude was modified"

if [[ $FAILED -eq 0 ]]; then echo "worktree link smoke passed"; exit 0; else echo "worktree link smoke FAILED"; exit 1; fi
