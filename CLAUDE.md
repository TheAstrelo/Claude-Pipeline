# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a provider-agnostic 13-phase (0–12) development pipeline for Claude Code
and Codex. It transforms a task description into reviewed, optionally committed
code. The single engine is `run-pipeline.sh`. Roadmap: `IMPLEMENTATION-PLAN-V2.md`;
superseded plans and audits: `docs/archive/`.

## The One Engine

`run-pipeline.sh` is the single real executable. It runs each phase as a fresh
`claude -p --no-session-persistence` or `codex exec --ephemeral` subprocess,
persists and validates the returned report, applies the gate, and optionally
commits after Phase 12.

- **`run-pipeline.sh`** — the engine. Run it directly: `bash run-pipeline.sh [options] "task"`.
- **`.claude/commands/auto-pipeline.md`** — a thin `/auto-pipeline` slash-command wrapper that
  runs the engine with `PIPELINE_NONINTERACTIVE=1` and interprets its exit code.
- The remaining slash commands (`/plan-review`, `/pipeline-scan`, `/pipeline-history`,
  `/pipeline-undo`) are interactive helpers; `/plan-review` and `/pipeline-scan` dispatch to the
  three agents in `.claude/agents/` via the Task tool. The engine does **not** use them — it
  builds every phase prompt inline in `build_prompt()`. The per-phase ladder (`/arm`, `/design`,
  `/ar`, …) was removed in Plan v2 M0 because it had drifted from the engine's contracts.

## Commands

```bash
# Run the pipeline (standalone)
bash run-pipeline.sh "add a GET /api/version endpoint"
bash run-pipeline.sh --provider=codex "add a GET /api/version endpoint"
bash run-pipeline.sh --provider=claude "add a GET /api/version endpoint"
bash run-pipeline.sh --profile=paranoid --mode=dev "handle payments"

# Demo starter project (demo/starter-project/)
npm install && npm test

# Full test battery (one command; auto-discovers every tests/*.sh suite)
bash tests/run-all.sh          # sequential
bash tests/run-all.sh -p       # parallel

# Real-provider evaluation corpus (spends money; see evals/README.md)
node evals/run-corpus.mts --dry-run
node evals/run-corpus.mts --only=express-version-endpoint --max-run-budget-usd=20
node evals/score.mts evals/results/<date>.json
```

The mocked battery proves the engine's bookkeeping and commit-integrity
invariants against scripted providers. Only the corpus under `evals/corpus/`
(sealed tasks with hidden acceptance tests, run weekly by
`.github/workflows/eval-corpus.yml`) measures whether the pipeline produces
working, non-slop code; every roadmap milestone is judged against
`evals/results/`.

Flags the engine actually parses: `--provider=auto|claude|codex`,
`--profile=yolo|fast|standard|paranoid`, `--mode=auto|dev`, `--push`
(publish the committed run branch to the remote), `--pr` (`--push` plus
pull-request guidance), `--budget=elastic|strict`,
`--skip-arm` (skip Phase 1), `--skip-ar` (skip Phase 3), `--skip-pmatch` (skip Phase 5),
`--model-strong=`, `--model-fast=`, `--max-budget-usd=` (per-phase cap), `--max-run-budget-usd=`
(whole-run cap), `--no-commit`, `--allow-dirty`, `--allow-untested-commit`
(explicit recorded no-test auto-commit waiver), `--resume=RUN_ID`,
`--policy-rollout=legacy|shadow|enforced`, `--retention-days=`,
`--retention-max-runs=`, `--help`.
Env knobs: `PIPELINE_PROVIDER_TIMEOUT_SECONDS` (default 2400),
`PIPELINE_PROVIDER_RETRIES` (default 1), `PIPELINE_AUTH_PREFLIGHT=0`,
`PIPELINE_BASELINE_CHECKS=0`, `PIPELINE_COMMAND_TIMEOUT_SECONDS` (default 900),
`PIPELINE_WORKTREE=0` (legacy in-place mode), `PIPELINE_WORKTREE_LINK_PATHS`
(gitignored build state symlinked into the run worktree; default
`node_modules .venv venv vendor`), `PIPELINE_ALLOW_REMOTE_DEPS=1` (recorded
waiver for git/https dependency specifiers), `--budget=elastic|strict` /
`PIPELINE_BUDGET_POLICY` (elastic default: a capped phase retries with a
doubled cap within the run cap, ledger-recorded; budgets are excluded from
the resume identity so a run-cap halt resumes with a higher cap),
`PIPELINE_BUDGET_EXTENSIONS` (default 2), `PIPELINE_COLLAPSE=0` (full
planning ladder in yolo/fast), `PIPELINE_BUILD_FIX_ATTEMPTS` (default 2;
in-build verify/fix loop, 0 disables).
`PIPELINE_PUSH_REMOTE` (default `origin`).
Resume requires the original task and an exact engine/config/Git/evidence
match. Still not implemented: `--template`, `--batch-qa`, `--fix`, and a
`--yolo` shorthand.

