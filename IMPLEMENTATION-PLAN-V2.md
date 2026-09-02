# Implementation Plan v2 — From Integrity Ceremony to Code Quality

Successor to `IMPLEMENTATION-PLAN.md` (M0–M5, all landed). Driven by the
September 2026 review of the current engine: the design is right (fresh
process per phase, orchestrator-run tests as the only trusted signal,
worktree isolation, commit-from-the-reviewed-tree, BLOCKER-lane gating) and
the implementation spends its effort on the wrong axis. About three quarters
of `run-pipeline.sh` is bookkeeping that never decides anything, while the
inputs that decide whether code is slop — model, effort, context,
conventions, reviewer tooling, verification proofs — are thin. Every gate
calibration to date was made on the basis of one live run.

**Thesis.** Keep the design. Replace the substrate. Redirect the engineering
budget from integrity ceremony to (1) the inputs each model call gets,
(2) proofs the orchestrator can compute without a model, and (3) an
evaluation harness that measures real outcomes on real tasks.

**Operating assumptions** (stated so work can start without a round-trip;
override any of them and the plan re-sequences, it does not collapse):

1. The rewrite is TypeScript on the Claude Agent SDK, with Codex as a
   subprocess adapter. Node is already a hard dependency of the bash engine
   (114 `node -e` spawns), so this adds no runtime requirement.
2. `run-pipeline.sh` stays as the reference implementation until the new
   engine reaches parity on the eval corpus, then it is deleted. No
   feature work lands in bash after M2.
3. Default quality preset is `max` (money is not the constraint); budgets
   are opt-in so the open-source audience can cap spend.
4. The per-phase slash-command ladder (`/arm`, `/design`, `/ar`, `/plan`,
   `/pmatch`, `/build`, `/qb`, `/qd`, `/qf`, `/denoise`, `/security-review`)
   is deleted rather than regenerated. `/auto-pipeline`, `/pipeline-history`,
   `/pipeline-undo`, `/pipeline-scan`, `/plan-review` stay.
5. `PIPELINE-SPEC.md` remains the product; each milestone that changes a
   contract updates the spec in the same change.

## Success metrics

Measured on the eval corpus (M1) at every milestone, reported in
`evals/results/<date>.json`.

| Metric | Now | Target |
|---|---|---|
| Hidden-acceptance pass rate on the corpus | unmeasured | ≥ 80% at `max`, and never regress between milestones |
| Seeded-defect catch rate (bug / secret / injection tasks) | unmeasured | 100% for secrets, ≥ 90% for bugs and injection |
| Halts per completed task (hard halts on routine tasks) | unmeasured | 0 on the routine subset |
| Slop score (new deps, debug output, comment-ratio delta, diff size vs reference) | unmeasured | reported; trend down |
| Engine overhead per run, zero model time | 44–57 s | < 5 s |
| Engine size | 8,189 lines bash + ~2,500 lines embedded JS | ≤ 3,000 lines TS, no embedded shell heredocs |
| Model calls per routine `max` run | 9–13 | 6–8 |
| Test battery wall-clock | 18–22 min | < 5 min unit + integration; corpus runs are a separate weekly job |
| Root markdown | 264 KB / 10 files | ≤ 60 KB / 4 files |

## Milestone 0 — Cleanup and truth (S, no engine behavior change)

Cheap, independent, and it removes confusion for everything that follows.

1. Delete: `AUDIT-FABLE.md`, `PIPELINE-DESIGN.md`, `.codex/agents/`,
   `.codex/hooks/`, `.codex/hooks.json`, `.claude/AGENTS.md`,
   `.claude/history.json`, `.claude/templates/`, the per-phase slash
   commands (assumption 4), and the 15 `.claude/agents/*.md` reachable only
   from them (keep `plan-reviewer.md`, `planner.md`, `code-scanner.md` for
   the commands that stay). Remove the `.codex/hooks` fallback at
   `run-pipeline.sh:911-912`.
