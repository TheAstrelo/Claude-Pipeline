# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is a provider-agnostic 13-phase (0–12) development pipeline for Codex and
Claude Code. It transforms a task description into reviewed, optionally
committed code. The single engine is `run-pipeline.sh`.

## The One Engine

`run-pipeline.sh` is the single real executable. It runs each phase as a fresh
`codex exec --ephemeral` or `claude -p --no-session-persistence` subprocess,
persists the final report, validates it, applies the gate, and optionally
commits after Phase 12.

- **`run-pipeline.sh`** — the engine. Run it directly: `bash run-pipeline.sh [options] "task"`.
- **`.claude/commands/auto-pipeline.md`** — a thin Claude `/auto-pipeline` wrapper that
  runs the engine with `PIPELINE_NONINTERACTIVE=1` and interprets its exit code.
- Codex runs the engine directly. The files under `.codex/agents/` are optional
  interactive helpers and are not used by the engine.

## Commands

```bash
# Run the pipeline (standalone)
bash run-pipeline.sh "add a GET /api/version endpoint"
bash run-pipeline.sh --provider=codex "add a GET /api/version endpoint"
bash run-pipeline.sh --provider=claude "add a GET /api/version endpoint"
bash run-pipeline.sh --profile=paranoid --mode=dev "handle payments"

# Demo starter project (demo/starter-project/)
npm install && npm test
```

Flags the engine actually parses: `--provider=auto|claude|codex`,
`--profile=yolo|fast|standard|paranoid`, `--mode=auto|dev`,
`--skip-arm` (skip Phase 1), `--skip-ar` (skip Phase 3), `--skip-pmatch` (skip Phase 5),
`--model-strong=`, `--model-fast=`, `--max-budget-usd=` (per-phase cap), `--max-run-budget-usd=`
(whole-run cap), `--no-commit`, `--allow-dirty`, `--allow-untested-commit`,
`--resume=RUN_ID`, `--policy-rollout=legacy|shadow|enforced`,
`--retention-days=`, `--retention-max-runs=`, `--help`, plus `--push` (publish the committed
run branch to the remote) and `--pr` (`--push` plus PR guidance). Resume requires the original
task and an exact engine/config/Git/evidence match. Still not implemented:
`--template`, `--batch-qa`, `--fix`, and a `--yolo` shorthand.

## Architecture

### The 13-Phase Pipeline

```
Phase 0:  Pre-Check          (HARD) → Find existing code/libraries before building
Phase 1:  Requirements       (SOFT) → Extract testable success criteria
Phase 2:  Design             (SOFT, STRONG model) → Architecture decisions with citations
Phase 3:  Adversarial Review (HARD, STRONG model) → 3 critic angles stress-test the design
Phase 4:  Planning           (SOFT) → Exact BEFORE/AFTER code for every change
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

### Model Routing (Balanced)

Model tier and reasoning effort are routed independently.

- Codex: strong `gpt-5.6-sol`, balanced `gpt-5.6-terra`; Security and final
  review use Sol/xhigh.
- Claude: strong `claude-opus-4-8`, balanced `claude-sonnet-5`; Design,
  Adversarial, and final review use Opus/high.
- Neither provider uses `max` by default.
- Routing policy `1.0` records every selection before invocation. It uses only
  explicit task risk/ambiguity evidence: `fast` promotes high-risk Build and
  Security; `standard` also promotes high-risk Requirements and Planning plus
  ambiguous Requirements/Planning; `paranoid` promotes Requirements, Planning,
  Drift Detection, Build, and Security. `yolo` remains fixed except for
  non-skippable high-risk Security.
- Phases 7, 8, and 10 run deterministic checks first. A clean result records
  `SKIP_MODEL`; findings or unavailable checks permit one balanced-lane
  remediation call followed by a deterministic post-check.

### Context: per-phase tool scoping

Claude production subprocesses require `--bare`, load only the built-in tools
their phase needs, use an empty settings-source set plus `--strict-mcp-config`,
and disable CLAUDE.md/auto-memory/background features. Codex production
subprocesses require `--ignore-user-config`, suppress project-document loading,
reject a repository `.codex/config.toml`, disable supported
plugin/memory/subagent features, and enforce read-only/workspace-write
sandboxes. Codex still has no general per-tool allowlist. Both providers disable
web search outside research phases. Older CLIs are audit-only with
`--no-commit`.

### File Structure

```
run-pipeline.sh          # THE engine (13 phases, gates, commit)
.pipeline/                # ignored run artifacts and history
evals/                    # frozen routing and release-SLO corpora/reports
tests/                    # provider, deterministic-first, M2, M3, and M4 fixtures
.claude/
├── commands/            # 17 slash commands (auto-pipeline.md is the engine wrapper)
├── agents/              # 15 agents — the set reachable from a live slash command
│                        #   (interactive helpers only; the engine inlines its prompts)
├── rules/               # YOUR project conventions; review-precedents.md is engine-read
├── templates/           # Pattern references (api-endpoint, auth-flow, crud-page, webhook)
├── skills/              # Scaffolding skills (new-migration, scaffold-api)
├── hooks/               # protect-files.sh + auto-format.sh (Claude hooks via settings.json);
│                        #   detect-project.sh + notify.sh (wired into run-pipeline.sh startup/exit)
└── settings.json        # Claude Code hooks (protected by protect-files.sh)