## Architecture

### The 13-Phase Pipeline

```
Phase 0:  Pre-Check          (HARD) → Find existing code/libraries before building
Phase 1:  Requirements       (SOFT) → Extract testable success criteria
Phase 2:  Design             (SOFT, STRONG model) → Architecture decisions with citations
Phase 3:  Adversarial Review (HARD, STRONG model) → 3 critic angles stress-test the design
Phase 4:  Planning           (SOFT) → Intent-level steps (file + anchor + intent + test), lint-verified
Phase 5:  Drift Detection    (SOFT) → Verify the plan covers the design
Phase 6:  Build              (HARD) → Execute the plan; halt if blocked
Phase 7:  Denoise            (NONE) → Strip debug artifacts / dead code
Phase 8:  Quality Fit        (NONE) → Types, lint, conventions
Phase 9:  Quality Behavior   (SOFT) → Gates on the REAL captured test exit code (un-fakeable)
Phase 10: Quality Docs       (NONE) → Swagger/JSDoc coverage
Phase 11: Security           (HARD) → Non-waivable deterministic scanners, then OWASP review
Phase 12: Commit Code-Review (HARD, STRONG model) → Review the real git diff, then commit on APPROVE
```

### Gate System

- **HARD gates** (0, 3, 6, 11, 12): must pass or the pipeline halts for a human (exit 3 when headless).
- **SOFT gates** (1, 2, 4, 5, 9): warn and proceed in `mixed`/`soft` mode; pause in `hard` (paranoid) mode.
- **NONE gates** (7, 8, 10): always proceed; issues are auto-fixed in place.

Phase 9's gate is driven by the **real exit code** of the project's test command, which the
orchestrator (not a model) runs and captures — the one signal a phase cannot fake.

**BLOCKER-lane calibration.** Review phases (3, 11, 12) tag findings
BLOCKER / WARN / PRE-EXISTING and may block only from the BLOCKER lane: a
defect in this change that would produce wrong behavior, data loss, a crash,
or a security breach, backed by a concrete trigger and evidence citation.
REVISE_DESIGN / REQUEST_CHANGES verdicts that cite zero BLOCKER findings are
mechanically demoted to proceed-with-notes (recorded in the ledger). Style,
lint, and docs are out of scope for gating phases — the NONE-gated phases own
them. Phase 11 additionally uses confidence bands (below 0.7 unreported,
0.7-0.8 advisory, above 0.8 with a written exploit path verdict-driving).

**Evidence-grounded gating.** Citations are verified mechanically before a
BLOCKER may gate: a Phase 3 blocker with an empty/dash Evidence cell, or a
Phase 12 blocker citing no file present in `review.diff`, is stripped from
the gate (malformed rows fail CLOSED and still gate). In `standard`/`paranoid`,
each surviving BLOCKER then faces one cheap fast-lane refuter call — only
CONFIRMED findings may trigger recovery loops or halts; REFUTED rows are
recorded in the ledger and a `.refuted` sidecar. Repo-local precedents
(`.claude/rules/review-precedents.md`) are injected into review prompts so
findings a human already judged FALSE POSITIVE are not re-raised; the
interactive gate menu's `[f]` option records them.