2. Move: `PIPELINE-AUDIT-2026-07.md`, `PIPELINE-AUDIT-2026-08.md`,
   `DETERMINISTIC-FIRST-PRD.md` → `docs/archive/` with a two-line
   "superseded by" banner. `IMPLEMENTATION-PLAN.md` → `docs/archive/`.
   `examples/` → `docs/examples/`. `.claude/skills/` and `.agents/skills/`
   (both RDO-specific) → `docs/examples/reference-project-skills/`.
3. `AGENTS.md` becomes a ten-line pointer at `CLAUDE.md`. `README.md`: cut
   the Templates and Intelligent Suggestions sections, fix the undo, Phase 4,
   dev-mode, and auto-format claims, regenerate the file tree, add a
   config-knob table generated from the engine's `${PIPELINE_*:-default}`
   lines, and say plainly that `.claude/rules/` is not engine-read.
4. Demo: make the documented task the `GET /api/version` task the shipped
   red acceptance test expects; setup does `git init && git commit`; fix the
   broken fences in `demo/README.md:68-78`; regenerate `expected-output/`
   from a real run in M1.
5. Hooks: `.claude/hooks/` is the single source; quote-escape the task
   before `notify.sh`; fix `detect-project.sh` default language and the
   `"next"` substring precedence.

*Acceptance:* `bash tests/run-all.sh` still green; no file under `.claude/`
mentions "RDO" or pins `haiku`; root markdown ≤ 60 KB.

## Milestone 1 — The evaluation harness (M, the prerequisite for everything)

This is the thing the project has never had. Without it every later change
is another guess. It is built against the *current* bash engine first so
the rewrite in M3 has a baseline to beat.

1. **Corpus layout** `evals/corpus/<task-id>/`:
   - `task.md` — exactly what the pipeline sees.
   - `fixture/` — a small committed repo (or a pointer to a shared fixture
     under `evals/fixtures/<name>`), never containing the acceptance tests.
   - `hidden/` — acceptance tests copied into the result tree *after* the
     run, plus a `rubric.json` (must-touch files, must-not-touch files,
     forbidden new dependencies, expected diff size band).
   - `seed.json` for negative tasks (the planted bug, secret, or injection
     sink and the check that proves it was caught).
2. **Initial corpus (10 tasks, grow to 30):** 5 routine tasks on the Express
   demo (version endpoint, validation on an existing route, pagination,
   a middleware, a small refactor with a behavior-preserving test); 2 on a
   TypeScript library fixture; 1 on a Python FastAPI fixture; 1 on a Go CLI
   fixture; 3 negative tasks (fix a seeded bug whose test exists; a task
   whose obvious solution leaks a real-shaped secret; a task with an
   injection sink in the touched path). At least two tasks must be
   deliberately terse ("add caching to the items route") to exercise the
   assumptions path.
3. **Runner** `evals/run-corpus.ts` (this is the first TypeScript in the
   repo and seeds the M3 toolchain): for each task, copy the fixture to a
   temp dir, `git init && git commit`, run the engine with `--no-commit`
   (or commit to the run branch and inspect it), copy `hidden/` in, run the
   hidden tests, apply the rubric, collect cost/tokens/wall-clock/halts
   from the run artifacts, compute the slop score, write one JSON row.
   `--engine=bash|ts` selects the implementation so M3 can run both.
4. **Scoring** `evals/score.ts`: pass rate, catch rate, halts, cost,
   wall-clock, slop score, plus a per-task diff against the previous
   result file so regressions are named, not averaged away.
5. **Golden model outputs** `tests/fixtures/model-outputs/<role>/*.md`:
   every real report the corpus runs produce is kept (redacted). Parser
   tests (`read_verdict`, BLOCKER counting, plan lint today; the zod
   schemas in M3) run against these, including the known failure shapes
   (bold severity cells, bulleted findings, `APPROVED` vs `APPROVE`,
   restated digests, missing Evidence column).