demo/                    # Demo kit with a starter Express project + red acceptance test
```

### Key Execution Pattern

Each phase runs as a separate provider subprocess. Claude reports actual USD and
has a native per-call cap. Codex reports JSONL token usage; the engine computes
an API-price-equivalent estimate and can enforce it only between calls.

### Durable Evidence and Resume

Each run's append-only, hash-linked `ledger.jsonl` is authoritative. Model calls
and deterministic checks write distinct attempt envelopes with hashed inputs
and outputs. Atomic checkpoints reference content-addressed artifact manifests;
`run.json` and schema-2 `.pipeline/history.json` are derived views. Resume is
Git-bound and fail-closed on run/schema/engine/config/task/baseline/branch/
worktree/verification-policy/artifact mismatch. Stable prompt-prefix and cache
telemetry are provider/model scoped and never influence validation or gating.

### Security, data, and rollout controls

Security policy `1.0` scans candidate paths and bytes for protected control/
secret files, high-confidence secret signatures, unbounded or remote dependency
sources, and escaping symlinks before `review.diff` is persisted or Phase 11 is
called. A deterministic `BLOCK` cannot be waived by a model. Provider stdout,
stderr, reports, and trusted-command output pass through redaction policy `1.0`
before durable processing. Retention is disabled by default and, when explicitly
configured, removes only terminal run directories while preserving current,
running, malformed, and symlinked entries.

Policy rollout defaults to `enforced`. `shadow` retains baseline calls, records
recommendations, and disables commit. `legacy` restores fixed/model-first
behavior as the rollback path without weakening final verification, security,
or exact-tree publication.

## Profiles

| Profile | Skip Phases | Gate Mode | Use Case |
|---------|-------------|-----------|----------|
| `yolo` | 3, 5, 7, 8, 9, 10 | soft | Fast prototyping |
| `fast` | 7, 8, 9, 10 | standard | Feature dev, keep adversarial + drift + security |
| `standard` | none | mixed | Normal development (default) |
| `paranoid` | none | hard | Production / payments / auth |

## Validation Philosophy

Gates are mechanically enforced. File existence, pattern/count thresholds, and
typed verdicts make contracts parseable; design/security/review quality still
depends on model judgment. Phase 9 supplies independent runtime evidence:

- **Phase 9 test-exit-code gate** — the orchestrator runs the project's real test command and
  gates on its captured exit code (`run_tests()` / `validate_phase_9`).
- **Deterministic QA routing** — Phases 7, 8, and 10 inspect the candidate tree
  first and skip the provider on clean evidence. Their scans are conservative;
  final verification and security remain authoritative.
- **Deterministic security gate** — Phase 11 receives scanner evidence only
  after a current-generation candidate passes the non-waivable scanner policy.
- **Frozen release verification** — trusted test/build/typecheck/lint/docs argv,
  package scripts, package manager, timeout, and executable identities are
  digest-bound at startup. Descriptor drift or verifier mutation halts.
- **Exact-tree publication** — security and review attest the same diff/tree;
  the engine verifies a commit object containing that exact tree and immutable
  parent, then advances the run branch with compare-and-swap `update-ref`.
- **Verdicts** — Codex constrains phases 3, 11, and 12 with JSON Schema; Claude
  uses an anchored markdown fallback.

Codex gating phases use an output schema with `{artifact, verdict}`. Claude
gating phases use anchored verdict parsing because structured output has failed
on the Opus/high path in this workload.

## Auto-Recovery Loops

- Phase 3 `REVISE_DESIGN` → feed the critique back to Phase 2, re-review (max 1).
- Phase 5 `DRIFT_DETECTED` → add the missing plan steps, re-check (max 1).
- Phase 12 `REQUEST_CHANGES` → feed the review findings to a fix pass, re-test, re-review
  (max `MAX_CODE_REVIEW_HEALS`, default 2); halt for a human only after the heals are exhausted.
  Commits the diff only on an `APPROVE` verdict, and only the built code (pipeline scratch under
  `.pipeline/` is ignored and excluded from the commit).

The engine does **not** currently implement a Bash-owned per-step Phase 6 retry
loop. Do not claim that it does.

## Rules Integration

When generating code for projects using this pipeline, follow conventions in `.claude/rules/`:
- `api.md`: Authentication patterns, handler structure, Swagger docs
- `database.md`: Connection pooling, parameterized queries, migration conventions
- `react.md`: MUI Grid v2 syntax, @tanstack/react-query, theme tokens
