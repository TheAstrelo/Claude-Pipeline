# Claude-Pipeline: Audit Report (Fable)

**Date:** 2026-07-16 · **Auditor:** Claude Fable 5 · **Method:** every load-bearing claim verified by execution or direct file inspection; four parallel sub-audits (agents / commands+prompts+lib / targets+docs / live pricing) plus a hand-read of the full 2,417-line orchestrator. A prior audit (`AUDIT-2026-07-15.md`) exists at the repo root; this audit was performed independently, then cross-checked — where we tested the same thing we got the same result, and this report marks what is **new** beyond it.

---

## 1. The one sentence

**This pipeline has never run and cannot run — every phase invocation dies on a nonexistent `--max-tokens` flag behind a nesting guard nobody unsets — and even once fixed, its own architecture burns a measured 40,921 tokens of Claude Code harness bootstrap per subprocess (~$0.05–0.26 each, 15–17 times per run), which no cost number in the repo accounts for and which makes subprocess-per-phase the wrong design, not just a buggy one.**

Supporting facts, all verified by execution on this machine, 2026-07-16:

```
$ echo hi | env -u CLAUDECODE claude -p --max-tokens 100
error: unknown option '--max-tokens'                      # 17 invocation sites in auto-pipeline.md

$ claude --version                                        # inside a Claude Code session:
Error: Claude Code cannot be launched inside another Claude Code session.
                                                          # grep -rn CLAUDECODE → 0 hits in pipeline code

$ echo "Reply with exactly the word: PONG" | env -u CLAUDECODE claude -p --model haiku --output-format json
"cacheCreationInputTokens": 40921, "costUSD": 0.0514      # per subprocess; NO cache hit on the 2nd
                                                          # identical run (cacheReadInputTokens: 0)
```

`history.json`: `"totalRuns": 0`. `.claude/AGENTS.md:42`: `*Last updated: Never (no pipeline runs yet)*`. `.claude/artifacts/` does not exist. The honest files are the empty ones.

---

## 2. Grades