6. **Adapter failure stubs** in the existing shell suites: provider
   timeout (exit 124), `error_max_budget_usd`, `api_error` retry, malformed
   JSON, empty result, non-zero exit. These paths are dead in every current
   test.
7. **CI:** keep the mocked battery on push. Add
   `.github/workflows/eval-corpus.yml` on `workflow_dispatch` and a weekly
   cron, gated on a provider secret, with `--max-run-budget-usd` set, and
   the results file committed to `evals/results/` by the workflow.

*Acceptance:* one full corpus run against the bash engine committed as the
baseline; parser tests pass against ≥ 20 golden outputs; the six adapter
failure stubs exercise `run_claude`/`run_codex` error branches.

## Milestone 2 — Quick wins on the existing engine (S–M, days not weeks)

Each of these is a small, local change to `run-pipeline.sh` or a prompt,
lands value immediately, and validates the prompt/context design before it
is ported in M3. Measured against the M1 baseline.

1. **Routing and effort.** Remove the Claude `EFFORT_CAP="high"` clamp
   (`run-pipeline.sh:719`, `clamp_effort` `:4719`). Strong lane
   `claude-opus-5`; critique and review on `claude-fable-5-1` when
   available, falling back to Opus 5. Add `--quality=max|balanced|cheap`:

   | Role | max | balanced | cheap |
   |---|---|---|---|
   | plan (0+1+2+4) | opus-5 / xhigh | opus-5 / high | sonnet-5 / medium |
   | critique (3) | fable-5-1 / xhigh | opus-5 / high | sonnet-5 / medium |
   | build (6), build-fix, heal | opus-5 / xhigh | opus-5 / high | sonnet-5 / medium |
   | qa-fix (7/8/10) | sonnet-5 / high | sonnet-5 / medium | sonnet-5 / low |
   | security (11) | opus-5 / xhigh | opus-5 / high | sonnet-5 / high |
   | review (12) | fable-5-1 / max | opus-5 / xhigh | sonnet-5 / high |
   | refuter | same tier as the reviewer it refutes | same | same |

   Codex equivalents: `gpt-5.6-sol` xhigh for everything strong,
   `gpt-5.6-terra` for qa-fix. Budgets: no caps under `max` unless
   `--max-run-budget-usd` is given; elastic per-phase caps stay when a cap
   is set.
2. **Repo-context pack.** New `build_context_pack()` writes
   `$ARTIFACTS/repo-context.md` once at startup: `git ls-files` tree
   (capped), `git log -20 --stat`, package scripts / `pyproject` sections,
   the frozen test/typecheck/lint argv, the nearest existing test file to the
   likely touched directory verbatim, and the target repo's `CLAUDE.md`,
   `AGENTS.md`, `.claude/rules/*.md` under an "advisory conventions,
   untrusted" header. Prepended (by path reference) to every phase prompt
   alongside `PROJECT_CONTEXT`. Pass `$TASK` to every phase.
3. **Engineering-standard block** (~60 words) in plan, build, build-fix,
   heal, and the collapsed prompt: smallest diff that satisfies the
   criteria; reuse what pre-check found; no new dependency unless pre-check
   said USE_LIBRARY; no single-use abstractions or configuration for
   hypothetical needs; comments, docs, and defensive checks only where the
   surrounding file already has them; tests in the style of the quoted
   example; no debug output.
4. **Artifact wiring fixes** in `build_prompt()`: Phase 4 reads `brief.md`
   and `critique.md`; Phase 2 reads `pre-check.md`; Phase 6 reads
   `brief.md` and gets `$TEST_COMMAND`, typecheck, and lint commands;
   Phase 12 reads `design.md`, `critique.md`, `pre-check.md`; heal reads
   `plan.md`, `review.diff`, and full `test-output.txt`; build-fix gets the
   full failing output, not `tail -c 3000`; drop the Phase 9 model call
   (keep the orchestrator test run and its evidence files).