**Baseline verification.** At startup the engine runs the frozen
test/build/typecheck/lint/docs matrix once against the untouched baseline
tree (`PIPELINE_BASELINE_CHECKS=0` skips). Checks already failing at baseline
are reported as `FAIL_PREEXISTING` later and never gate the run. Red baseline
tests support the TDD flow: the run continues with commit armed, and the
decision lands on the FINAL test state — turned green commits normally;
still red completes review-only (never a late hard failure). Regressions the
run introduces still gate exactly as before. When a test command exists,
planning is acceptance-first: the earliest plan steps author failing tests
from the Success Criteria so Phase 9 certifies the task was done, not merely
that nothing regressed (the demo kit ships this pattern as
`src/acceptance/version.test.js`).

### Model Routing (Balanced)

Model tier and effort are independent:

- Claude: strong `claude-opus-4-8`, balanced `claude-sonnet-5`.
- Codex: strong `gpt-5.6-sol`, balanced `gpt-5.6-terra`.
- Codex Security and final review use Sol/xhigh; Design and Adversarial use
  Sol/high. Neither provider uses `max` by default.
- Routing policy `1.0` records every decision before invocation and uses
  explicit task risk/ambiguity evidence rather than model confidence. `fast`
  promotes high-risk Build and Security; `standard` additionally promotes
  high-risk Requirements/Planning and ambiguous Requirements/Planning;
  `paranoid` promotes Requirements, Planning, Drift Detection, Build, and
  Security. `yolo` remains fixed except for non-skippable high-risk Security.
- Phases 7, 8, and 10 run deterministic checks first. Clean evidence records
  `SKIP_MODEL`; findings or unavailable checks permit one balanced-lane
  remediation followed by a deterministic post-check.

### Portability: the spec is the product

`PIPELINE-SPEC.md` defines the pipeline independently of any model vendor —
roles, the worktree contract, phases/artifacts, gate semantics, the
trusted-vs-claimed evidence contract, and an **executor adapter contract**
with a capability/trust matrix (adapters lacking isolation or sandboxing run
audit-only; `paranoid` can require a strong-tier reviewer). `run-pipeline.sh`
is the reference implementation. The premise is structured distrust: any
model via any agentic runtime may produce work, but only
orchestrator-verified evidence opens the commit gate. Build/heal Claude
spawns receive a runtime-generated `--settings` file whose only hook is
protect-files (absolute path), so protected-file edits are blocked at attempt
time rather than surfacing as a late scanner BLOCK. When the auth preflight
reports no authenticated subprocess can spawn (true cloud sandboxes),
`/auto-pipeline` falls back to in-session orchestration using the engine's own
phase prompts, never auto-committing.

### Context: per-phase tool scoping

Claude isolation is credential-aware: `--bare` (CLAUDE_CODE_SIMPLE=1) reads
auth strictly from `ANTHROPIC_API_KEY`/apiKeyHelper and never OAuth, so bare
mode is used only when such a credential exists; otherwise phases run the
OAuth-compatible isolation set (explicit `CLAUDE_CODE_DISABLE_*` env, empty
settings sources, `--strict-mcp-config`) so subscription logins and Claude
Code cloud sessions work. Every Claude run starts with a cheap auth-preflight
spawn probe that halts early, with the real API error and a fix, when nested
subprocesses cannot authenticate (`PIPELINE_AUTH_PREFLIGHT=0` skips). All
provider subprocesses are wall-clock-bounded
(`PIPELINE_PROVIDER_TIMEOUT_SECONDS`, default 2400s) with one retry on
transient API errors (`PIPELINE_PROVIDER_RETRIES`). Codex production calls
require `--ignore-user-config`, suppress project-document loading, reject a
repository `.codex/config.toml`, disable supported plugin/memory/subagent
features, and use read-only/workspace-write sandboxes. Codex has no general
per-tool allowlist. Both providers turn web search off outside research
phases. Older CLIs are audit-only with `--no-commit`.

### File Structure