| # | Dimension | Grade | One-line verdict |
|---|---|---|---|
| 1 | Model routing | **D** | Routing code exists but is inverted (critics on the fast model), dead (`--max-tokens` kills every call; `run-pipeline.sh:223` has no `--model` at all), and costed against fiction — the 41K/subprocess overhead is invisible to it. |
| 2 | Agentic loop | **F** | Zero of 12 phases have a working verify→re-gather loop. The only real loop code (`run-pipeline.sh:860-938`) dies on its first `((retries++))` under `set -e` — reproduced, exits 1 with zero iterations. Verification everywhere is grep-on-model-written-markdown. |
| 3 | Prompt quality | **C+** | The ROLE/CONSTRAINTS/CONTEXT/TASK/FORMAT/VERIFY skeleton is real and consistently applied, with some genuinely excellent constraint lines — undermined by three divergent prompt systems and validators that punish the formats the prompts mandate. |
| 4 | Four D's | **D** | Delegation: 42 agents, orchestrators delegate to none. Description: 2 agents have no frontmatter and aren't registered (verified: absent from this session's agent list); slim/full near-duplicates invite misrouting. Discernment: NEEDS_HUMAN escalation is well designed in prompts but `GATE_RESULT` is assigned and read nowhere. Diligence: the `.raw`-promotion fallback manufactures artifacts from refusals. |
| 5 | EPCC | **D-** | Explore (pre-check) is the best idea in the repo. Plan produces numbered testable criteria that **no phase after 6 ever sees** — phases 7-11 receive `$FILES_CHANGED`/`$DESIGN_DECISIONS`/`$CRITIQUE_CONSENSUS`, never `brief.md`. Code: zero test files repo-wide; demo `npm test` = `tests 0, pass 0`, exit 0 (executed). Commit: `grep -n "git \|gh pr" auto-pipeline.md` → nothing; the pipeline ends with a dirty tree and `pipeline-undo` reads a `checkpoint.txt` nothing writes. |
| 6 | Context management | **D+** | Compression is real code that destroys content (executed against the golden design.md: 30 lines → 7 header lines, every decision/source/risk gone). "Prompt caching" is fiction (§3.4). The single largest context cost — 41K bootstrap per subprocess, re-paid every time — is unmanaged and unmentioned. |
| 7 | Skills | **C-** | Two real, well-formed skills — for someone else's project (`src/infrastructure/database/migrations/`, `@infrastructure/auth/middleware`; no `src/` exists here). Commands are now model-invocable skills with no `disable-model-invocation` guard on destructive ones. No skill/command/subagent decision rule anywhere. |
| 8 | Hooks | **D+** | 2 of your 4 use cases wired; both dead on this machine (`jq: command not found` → protect-files.sh **exits 0 on a write to `.env`**, executed; prettier is a dependency of nothing). notify.sh is good, portable code (executed, exit 0) wired to nothing. Compliance logging: zero lines. |
| 9 | MCP + server tools | **F** | No `.mcp.json`, no `--mcp-config`, nothing. Four files hard-wire `mcp__codex-advisor__ask_codex` — a tool that exists on your machine only, declared in no config, granted in none of their `tools:` lines. |
| 10 | Thinking / effort | **F** | Zero occurrences of any thinking or effort control repo-wide — and the model pinned on 32/42 agents and 13/15 calls (Haiku 4.5) supports neither `effort` nor adaptive thinking, per the live model docs. Your installed CLI accepts `low, medium, high, max` (executed: `xhigh` → "must be one of: low, medium, high, max"); current CLIs add `xhigh`. |
| 11 | CLAUDE.md / docs | **F** | The doc set describes a measured, working system. Zero runs exist. Counts, flags, routing claims, cost figures, philosophy statements, badges, and the demo's own golden files are contradicted by the code — itemized in §3. |
| 12 | Architecture | **F** (execution) / **B+** (design) | The 12-phase decomposition, gate taxonomy, and pre-check-first idea are genuinely good. The realization — 2,417 lines of pseudo-bash in markdown, whose functions and variables cannot survive the tool-call boundaries it mandates, next to two other orchestrators and a 20-phase fossil — is unsound and, per the measured economics, unsalvageable in its current shape. Position defended in §6e. |

---

## 3. Broken / fake — ordered by how badly they mislead

### 3.1 The execution layer never worked

- **17 phase invocations pass `--max-tokens`**, which the CLI rejects at argv parse (`auto-pipeline.md:1052, 1157, 1241, 1328, 1373, 1418, 1498, 1527, 1603, 1684, 1710, 1802, 1896, 1938, 1978, 2011, 2157`; an 18th occurrence at `:2302` is the prose claiming "These limits are enforced via `--max-tokens`" — the entire Token Budgets section `:2300-2317` rests on a flag that does not exist). Verified by execution.
- **The nesting guard is never handled.** Every `claude` invocation from inside a Claude Code session — which is exactly what this markdown instructs — dies with *"Claude Code cannot be launched inside another Claude Code session."* Verified by execution; `CLAUDECODE` appears nowhere in the pipeline code. `env -u CLAUDECODE claude -p` works (verified — my control run returned "PONG").
- **Exit codes are never checked.** The only `$?` captures (`EXIT7`–`EXIT10`, `:2024-2030`) are echoed at `:2032` and discarded.
- **The `.raw`-promotion fallback fabricates artifacts** (`[[ ! -f X ]] && cp X.raw X`, 18 sites, incl. `:1053, :1158, :1242`; also `run-pipeline.sh:231-235`). Any stdout — an error message, a refusal that happens to echo prompt vocabulary — becomes `design.md` and feeds Phase 4. The pipeline structurally cannot distinguish "phase produced a design" from "phase produced noise."

### 3.2 The bash cannot execute even in principle

The orchestrator's own execution model ("use this pattern via the **Bash tool**", `:734`) is incompatible with its code: **shell state does not persist between Bash tool calls.** Every function defined in one fence and called in another — and every variable — evaporates:

- `init_cache_tracking` called at `:65`, defined at `:405`.
- `$TASK` is never assigned anywhere (`grep '^TASK=' auto-pipeline.md` → only `local TASK="$1"` inside `detect_relevant_rules`, `:92`); `:266` writes an empty `task.txt`.
- `SKIP_PHASES` is "assigned" by prose bullets at `:70-78` (outside any code fence) and dereferenced as a real array at `:816, :1099, :1270, :1630`. `--profile=yolo` skips nothing.
- `PROFILE` is read from the environment (`:26`), never parsed from `$ARGUMENTS` — the `--batch-qa` regex at `:38` proves the author knew how.
- Inconsistent heredoc-escaping residue: `:1052` `echo "\$PROMPT" | claude -p ... | tee "\$SESSION/pre-check.md.raw"` — run verbatim, it pipes the literal string `$PROMPT` and tees into a directory literally named `$SESSION`; the unescaped `"$SESSION/pre-check.md"` four lines later (`:1056`) means there is *no* interpretation under which the block works.
- Parallel critics: `ARCHITECT_PID=\$!` (`:1329`) captures the literal string `$!`; `wait \$ARCHITECT_PID` (`:1422`) then waits on a literal. And PIDs from one Bash call are meaningless in the next.
- `$ARGUMENTS` inside single quotes at `:60` (`$(echo '$ARGUMENTS' | tr ...)`): the session slug is always the literal word "arguments," and a task containing an apostrophe terminates the quoting — under `--dangerously-skip-permissions` that is an injection surface, not just a bug.

The file "works" only if the orchestrating model treats it as inspirational prose and improvises. None of the advertised determinism is real.

### 3.3 The only executable orchestrator kills itself

`run-pipeline.sh` (1,037 lines) is real bash with real argument parsing — and it is undocumented (referenced by zero markdown files, not installed by install.sh), has **no model routing whatsoever** (`:223` is a bare `claude -p --dangerously-skip-permissions`), and contains four reproduced defects:

1. **`((retries++))` under `set -euo pipefail`** (`:19`, `:863`, `:903`): post-increment of 0 returns status 1 → errexit kills the script the instant auto-recovery starts. Reproduced in isolation: zero iterations, exit 1. **The pipeline hard-exits at the exact moment it detects a design flaw.**
2. **Choosing `[r]evise` at any pause aborts the run** (new finding): `pause_for_human` returns 1 on `r` (`:277`), `run_gate` propagates it (`:604-605`), and the naked `run_gate "$phase"` call at `:844` sits in errexit scope — the script dies instead of re-running the phase. The revise option offered to the user is a self-destruct button.
3. **Validator output and counters are swallowed**: `result=$($validate_fn)` (`:581`) captures the ✓/✗ display lines into a variable nothing prints, and `((TOTAL_PASS++))` increments a subshell copy — the final report (`:1024`) prints "Validators: 0 passed, 0 failed" on every conceivable run. (`t.sh` at the repo root is a 16-line repro of exactly this; executed: `TOTAL_PASS=0`.)
4. **`medium_count=$(grep -c ... || echo "0")`** (`:432`): on a clean critique grep -c prints `0` *and* exits 1, so the guard appends a second zero → `"0\n0"` → the `-lt 3` comparison errors → spurious SOFT failure on every clean adversarial review.

### 3.4 The instrumentation measures nothing (or invents numbers)

- **Prompt caching subsystem** (`:349-565`): `[CACHE_BREAKPOINT:1h]` is a made-up string cat'd into the prompt body — the API's `cache_control` field is unreachable from a text prompt piped to `claude -p`. `parse_cache_metrics` greps JSON usage fields out of *plain-text* output (no `--output-format json` anywhere). `build_cached_prompt` is called by 1 of 13 phases. The "Phase-Specific Caching Strategy" table (`:553-564`) tabulates all 12 — fiction. Every run would report "Cache hit rate: 0%" forever. **Meanwhile the real cache behaves worse than they feared: my two identical subprocess runs both paid the full 40,921-token write — cross-process cache reuse didn't occur at all.**
- **Compression layer**: executed `compress_design` against `demo/expected-output/design.md`: 30 lines in, 7 out — the survivors are section headers and two table-header rows; all 5 decisions, 3 citations, 3 components, 3 risks destroyed. `report_compression_stats` would then celebrate the destruction as "~90% savings." There is no fidelity check of any kind (`grep -iE 'recall|fidelity|floor'` → 0).
- **cache.sh "Tokens saved"**: hardcoded constants — `tokens_saved_estimate += 3000` (`:76`), `+= 1500` (`:92`), `+= 1000` (`:108`) — surfaced by `cache-stats` as "Tokens saved: ~N (estimate)". Triple-dead in practice: the only incrementing subcommand (`check`) is called by nothing; the increments are jq-guarded and **jq is not installed**; and the commands' verbatim invocation `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh"` exits 127 because `CLAUDE_PROJECT_DIR` is unset in command shells (executed).
- **Cost figures**: "70% cost reduction" (`CLAUDE.md:49`, `README.md:393`, `:33`, `:685`) vs "~62%" (`:728`, `:2364`) in the same file; `pipeline-estimate.md:49-55` prices phases 2 and 11 on **Opus** — a model the live pipeline never uses; README's "$0.15–$0.45 per run" (`:403-405`) is **below the measured bootstrap floor of the architecture** (~$0.77 for 15 Haiku subprocesses before any phase does work). Zero runs have ever been measured.

### 3.5 The validators fight the prompts they grade

- Phase 11, the HARD security gate, instructs the model to emit the exact strings its own gate greps for: FORMAT mandates `## Verdict: [PASS | FAIL | CRITICAL]` (`:2148`) and "Severity markers are exactly CRITICAL/FAIL/PASS" (`:2152`) while the validator is `no_critical → ! grep "CRITICAL" $SESSION/qa-report.md (HARD)` (`:2164`). "No hardcoded secrets found" trips `no_secrets → ! grep -i "Hardcoded"` (`:2167`). The greps run over `qa-report.md`, **which phases 7-10 already appended to** (`:1861`, `:2038-2075`) — a denoise note about a "CRITICAL TODO" contaminates the security verdict.
- **The inverse is worse: the gate fails open on real findings.** An XSS or auth-bypass is FAIL severity and emits none of the trigger tokens — it passes all five HARD gates green. The gate measures vocabulary, not vulnerability.
- Same shape at Phase 6: `:1752` tells the builder to report "BLOCKED status"; `:1782`'s allowed status enum omits BLOCKED; `:1808` gates HARD on `! grep "BLOCKED"`. An honest builder fails the gate; a dishonest one passes.
- And the philosophy is inverted outright: `CLAUDE.md:87` — *"objective checks only … NOT subjective confidence scores"* — vs `auto-pipeline.md:902-964`, a whole Confidence Calibration subsystem gating on self-reported HIGH/MEDIUM/LOW (with 13 agent files emitting `## Confidence: [0-100]`, a third, incompatible scale). The confidence gate additionally fails open on empty input (no `else` branch at `:942-955`) and its output variable `GATE_RESULT` (`:947, :951, :954`) is read by nothing in 2,417 lines.

### 3.6 Dead layers shipped as features

- **`.claude/agents/` (42 files):** the three orchestrators never invoke a single one — every phase re-inlines its persona as a string (`auto-pipeline.md:1289`, `run-pipeline.sh:620-808`). 15 are referenced by single-phase slash commands; **27 are orphans** (all 14 slims + clarifier, code-reviewer, implementer, tester, researcher, test-writer, cost-estimator, changelog-generator, rollback-planner, performance-profiler, accessibility-auditor, tech-debt-tracker, suggestion-engine). Two (`code-scanner.md`, `suggestion-engine.md`) **have no YAML frontmatter at all** and are not loadable as subagents — confirmed observationally: they are absent from this session's registered agent list while the other 40 are present. 19 agents write to `.claude/artifacts/current/`, a directory nothing creates (the real system writes a `current.txt` pointer file, `run-pipeline.sh:141`). 25 carry the "RDO project" persona of another company's codebase; `tester.md:111-114` tells the tester to *ignore known failures in a test file that doesn't exist here*.
- **`settings.json` `agentMapping`/`slimAgents`** (`:95-103`): read by nothing (repo-wide grep, zero consumers). The slim/full switch is a dead knob — and its two "token-saving" variants (`architect-slim`, `adversarial-slim`) are the only agents pinned to **opus**.
- **`.claude/prompts/` (14 files):** `load_prompt()` defined at `:333`, called zero times; `:329` claims "All phase prompts are stored in `.claude/prompts/`" — false; the copies have already diverged from the inline prompts (phase-6 lacks `NEEDS_HUMAN`/Confidence; phase-9 writes to the wrong output file for the parallel-merge design). These dead files are the *better* prompts — they carry `## OUTPUT CONSTRAINTS` blocks (the correct replacement for `--max-tokens`) that the live inline prompts lack.
- **`.claude/lib/` (8 files):** none consumed by executing code. `validator.md`'s marquee "Cross-Phase Discernment Validators" — the 4-Ds feature README advertises — carry a `|| echo 0` bug (`:103-104, :112-113`) that produces `"0\n0"` and an integer-comparison error if they ever ran. They never have.
- **`templates/` (4 files) + `--template` + 12 more flags:** `README.md:119-134` and `auto-pipeline-flags.md` document 14 flags. The live command parses `--profile= --skip-arm --skip-ar --skip-pmatch --resume --batch-qa` — grep for each of `--dry-run --fast --fix --auto --yolo --quiet --only --preview --test --branch --pr --template --estimate` in auto-pipeline.md: **zero occurrences each**. README's own Quick Start (`:101`) leads with `--yolo`, which would be passed to the model as task text. The four templates are consequently unreachable.
- **`--batch-qa`:** non-functional four independent ways — `$DENOISE_PROMPT`/`$FIT_PROMPT`/`$BEHAVIOR_PROMPT`/`$DOCS_PROMPT` (`:2096-2099`) are defined nowhere; single-quoted JSON interpolation breaks on any real prompt; it hardcodes `claude-sonnet-4-5-20250929` on all four calls while advertising a discount; and the mode check at `:1834-1841` only echoes — it doesn't guard the parallel block, so batch mode would *also* run the sync QA and pay twice. Plus an infinite `while true; sleep 30` poll.
- **pipeline-viz:** runs (executed: installs, serves, HTTP 200) and can never render a frame — it watches `pipeline-state.jsonl` (`server.js:89`), written **only** by the dead nested `.claude/.claude/commands/` fossil, and its `PHASE_META` renders the fossil's 20-phase pipeline (`app.js:212-233`), not the live 12.
- **`.claude/.claude/` (10 files):** a dead 20-phase ancestor created by `install.sh:121`'s `cp -r "$source_dir" "$target_dir"` nesting bug — the installer will do the same to every user who answers "Overwrite? [y]".
- **`/pipeline-undo` and `/pipeline-history`:** undo reads `checkpoint.txt`/`status.json` which nothing writes (the real file is `checkpoint.log`, different name and format, containing no git ref — and no `git stash`/`git commit` exists anywhere in the live path); history reads `history.json` which nothing populates.
- **codex target** — the best-engineered port (real `--model-strong=`/`--model-fast=` flags) — is broken three ways: legacy `--approval-mode`/`--quiet` flags rejected by 2026 codex builds, the same `set -e` revise-kill, and the same swallowed validator counters. The other five targets are honest prompt-ports (current conventions, verified against 2026 docs) with one stale pin: `copilot/.../builder.agent.md:3` `model: "gpt-4o-mini"`.
- **Demo:** `expected-output/build-report.md` violates the pipeline's own Phase 6 FORMAT (no `## Traceability`, no `## Confidence`, lowercase "passed" that fails the `Build:.*PASS` validator); `expected-output/` contains Phase 3 and QA artifacts that its own documented `--profile=yolo` run would skip; demo README tells Cursor/Copilot users to type `@auto-pipeline` where the real invocation is `/auto-pipeline`.

---

## 4. Missing — absent entirely

1. **A commit phase.** No `git add/commit/branch`, no `gh pr` anywhere in the live path. The pipeline mutates a working tree and stops.
2. **An unbiased reviewer of built code.** `code-reviewer.md` exists and is an orphan; Phase 3's critics see only the *design*, never a diff.
3. **Tests.** Zero test files in the entire repo. The demo's `npm test` matches nothing and exits 0 (executed). `settings.json:89` `"testCommand": null` while `detect-project.sh:65-127` computes exactly that value for five stacks and throws it away.
4. **Any objective signal a model can't fake.** Every gate greps text the model itself wrote. Nothing captures an exit code from a build, test, or lint run.
5. **Success-criteria verification against built code.** Phase 1's numbered criteria die at Phase 6's prompt input. Phases 7-11 never receive `brief.md` (verified in both the inline prompts and the dead `prompts/` copies).
6. **Compliance logging** (your ask #2): zero lines, no Bash matcher, no log dir.
7. **Dangerous-op blocking that works** (your ask #3): the sole guard fails open without jq (executed: write to `.env` → allowed, exit 0), matches `.env` inside `my.envelope.ts`, misses backslash paths for `.git/`, and guards only Edit/Write — `Bash(echo secret >> .env)` walks past it. All 15+ phase invocations run `--dangerously-skip-permissions`.
8. **Per-stage notifications** (your ask #4): notify.sh works (executed) and nothing calls it.
9. **MCP**: no config; the codex-advisor references are an undeclared dependency on your personal machine.
10. **Thinking/effort control**: nothing, anywhere.
11. **Tool scoping**: PIPELINE-SPEC.md defines Allowed-tools tables for all 12 phases; enforced zero times.
12. **A `.gitignore`, `LICENSE`, `CONTRIBUTING.md`, `.github/`**: none exist; README badges/links point at two of them.

---

## 5. Genuinely good — keep these

1. **The 12-phase decomposition and gate taxonomy.** Pre-check-before-build is the highest-value idea here and remains rare. HARD/SOFT/NONE is the right mental model. The three-critics-plus-aggregator topology for Phase 3 is the right shape.
2. **The prompt skeleton.** ROLE/CONSTRAINTS/CONTEXT/TASK/FORMAT/VERIFY, applied consistently across 17+ inline prompts, with genuinely sharp constraint writing: *"no vague 'this could be better'"* (`:1298`); *"False negatives … are far worse than false positives. When uncertain, flag [REVIEW_NEEDED] rather than marking safe"* (`:2131-2132`); atomic-planner's *"If the builder has to guess, you failed."*
3. **The best agent files are excellent**: `atomic-planner` (contract framing, BEFORE/AFTER, per-step tests), `plan-reviewer` (live-schema verification, bounded revision loop), `clarifier` (ask-vs-assume rules). These deserve to be wired in.
4. **`run-pipeline.sh`'s recovery-loop *design*** (`:860-938`) is correct — revise → re-run the checking phase → test the verdict → cap → escalate to human. It's one bad increment away from working. The design was right; the bash was wrong.
5. **The NEEDS_HUMAN escalation contract** (Blocking Question / Options / Recommendation, always-pause) is good discernment design — it just needs code that acts on it.
6. **`notify.sh`** — correct `MINGW*|MSYS*|CYGWIN*` branch, beep + toast + bell fallback; the most portable script in the repo, and it runs (verified).
7. **`detect-project.sh`** already computes test/build/lint commands per stack — the cheapest real-objectivity win in the repo is wiring its output into gating.
8. **`.claude/rules/`** is real, hard-won project knowledge (MUI Grid v2 syntax, the `do` alias trap, duplicate migration IDs) — the one thing a harness can't infer. It's also currently a liability: it ships another project's schema to strangers and is auto-injected into three phases by keyword match (`:96-127`). Right asset, wrong packaging.
9. **The five prompt-port targets** (cursor/cline/windsurf/copilot/aider) use each tool's current 2026 conventions (verified against live docs) — honest ports of the spec.
10. **The `/arm → /design → /ar → /plan → /pmatch → /build → QA` slash-command chain** is internally coherent: correct artifact producer/consumer relationships, real agents, valid prerequisite checks. This — not auto-pipeline.md — is the salvageable core of the Claude-native product.

---

## 6. Remediation, sequenced

Do (a) before anything else; nothing downstream is testable until a run completes. Effort labels are honest.

### (a) Correctness — make one run possible (≈1 day)

| # | Target | Change |
|---|---|---|
| A1 | 17 sites in `auto-pipeline.md` (`:1052…:2157`) | Delete `--max-tokens N`. Do **not** replace with `CLAUDE_CODE_MAX_OUTPUT_TOKENS=1000` (Claude Code's thinking budget requires ≥1024 and < max_tokens — sub-1024 values 400). Enforce length with the `## OUTPUT CONSTRAINTS` text already written in the dead `.claude/prompts/` files. Delete `:2300-2317`. |
| A2 | Every `claude -p` site | Prefix `env -u CLAUDECODE` (verified working), or resolve structurally via (e). |
| A3 | `run-pipeline.sh:863, :903` | `((retries++))` → `retries=$((retries + 1))`. |
| A4 | `run-pipeline.sh:604-605, :844` | Fix the `[r]evise` self-destruct: capture `run_gate`'s status without letting errexit fire (`if run_gate "$phase"; then …`) and implement an actual re-run branch. |
| A5 | `run-pipeline.sh:174-187, :581` | Send `log_pass`/`log_fail` to stderr so display escapes the `$( )` capture; keep counts on the final stdout line. Delete `t.sh` and `fwd.sh`. |
| A6 | 18 `.raw`-promotion sites + `run-pipeline.sh:231-235` | Delete the promotion. A phase that wrote no artifact **failed**. Add `if ! …claude -p…; then` exit-code checks; branch on `EXIT7-10` at `:2032`. |
| A7 | `:2163-2167`, `run-pipeline.sh:523-563` | Phase 11: write to its own `security-report.md` (stop grepping a file phases 7-10 appended to); anchor verdict greps (`grep -qx '## Verdict: CRITICAL'`); add validators for FAIL-severity findings (XSS/auth-bypass currently pass green); align `:1782`'s status enum with the BLOCKED protocol it forbids. |
| A8 | `protect-files.sh` | Drop jq (node is present); **fail closed** on parse failure; normalize `\` → `/`; anchor patterns on path segments (stop blocking `my.envelope.ts`, start blocking `C:\…\.git\config`); add a `Bash` matcher for `rm -rf`, `git push --force`, `> .env`, `curl|sh`. |
| A9 | `install.sh:121` | `cp -r "$source_dir" "$target_dir"` → `cp -r "$source_dir/." "$target_dir/"` (this bug created `.claude/.claude/` in your own repo). Fix `:125` (`.pipeline/artifacts` vs the Claude target's `.claude/artifacts`). |
| A10 | `cache-*.md:6-16` | `"$CLAUDE_PROJECT_DIR/…"` → `"${CLAUDE_PROJECT_DIR:-.}/…"` (verbatim invocation currently exits 127). Or delete the cache subsystem (see (e)). |
| A11 | Docs | Fix `--yolo`→`--profile=yolo` (README:101); delete the 12 phantom flags (README:119-134, auto-pipeline-flags.md) or implement them; pick one cost number or delete both; "Strong: Phases 2 and 3" → "Phase 2 + Phase 3's aggregator" (or fix the routing per (b) and keep the sentence); fix the 41-agent badge; add LICENSE or remove the badge; resolve `CLAUDE.md:87` vs the confidence gates — keep the gate, delete the philosophy claim, and fix its fail-open `else` and the dead `GATE_RESULT`; document `--skip-arm/--skip-ar/--skip-pmatch/--batch-qa/--mode=dev`, the five real flags. |
| A12 | `.claude/rules/`, 25+ agent files, both skills | De-RDO: move rules to `examples/rules/`, parameterize from `detect-project.sh` output. This is a *medium* item, not an afternoon. |

Then delete the dead code in one commit so nobody audits it again: the caching subsystem (`:349-565`, `:2330`), compression (`:568-680` — see (e3)), `run_phase`/`on_phase_success`/`on_phase_failure`/`should_retry_phase`/`restore_phase_context` (`:275-322`, `:804-862`), the `gate_decision` pseudocode fence, `--batch-qa` (`:2087-2108`), `.claude/.claude/` (decide the pipeline-viz question first — it can only ever render that fossil), `lib/` minus anything you wire in, `templates/` unless you implement `--template`, `code-scanner.md`/`suggestion-engine.md` or give them frontmatter.

### (b) Model routing (small, after (a))

Four edits: (1) delete the duplicate config at `:691-692`; (2) `MODEL_FAST="haiku"` → `"sonnet"` at `:34`; (3) copy `codex-pipeline.sh:48-49`'s `--model-strong=`/`--model-fast=` flag parsing; (4) **route the three critics to the strong model** (`:1328, :1373, :1418`) — adversarial critique is the canonical hard-reasoning task, and the current file spends its only strong calls on the *aggregator*, i.e. on summarizing the cheap model's output. Give `run-pipeline.sh` a `--model` flag at `:223` — today it routes nothing.

Then add effort per the table in §7. Note your installed CLI (v2.1.50) accepts `low|medium|high|max` — `xhigh` exists on current CLIs; upgrade before pinning it. Never export `CLAUDE_CODE_EFFORT_LEVEL` globally (silently overrides everything), and pin a CLI minimum version at startup.

### (c) Closing the agentic loop (the multi-day core)

Priority order:

1. **Get one un-fakeable signal** (small): wire `detect-project.sh` into a `SessionStart` hook, populate `settings.json.testCommand`, and have the orchestrator run `$TEST_COMMAND; TEST_EXIT=$?` itself after Phase 6. Gate on the exit code, not on grep-for-"PASS". This is the only check a model cannot talk past, and all the parts already exist in the repo.
2. **`--json-schema` on every phase** (large, highest leverage): it's a real flag (verified in `--help`). Structured output deletes the entire FORMAT-vs-validator adversarial class (§3.5) — the verdict becomes a typed field, not a vocabulary hazard — and it *is* the "objective checks only" philosophy CLAUDE.md claims.
3. **Make revision loops re-gather** (medium): the Phase 3 revision prompt (`:1516-1524`) passes design+critique only — it silently drops the brief, the rules, the citation mandate, and the NEEDS_RESEARCH escape hatch, and `:1530` re-runs Phase 3 without ever re-running Phase 2's `has_sources` validator on the revised design. Re-inject the full context; instruct re-reads of every file the critique names. Same for `:1699-1707`.
4. **Feed criteria forward** (medium): pass `brief.md`'s numbered criteria into Phase 9 and require per-criterion PASS/FAIL grounded in the actual test run from (c1).
5. **Add the Phase 6 per-step retry** the docs promise (small): every one of the six targets has the prose; no implementation anywhere has the loop. Put it in the builder prompt + a real loop in the orchestrator.
6. **Stop-hook loop** (medium): a `Stop` hook that returns `{"decision":"block","reason":"<test failures>"}` until tests pass replaces hand-rolled retry counters — keep the max-retry counter *inside* the hook script (a Stop hook that always blocks is an infinite loop), and omit `matcher` (Stop ignores it).

### (d) New capabilities

- **Hooks** (all four asks ≈ one afternoon, given (a)/A8): `PreToolUse[Bash]` → guard + `log-commands.sh pre`; `PostToolUse[Bash]` → `log-commands.sh post` (log the raw hook JSON — it already carries session_id, cwd, command, and on post the output; pre/post delta gives you blocked-attempt visibility free); `PostToolUse[Edit|Write]` → auto-format that **detects the project's formatter and exits 0 if none** (today it would impose prettier's defaults via network fetch on every edit — README:468 even documents a different formatter, `bunx biome`, than the script runs); `Stop`/`SubagentStop` → `notify.sh`, drain stdin, always exit 0. Hooks fire in `claude -p` children, so per-phase notification costs zero orchestration. Create `.gitignore` with `.claude/logs/` and `.claude/artifacts/`.
- **Skills**: the decision rule — **slash command** = a workflow *you* trigger; **skill** = capability the *model* should discover and load on-demand (give it `disable-model-invocation: true` only when side-effectful); **subagent** = isolated context + different tools/model. Commands are now model-invocable skills, so add `disable-model-invocation: true` to `/build`, `/pipeline-undo`, `/cache-clear`, `/auto-pipeline` — a pipeline whose HARD gates the model can bypass by invoking `/build` itself has no gates. Convert `.claude/rules/*` into path-scoped skills (api/db/react) instead of keyword-injection into three phases. The skill set worth having: `new-migration`, `scaffold-api` (both exist — re-point them at the detected project), `run-tests` (wraps detect-project output), `security-scan`, `commit-and-pr`.
- **MCP**: resolve codex-advisor first — declare it in `.mcp.json` + README, or strip the four references (`code-reviewer.md:19`, `implementer.md:17`, `tester.md:21`, `plan-review.md:11`) and `code-reviewer.md`'s "Not consulted — changes were straightforward" escape hatch, which teaches the model to launder a missing tool as judgment. Then: web search/fetch are **built-in** Claude Code tools — grant them to Phase 2 instead of adding servers; add `chrome-devtools` MCP scoped to Phases 8/9 via `--mcp-config` for web-UI work; `context7` for Phase 2 citations. `claude -p` can't do OAuth — pre-authorize interactively or the child silently loses the server.
- **Commit phase** (medium): new Phase 12 (renumber Learning to 13): guard on security verdict → `git checkout -b pipeline/<session>` → dispatch `code-reviewer` (de-RDO'd, model un-pinned) on the **real diff** with brief.md criteria → HARD gate on its typed verdict → commit templated from brief + traceability → optional `gh pr create`. Never `git add -A`. Until this exists, `/pipeline-undo` has nothing to undo — fix or delete it.
- **Thinking/effort**: see §7 table. `max` nowhere — structured-output phases overthink on it.

### (e) The architecture decision — my position

**Kill subprocess-per-phase. It is not fixable; it is the wrong shape.** Three independent, now-measured reasons:

1. **Economics.** Each `claude -p` child bootstraps ~41K tokens of harness context and — measured, twice — gets **zero** cross-process cache reuse. That is $0.051 (Haiku) to $0.256 (Opus) of pure overhead per phase, ~15-17× per run, before any work happens. The pipeline's entire cost thesis (grep-compression to save ~2K tokens/artifact) optimizes 5% of spend while the design wastes 60-80% of it.
2. **Correctness.** Bash-in-markdown state cannot survive the Bash-tool boundaries the design mandates (§3.2). Every fix that keeps the shape is a fight against the substrate.
3. **Capability.** The child sessions are where all real work happens, yet they run permissionless (`--dangerously-skip-permissions`), tool-unscoped, schema-unvalidated, and blind to the 42-agent library.

Replace it with two thin paths:

- **Interactive (primary): native subagents in one session.** The existing slash-command chain (`/arm → /design → /ar → /plan → /pmatch → /build → /security-review`) already does this correctly — promote it from "dev mode" to *the* product. Wire the 15 live agents (fix the 2 frontmatter-less ones, delete or merge the 27 orphans), un-pin `model: haiku` (32 files) → `inherit` with per-agent exceptions, scope tools per agent (the spec's tables exist; 8 agents currently can't run the shell commands their own bodies contain — add Bash or rewrite as Grep-tool calls), and let the orchestrating session hold state, run `$TEST_COMMAND`, and enforce gates on typed subagent returns. Context isolation comes free; the nesting guard becomes irrelevant; artifacts can pass by path (Read-on-demand) instead of by value — which deletes the compression layer and its data-destruction risk outright.
- **Headless/CI (secondary): one real `pipeline.sh`**, evolved from `run-pipeline.sh` (post-A3/A4/A5), run from a terminal — not from inside Claude Code — with `--model` routing, `--json-schema` validation, `--max-budget-usd` per phase, and exit-code gates. Batch API (raw Messages calls, no 41K harness) for the five QA phases if cost matters: a 3K-token QA prompt on Sonnet-via-batch costs ~$0.01 vs ~$0.16 as a subprocess.

Pick **one** orchestrator per path and delete the other three (auto-pipeline.md's bash, dev-pipeline.md, the fossil). PIPELINE-SPEC.md becomes the contract for the survivors or is archived.

---

## 7. The model question, answered

### Your premise, adjudicated

**"Sonnet got an agentic upgrade and is better for roughly the same price" — half right.** Verified against the live pricing page (platform.claude.com/docs/en/pricing, fetched 2026-07-16):

| Model | Input/MTok | Output/MTok | Cache write 5m | Cache read | Context | Effort | Adaptive thinking | Compaction | Reliable cutoff |
|---|---|---|---|---|---|---|---|---|---|
| Haiku 4.5 | $1 | $5 | $1.25 | $0.10 | 200K | **no** | **no** | **no** | Feb 2025 |
| Sonnet 4.6 | $3 | $15 | $3.75 | $0.30 | 1M | low–high, max | yes | yes | Aug 2025 |
| **Sonnet 5** | **$2→$3**¹ | **$10→$15**¹ | $2.50→$3.75 | $0.20→$0.30 | 1M | low–**xhigh**, max | yes (default-on) | yes | Jan 2026 |
| Opus 4.8 | $5 | $25 | $6.25 | $0.50 | 1M | low–xhigh, max | yes | yes | Jan 2026 |
| Fable 5 | $10 | $50 | $12.50 | $1.00 | 1M | low–xhigh, max | always-on | yes | Jan 2026 |

¹ Intro pricing through **2026-08-31**; standard $3/$15 from Sept 1. Batch API: 50% off everything. No long-context surcharge on any 1M model. Sonnet 5 (and Opus 4.7+/Fable) use a newer tokenizer producing **~30% more tokens for the same text** than Haiku/Sonnet 4.6 — so effective Sonnet 5 cost vs Haiku is ~2.6× today, **~3.9× from September**, not "roughly the same."

**So the price premise is wrong by 2–4×. The conclusion is still right**, for three reasons you didn't cite: (1) Haiku 4.5 has **no effort dial** — it's a fixed floor you can't tune, while `--effort low` lets Sonnet approach Haiku-class spend on cheap phases and scale up on hard ones ("avoid Haiku" and "don't burn tokens" are the same fix); (2) Haiku's Feb-2025 cutoff is ~11 months stale on your HARD security gate and on the one phase whose job is citing live docs; (3) the absolute deltas are small next to one bad merge — see below.

### The real cost per run (the number the repo never computes)

Measured constant: **~41K tokens of Claude Code bootstrap per `claude -p` subprocess, cache-written fresh every time** (two identical runs, zero cache reads). ~15 subprocesses/run (17 with revisions). Phase work itself (prompts + artifacts + output) adds roughly 60–120K in / 15–20K out across the run, plus the Build phase's real tool traffic.

| Configuration | Bootstrap (15×) | Phase work (est.) | **Per run** | 100 runs/mo |
|---|---|---|---|---|
| All-Haiku (current intent) | ~$0.77 | ~$0.20 | **~$1.00** | ~$100 |
| As-written mix (13 Haiku + 2 Sonnet 4.6) | ~$0.97 | ~$0.25 | **~$1.20** | ~$120 |
| All-Sonnet 5 (intro / from Sept) | ~$1.53 / ~$2.30 | ~$0.55 / ~$0.80 | **~$2.10 / ~$3.10** | ~$210 / ~$310 |
| Recommended (below: Sonnet 5 + 4 Opus calls) | ~$2.15 | ~$0.90 | **~$3.00** | ~$300 |
| Recommended **after (e)** (subagents, no re-bootstrap; QA via Batch) | ~$0.15–0.30 | ~$0.90 | **~$1.10–1.30** | ~$120 |

Ranges are honest estimates around the measured bootstrap constant; a Build phase on a real feature can add $0.50–$2.00 in any configuration. Three take-aways: the repo's "$0.15–$0.45/run" is below the physical floor of its own architecture; the Haiku→Sonnet delta (~$2/run, ~$200/mo at 100 runs) is less than the cost of one security gate waving through an XSS; and **the architecture change in (e) buys more than the model downgrade ever did** — recommended-quality models at near-all-Haiku prices.

**Billing:** don't run this on a Pro/Max subscription — weekly caps (shared all-model + a model-specific cap) will kill a 15-subprocess loop nondeterministically mid-run, and once you're drawing on usage credits Claude Code silently drops the cache TTL from 1h to 5m. Use an API key, and put the flag that implements your actual constraint on every phase: `--max-budget-usd` (real, verified — my $0.05 cap correctly killed a run; note the per-subprocess floor means per-phase budgets must be ≥ ~$0.25 on Sonnet or every phase dies at bootstrap).

### Recommended routing — one model family, vary effort

Installed-CLI caveat: v2.1.50 accepts `--effort low|medium|high|max` (verified; `xhigh` rejected). Upgrade the CLI, then use this table; until then read `xhigh` as `high`.

| Phase | Model | Effort | Why |
|---|---|---|---|
| 0 Pre-Check | Sonnet 5 | medium | HARD gate; the duplicate-work catch — worth more than Haiku pattern-matching |
| 1 Requirements | Sonnet 5 | low | Extraction |
| **2 Design** | **Opus 4.8** | **high** | Live-doc research + citations; the decision phase |
| **3 Critics ×3** | **Opus 4.8** | **high** | **The single most important routing fix.** `:715` classifies adversarial critique as pattern-matching and gives it the fast model while the *aggregator* gets the strong one — exactly backwards. Critique is the multistep-reasoning task; summarizing three tables is the easy half. |
| 3 Aggregator | Sonnet 5 | medium | Synthesis of structured input |
| 4 Planning | Sonnet 5 | medium | Cross-artifact reasoning, BEFORE/AFTER fidelity |
| 5 Drift | Sonnet 5 | low–medium | Coverage mapping |
| 6 Build | Sonnet 5 | medium (xhigh on hard tasks) | The only phase needing full write access |
| 7 Denoise / 8 Fit / 10 Docs | Sonnet 5 | low | Classification/template checks; Batch API candidates |
| 9 Behavior | Sonnet 5 | medium | Must consume real exit codes (c1) |
| **11 Security** | **Sonnet 5** | **high** | HARD gate; OWASP; must leave Haiku (no effort, stale CVE knowledge) |
| 12 Commit review | Sonnet 5 | high | Fresh-context reviewer on the real diff |

`max` nowhere (overthinks structured output, violates your cost constraint). Haiku nowhere — with `effort low` available on Sonnet, Haiku's only remaining edge is latency you don't need in a batch pipeline. Fable 5 nowhere in the loop: at $10/$50 it's for the hardest interactive design sessions, not a 15-call pipeline.

**Agent files:** flip the 32 `model: haiku` pins to `inherit` and set the model at the session/orchestrator level — pinning caps 76% of the fleet at a model with no effort dial and a 200K window, and the pins invert on the two worst files (`architect-slim`/`adversarial-slim`, the "token-saving" variants, are the only two pinned to `opus`).

### Two dated items

- **2026-08-31**: Sonnet 5 intro pricing ends; every figure above written "→" moves. Date-stamp your own estimates.
- **2026-07-24** (8 days): Opus 4.7 fast mode is removed. Nothing in this repo uses it — just don't add it. Prefer explicit model IDs over floating aliases once you pin: on your v2.1.50 CLI, `sonnet` still resolves to the pre-Sonnet-5 generation; after a CLI upgrade the same alias will move.

---

## Relationship to AUDIT-2026-07-15.md

I re-tested that audit's central claims independently before reading it in detail: `--max-tokens` rejection, the CLAUDECODE guard, the `((retries++))` errexit kill, the swallowed validator counters, the compression destruction of the golden design, the fail-open jq-less hook, the dead prompts/agents/lib layers, the Phase 11 vocabulary gate, and the pricing table — **all reproduced or confirmed against source**. New in this report: the measured **40,921-token / ~$0.05–0.26 per-subprocess bootstrap with zero cross-process cache reuse** (which changes the architecture verdict from "unsound" to "economically wrong even if fixed", and falsifies README's cost range independently of everything else); the **`[r]evise` self-destruct** in `run-pipeline.sh`; the **`CLAUDE_PROJECT_DIR` exit-127** in the cache commands; **`code-scanner.md`/`suggestion-engine.md` having no frontmatter** (confirmed unregistered in a live session); the codex target's **defunct 2026 CLI flags**; the settings.json **`agentMapping` dead switch**; the demo walkthrough's wrong `@auto-pipeline` invocations; and the live-doc confirmation that Haiku 4.5 lacks effort/adaptive-thinking/compaction entirely. One correction to that audit's framing: it counted "17 `claude -p` invocations"; the precise state is 17 phase-invocation sites carrying `--max-tokens` (18 occurrences including the prose at `:2302`) plus additional bare `claude -p` calls in helper templates — the conclusion is unchanged.

---

## The honest close

You designed a good pipeline and then wrote a novel about it instead of a program. The decomposition, the gates, the pre-check idea, the prompt skeleton, and a handful of agent files are genuinely worth keeping — and nothing between Phase 0 and Phase 11 has ever executed, the instrumentation reports invented numbers, the safety hooks fail open on your own machine, and the documentation describes the novel as if it were the program. The fastest route to something real is not to fix the 2,417-line orchestrator; it is to promote the slash-command chain you already built, wire its agents to real tools and typed outputs, put one un-fakeable test signal in the loop, and let one `pipeline.sh` carry CI. Fix A1–A6, run it once end-to-end against the demo, and re-audit against evidence instead of source — everything in this report is, necessarily, a study of a system nobody has ever seen run.