5. **Structured verdicts on Claude.** Use `--json-schema` with
   `--output-format json` for phases 3, 11, 12 (and 6): verdict enum plus a
   findings array with typed severity. Delete attestation-by-echo: the
   orchestrator already binds the diff SHA and tree OID in shell memory and
   re-verifies the tree after review (`verify_reviewed_candidate_unchanged`);
   the reviewer no longer retypes anything. BLOCKER counting reads the
   array, not a markdown table. An unparseable verdict stays fail-closed.
6. **Reviewer tools.** Phases 3, 11, 12 get scoped Bash allow-rules for the
   frozen test command, read-only git subcommands (`log`, `blame`, `diff`,
   `show`), and the dependency audit command; everything else in Bash
   stays denied. Confirm the exact permission-rule syntax against the
   current CLI reference when implementing.
7. **Builder guardrails.** Extend `build_phase_settings_file()` with a
   PreToolUse hook denying `git commit|push|reset|checkout|rebase`,
   `npm publish`, `curl`, `wget`; add `auto-format.sh` as PostToolUse so
   Phase 8 is almost always CLEAN. Add one self-review turn to the build
   prompt: re-read your own diff against the engineering standard before
   returning.
8. **Prompt trims.** Phase 0 web search only when the task names an
   external library or pre-check finds no codebase match; Phase 2 "cite a
   URL" only for external APIs, with a "trivial change, one decision"
   escape; Phase 10's swagger rule fires only if the repo already has at
   least one documented route.

*Acceptance:* corpus pass rate and slop score improve over the M1
baseline; zero hard halts on the routine subset; `read_verdict` and
markdown BLOCKER parsing are no longer on the gating path for Claude.

## Milestone 3 — The TypeScript engine (L, the substrate change)

Built in `engine/` alongside the bash engine, validated against the same
mocked scenarios and the M1 corpus, then cut over.

**Spike first (1–2 days, before committing to the milestone):** verify the
Agent SDK authenticates in the same environments the CLI does
(subscription/OAuth login, API key, Claude Code cloud sessions). This is the
exact failure class that produced M0. If the SDK cannot authenticate where
`claude -p` can, the adapter shells out to `claude -p` behind the same
interface and the SDK is used only where it works.

**Layout (line estimates, target ≤ 3,000 total):**

| Module | Responsibility | Lines |
|---|---|---|
| `engine/src/cli.ts` | flags, presets, `--resume`, exit codes 0/1/3/4 | 150 |
| `engine/src/config.ts` | profiles, quality presets, routing table, budget policy | 120 |
| `engine/src/git.ts` | worktree create/remove, candidate index and tree OID, review diff, `commit-tree` + compare-and-swap ref update, publish | 250 |
| `engine/src/checks.ts` | detect and freeze verification commands (npm/pnpm/yarn/bun, go, cargo, pytest, plus an explicit `pipeline.json` override), trusted command runner with timeout and process-group kill, exit classification, baseline matrix, pre-existing failure tagging | 300 |
| `engine/src/context.ts` | repo-context pack | 120 |
| `engine/src/providers/types.ts` | adapter contract from `PIPELINE-SPEC.md` §6: `(prompt, model, effort, tools, sandbox, schema, budget) → (report, structured, usage, exit)` plus a capability record | 60 |
| `engine/src/providers/claude.ts` | Agent SDK `query()` wrapper: model, effort, allowedTools/disallowedTools, hooks (PreToolUse deny list, PostToolUse format), `outputFormat` JSON schema, `maxBudgetUsd`, `settingSources: []`, cwd, add-dirs, timeout, one transient retry | 200 |
| `engine/src/providers/codex.ts` | `codex exec` subprocess with `--output-schema`, sandbox selection, the same retry | 150 |
| `engine/src/roles/{plan,critique,build,qafix,security,review}.ts` | prompt builder, zod output schema, tool scope, validator, recovery handler per role | 6 × 120 |
| `engine/src/gates.ts` | verdict types, BLOCKER lane, demotion, refuter, precedents injection, gate modes | 200 |
| `engine/src/proofs.ts` | red-then-green, changed-files ⊆ plan, scanner adapters, mutation and coverage adapters (M4) | 250 |
| `engine/src/run.ts` | the stage machine, one JSON checkpoint per stage, resume = load checkpoint + verify base HEAD and engine version + re-enter worktree | 300 |
| `engine/src/ledger.ts` | append-only JSONL events with a sequence number; no hash chain | 60 |
| `engine/src/report.ts` | run summary, `run.json`, history index | 100 |