```
run-pipeline.sh          # THE engine (13 phases, gates, commit)
.pipeline/               # ignored run state (artifacts, worktrees, history), created on demand
evals/
├── corpus/<task>/       # sealed real-provider tasks (task.json, task.md, hidden/ acceptance tests)
├── fixtures/<name>/     # small runnable projects the corpus targets
├── results/             # corpus run results (committed by the weekly workflow)
├── run-corpus.mts        # corpus runner (node 22, no build step); score.mts summarizes results
└── *.v1.json            # frozen routing / release-SLO fixtures for the offline evaluators
tests/                   # mocked-provider battery; run-all.sh auto-discovers tests/*.sh
docs/archive/            # superseded audits, PRD, plan v1 (historical)
docs/examples/           # reference-project rules and skills (shape, not content)
.claude/
├── commands/            # auto-pipeline (engine wrapper) · plan-review · pipeline-scan · pipeline-history · pipeline-undo
├── agents/              # planner · plan-reviewer · code-scanner (interactive helpers only)
├── rules/               # YOUR project conventions (session-read); review-precedents.md is engine-read
├── hooks/               # protect-files.sh + auto-format.sh (Claude Code hooks via settings.json);
│                        #   detect-project.sh + notify.sh (wired into run-pipeline.sh startup/exit)
└── settings.json        # Claude Code hooks (protected by protect-files.sh)

demo/                    # Demo kit with a starter Express project + red acceptance test
```

### Key Execution Pattern

Each phase runs as a separate provider subprocess. Claude reports actual USD and
supports a native per-call cap. Codex reports JSONL token usage, so its
API-price-equivalent estimate can only be enforced between calls.

### Worktree isolation

Every run executes inside an engine-owned git worktree
(`.pipeline/worktrees/<run>`) created from the immutable baseline commit; the
run branch is born with the worktree. The user's checkout never changes
branch, index, or files — a dirty user tree is allowed (with a warning that
uncommitted changes are not part of the run), and results land only as the
published `pipeline/<run>` branch. Gitignored build state (`node_modules`
etc.) is shared into the worktree by symlink. A committed run removes its
worktree on completion; halted and review-only runs keep it for inspection
and `--resume`. `PIPELINE_WORKTREE=0` restores legacy in-place mode (which
requires a clean tree).

### Durable Evidence and Resume

Each run's append-only, hash-linked `ledger.jsonl` is authoritative. Model calls
and deterministic checks write distinct attempt envelopes with hashed inputs
and outputs. Atomic checkpoints reference content-addressed artifact manifests
and pin the exact candidate tree behind `refs/pipeline-checkpoints/<run>`;
`run.json` and schema-2 `.pipeline/history.json` are derived views. Resume is
Git-bound and fail-closed on run/schema/engine/config/task/baseline/branch/
worktree/verification-policy/artifact mismatch — but in worktree mode an
interrupted-mid-mutation workspace is first RESTORED to its checkpointed
candidate tree (the worktree is engine-owned, so nothing user-authored is at
risk), and every resume refusal prints a per-invariant actionable hint.
Stable prompt-prefix and cache telemetry are provider/model scoped and never
influence validation or gating.

### Security, data, and rollout controls

Security policy `1.1` scans current candidate paths and bytes for protected
files, high-confidence secrets, risky dependency sources, and escaping symlinks
before persisting `review.diff` or invoking Phase 11. A deterministic `BLOCK`
cannot be waived. Recorded allowlists keep obvious non-secrets from blocking:
values that announce themselves as placeholders (EXAMPLE/DUMMY/CHANGEME...),
generic-shaped matches (jwt, api-key) in test/fixture/example paths,
`.env.*.example`-shaped files, and `PIPELINE_ALLOW_REMOTE_DEPS=1` for
git/https dependency specifiers. Live-shaped credentials (AKIA…, ghp_…, key
blocks) block even in fixtures. Every allowlist hit is a durable waiver
recorded in the scanner evidence and counted in the ledger event — nothing is
silently dropped. Provider and trusted-command output is redacted before
durable processing. Retention is disabled by default and only prunes terminal
run directories when explicitly configured.

`--policy-rollout=shadow` records deterministic/adaptive recommendations while
retaining baseline calls and disabling commit. `legacy` restores fixed,
model-first behavior for rollback. `enforced` is the default.

## Profiles

| Profile | Skip Phases | Gate Mode | Planning | Use Case |
|---------|-------------|-----------|----------|----------|
| `yolo` | 3, 5, 7, 8, 9, 10 | soft | collapsed | Fast prototyping |
| `fast` | 7, 8, 9, 10 | standard | collapsed | Feature dev, keep adversarial + security |
| `standard` | none | mixed | full ladder | Normal development (default) |
| `paranoid` | none | hard | full ladder | Production / payments / auth |