**Dropped outright** (no replacement): hash-linked ledger, content-addressed
object store and manifests, attempt envelopes and worktree fingerprints per
attempt, run identity beyond base HEAD + engine version + task hash,
operational dashboard and SLO report, retention policy, policy rollout
modes, routing decision records, stable-prefix cache telemetry,
attestation-by-echo, the artifact-directory fingerprint guard, the five
duplicated check runners, the 27-spawn checkpoint loader.

**Kept in spirit, ported verbatim where possible:** worktree isolation,
verification-plan freezing and drift detection, trusted command runner,
candidate tree capture, security scanner preflight (as a module with
tests), `commit-tree` from the reviewed tree with CAS publish, BLOCKER lane
and demotion, bounded recovery loops, precedents file, `--push`/`--pr`.

**Phase collapse (this milestone, not bash):** six model roles for every
profile. Plan = pre-check + requirements + design + plan in one strong
call with the four sections as structured output (the same split the
collapsed mode already does). Critique stays a separate fresh process.
Build includes the verify-inside-build loop and the self-review turn.
QA-fix runs only when the deterministic checks (denoise regexes, lint,
typecheck, docs-convention rule) report findings. Security and Review as
today, with structured output. Drift detection becomes deterministic:
every Success Criterion must be referenced by at least one plan step and
one test, checked by id; otherwise it is a WARN into Critique. Phase 9's
model call is gone; the orchestrator test run remains the gate.

**Tests:** vitest. Unit tests for parsers against the M1 golden fixtures;
integration tests that re-express the existing shell scenarios
(resume kill matrix, anchor forgery, heal ordering, scanner BLOCK, push to
bare remote) using an in-process fake adapter instead of fake binaries —
no `PATH` games, sub-second runs. The bash battery keeps running until
cutover.

*Acceptance:* the TS engine passes every re-expressed scenario; corpus
results ≥ the M2 bash results on every metric; overhead < 5 s; then
`run-pipeline.sh` and the shell suites are deleted and `/auto-pipeline`
launches the TS binary.

## Milestone 4 — Deterministic proofs (M, no model calls)

All advisory into Review unless stated; all recorded as evidence files.