**Collapsed planning** (`yolo`/`fast`; `PIPELINE_COLLAPSE=0` opts out): one
strong-model call produces brief + design + plan, split into the three
standard artifacts — validators, adversarial review, and build consume
exactly the files they always did. Phase 5 auto-skips when plan and design
came from the same call and the design was never revised; a Phase 3 recovery
that revises the design triggers a normal plan regeneration.

## Validation Philosophy

Gates are mechanically enforced. File existence, pattern/count thresholds, and
typed verdicts make contracts parseable; design/security/review quality still
depends on model judgment. Phase 9 supplies independent runtime evidence:

- **Phase 9 test-exit-code gate** — the orchestrator runs the project's real test command and
  gates on its captured exit code (`run_tests()` / `validate_phase_9`). A green run
  produces deterministic evidence without a provider call.
- **Deterministic QA routing** — Phases 7, 8, and 10 inspect the candidate tree
  before using a model. Clean evidence skips the call; findings or unavailable
  checks allow one remediation and a deterministic post-check.
- **Deterministic security gate** — current-generation scanner evidence must
  pass before the Phase 11 model receives the canonical candidate.
- **Evidence freshness** — the orchestrator runs its frozen test/build/typecheck/
  lint/docs matrix after Phase 10 and every Phase 12 heal. A heal also forces a
  new Phase 11 security review.
- **Verification integrity** — trusted argv, selected package scripts, package
  manager, timeout, and executable identities are frozen at startup. Descriptor
  drift or verifier mutation is a non-overridable halt.
- **Commit integrity** — security and review attest the exact diff/tree. The
  engine creates a commit from that reviewed tree, verifies its immutable parent,
  and publishes the run branch with a compare-and-swap ref update.
- **Verdicts** — Codex constrains phases 3, 11, and 12 with JSON Schema; Claude
  uses an anchored markdown fallback.

Codex gating phases use a typed `{artifact, verdict}` output schema. Claude
gating phases retain anchored verdict parsing because structured output has
failed on the Opus/high path in this workload.

## Auto-Recovery Loops

- Phase 3 `REVISE_DESIGN` → feed the critique back to Phase 2, re-review; recovery
  runs before a HARD-gate human halt.
- Phase 4 plan lint → plans are intent-level (file + anchor + intent + test,
  never exact BEFORE/AFTER blocks); a deterministic lint verifies every
  MODIFY path exists and every anchor literally occurs in its file BEFORE
  Phase 6 spends anything, with one bounded re-plan seeded by the exact lint
  findings.
- Phase 6 verify-inside-build → the frozen test/typecheck commands run
  immediately after the build; failures get up to `PIPELINE_BUILD_FIX_ATTEMPTS`
  in-phase fix calls seeded with the real failing output. Advisory only —
  Phase 9 and release verification remain the authoritative gates.
- Phase 5 `DRIFT_DETECTED` → add the missing plan steps, re-check; recovery runs
  before paranoid-mode escalation.
- Phase 12 `REQUEST_CHANGES` → feed the review findings to a fix pass, re-test, re-review
  (max `MAX_CODE_REVIEW_HEALS`, default 2); halt for a human only after the heals are exhausted.
  Security is rerun after each heal. The engine commits only an `APPROVE` candidate
  whose verified, security-scanned, reviewed, and exact commit trees match;
  pipeline scratch under `.pipeline/` is ignored and excluded.

The Bash engine does not currently implement a per-step Phase 6 retry loop.

## Rules Integration

`.claude/rules/*.md` are loaded as project instructions in every Claude Code
session. Put YOUR project's conventions there. The engine
(`run-pipeline.sh`) does not read them; only interactive Claude Code sessions
do — except
`.claude/rules/review-precedents.md`, which the engine appends to the
Phase 3/11/12 review prompts (it accumulates findings you mark as false
positives).

A worked example of convention rules from a real Next.js + PostgreSQL app
lives in `docs/examples/reference-project-rules/` (api/database/react). Those are
that project's specifics — imitate their shape, not their content. They used
to sit in `.claude/rules/`, where copying `.claude/` into another project
silently injected the wrong schema and conventions; they were relocated so
that no longer happens.