1. **Red-then-green.** From the diff, identify new or changed test files
   (path patterns plus the plan's test steps). In a temp worktree at the
   baseline commit, copy only those test files in, run the frozen test
   command, require a non-zero exit. Record `acceptance-red.json`. A task
   with a test command whose new tests were green on baseline is a WARN in
   Review ("acceptance tests do not prove the change").
2. **Scope proof.** `git diff --name-only` must be a subset of the plan's
   `File:` list; extras are listed in the Review prompt as unplanned
   changes.
3. **Real scanners in the security preflight**, availability-gated:
   `gitleaks` (secrets; a hit is a non-waivable BLOCK, the existing regex
   scanner stays as fallback), `semgrep` with the default ruleset on
   changed files, and the ecosystem audit (`osv-scanner`, else
   `npm audit` / `pip-audit` / `cargo audit` / `govulncheck`). Missing tools
   are recorded as `UNAVAILABLE`, never silently skipped; the Security
   prompt receives the actual results.
4. **Mutation testing on changed functions**, time-boxed: Stryker (JS/TS),
   mutmut (Python), cargo-mutants (Rust), gremlins (Go). Survived-mutant
   list goes to Review as advisory evidence.
5. **Changed-line coverage delta** when a coverage tool is present (c8,
   coverage.py, cargo-llvm-cov, `go test -cover`); uncovered changed lines
   are listed for Review.

*Acceptance:* the three negative corpus tasks are caught deterministically
before any model reviews them; red-then-green fires on every routine task
that has a test command.

## Milestone 5 — Cross-model review (S–M)

1. Under `--provider=auto` with both CLIs installed, Review and Critique run
   on a different vendor than Build (Claude builds → Codex Sol xhigh
   reviews, and vice versa). With one vendor, two independent reviewers on
   different models of that family (Fable 5.1 and Opus 5).
2. Merge rule: BLOCKER union; both reviewers must APPROVE to commit; each
   surviving BLOCKER is refuted by the *other* reviewer's family at the
   same tier.
3. Reviewer floor from the spec (`paranoid` demands a strong-tier
   reviewer) is enforced in `config.ts`.

*Acceptance:* the seeded-bug corpus task is caught by at least one reviewer
in ≥ 90% of runs; false-halt rate on routine tasks does not rise.

## Milestone 6 — Delivery and cloud (S)

1. `--pr` opens a draft PR whose body is generated from `run.json`:
   criteria coverage, test evidence, scanner and proof results, reviewer
   verdicts, cost.
2. Cloud sessions: the TS engine is subprocess-based like the CLI; where no
   authenticated subprocess can spawn, `/auto-pipeline` runs the six roles
   in-session via the Agent tool with the same prompts, schemas, and the
   real test run, never auto-committing. The per-phase agent files it
   needs are generated from `engine/src/roles/*` so they cannot drift.

## Sequencing and effort

| Order | Milestone | Size | Depends on |
|---|---|---|---|
| 1 | M0 Cleanup | S | — |
| 2 | M1 Eval harness | M | M0 (demo fixed) |
| 3 | M2 Quick wins in bash | S–M | M1 (baseline to compare) |
| 4 | M3 TS engine + phase collapse | L | M1 (corpus), M2 (validated prompts/context) |
| 5 | M4 Deterministic proofs | M | M3 |
| 6 | M5 Cross-model review | S–M | M3 |
| 7 | M6 Delivery and cloud | S | M3 |

M4 and M5 are independent of each other and can run in parallel after M3.
One milestone per branch and PR; the corpus runs at the end of each.

## Risks and how the plan handles them

- **SDK authentication in OAuth and cloud environments.** Handled by the
  M3 spike and the shell-out fallback behind the same adapter interface.
- **Fable 5.1 availability** (30-day retention requirement, refusal stop
  reason). `config.ts` falls back to Opus 5 per role; the adapter surfaces a
  refusal as a retry on the fallback model, recorded in the ledger.
- **Cost at `max`.** A routine run is roughly 6–8 strong calls plus two
  reviewers; expect tens of dollars per run and a few hundred per weekly
  corpus run. The opt-in run cap and `balanced`/`cheap` presets exist for
  contributors; the corpus workflow always sets a cap.
- **Scanner and mutation tool availability across platforms.** Every
  external tool is availability-gated and recorded as `UNAVAILABLE`; none
  is required for a run to complete, and gitleaks is the only one that can
  block.
- **Test-command detection breadth.** The TS engine adds an explicit
  `pipeline.json` override (test/build/typecheck/lint argv) so projects
  with custom build systems are first-class instead of undetected.
- **Prompt style on Fable-class models.** Anthropic's guidance is that
  prompts written for prior models are often too prescriptive. The role
  prompts shrink to contract + engineering standard + evidence; format
  is carried by the output schema, not by prose.

## Standing rules (carried over, unchanged)

- Every gate change ships with a corpus case or a golden fixture.
- Anything dropped, waived, or demoted is a ledger event.
- No new model-judgment gates; new checks are deterministic or
  evidence-grounded.
- Prompt scaffolding shrinks over time; when a role misbehaves, prefer
  better evidence in the prompt or a deterministic check outside the model.
