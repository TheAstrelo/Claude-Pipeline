# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude-Pipeline is a tool-agnostic, 13-phase (0–12) automated development pipeline that
transforms a task description into reviewed, committed code. The reference implementation is
`run-pipeline.sh`; tool-specific ports live under `targets/` (cursor, cline, windsurf, copilot, aider, codex).

## The One Engine

`run-pipeline.sh` is the single real executable. It runs each phase as a separate `claude -p`
subprocess, validates the artifact each phase writes, applies the gate, and (Phase 12) commits.

- **`run-pipeline.sh`** — the engine. Run it directly: `bash run-pipeline.sh [options] "task"`.
- **`.claude/commands/auto-pipeline.md`** — a thin `/auto-pipeline` slash-command wrapper that
  runs the engine with `PIPELINE_NONINTERACTIVE=1` and interprets its exit code.
- The per-phase slash commands (`/design`, `/plan-review`, `/ar`, `/security-review`, …) are
  interactive helpers that dispatch to `.claude/agents/` via the Task tool. The engine does **not**
  use them — it builds every phase prompt inline in `build_prompt()`.

## Commands

```bash
# Run the pipeline (standalone)
bash run-pipeline.sh "add a GET /api/version endpoint"
bash run-pipeline.sh --profile=paranoid --mode=dev "handle payments"

# Demo starter project (demo/starter-project/)
npm install && npm test

# Pipeline visualization
cd pipeline-viz && npm install && npm start
```

Flags the engine actually parses: `--profile=yolo|fast|standard|paranoid`, `--mode=auto|dev`,
`--skip-arm` (skip Phase 1), `--skip-ar` (skip Phase 3), `--skip-pmatch` (skip Phase 5),
`--model-strong=`, `--model-fast=`, `--max-budget-usd=` (per-phase cap), `--max-run-budget-usd=`
(whole-run cap), `--help`. Anything else (`--resume`, `--template`, `--batch-qa`, `--fix`, `--pr`,
`--yolo` shorthand) is **not** implemented.

## Architecture

### The 13-Phase Pipeline

```
Phase 0:  Pre-Check          (HARD) → Find existing code/libraries before building
Phase 1:  Requirements       (SOFT) → Extract testable success criteria
Phase 2:  Design             (SOFT, STRONG model) → Architecture decisions with citations
Phase 3:  Adversarial Review (HARD, STRONG model) → 3 critic angles stress-test the design
Phase 4:  Planning           (SOFT) → Exact BEFORE/AFTER code for every change
Phase 5:  Drift Detection    (SOFT) → Verify the plan covers the design
Phase 6:  Build              (NONE) → Execute the plan step by step (step retry on failure)
Phase 7:  Denoise            (NONE) → Strip debug artifacts / dead code
Phase 8:  Quality Fit        (NONE) → Types, lint, conventions
Phase 9:  Quality Behavior   (SOFT) → Gates on the REAL captured test exit code (un-fakeable)
Phase 10: Quality Docs       (NONE) → Swagger/JSDoc coverage
Phase 11: Security           (HARD) → OWASP scan
Phase 12: Commit Code-Review (HARD, STRONG model) → Review the real git diff, then commit on APPROVE
```

### Gate System

- **HARD gates** (0, 3, 11, 12): must pass or the pipeline halts for a human (exit 3 when headless).
- **SOFT gates** (1, 2, 4, 5, 9): warn and proceed in `mixed`/`soft` mode; pause in `hard` (paranoid) mode.
- **NONE gates** (6, 7, 8, 10): always proceed; issues are auto-fixed in place.

Phase 9's gate is driven by the **real exit code** of the project's test command, which the
orchestrator (not a model) runs and captures — the one signal a phase cannot fake.

### Model Routing (Balanced)

Never Haiku, never `max` effort. Two models only:

| Phases | Model | Effort | Why |
|--------|-------|--------|-----|
| 2 Design, 3 Adversarial | `claude-opus-4-8` | high | Hard reasoning / adversarial finding |
| 12 Commit Code-Review | `claude-opus-4-8` | xhigh→high* | Last line of defense on the built diff |
| 0 Pre-Check, 11 Security | `claude-sonnet-5` | xhigh→high* | Deep search / OWASP |
| 4, 5, 6, 9 | `claude-sonnet-5` | medium | Planning, drift, build, behavior |
| 1, 7, 8, 10 | `claude-sonnet-5` | low | Requirements, denoise, fit, docs |

\* The CLI accepts `--effort` up to `high`; `xhigh` is probed at startup and clamped to `high`
if unsupported (`clamp_effort()`).

### Context: per-phase tool scoping

Each subprocess loads only the built-in tools its phase needs (`--tools`, plus
`--strict-mcp-config` to stay hermetic). Measured: the full built-in tool set is ~33K bootstrap
tokens; scoping cuts it to ~10K (analysis) / ~12K (research) / ~15K (build) — a 50–78% per-phase
reduction. Every phase keeps `Write` (it authors its own artifact) and `Read/Grep/Glob`;
research phases add `WebSearch/WebFetch`; build/QA phases add `Edit/Bash`. See `phase_tools()`.

### File Structure

```
run-pipeline.sh          # THE engine (13 phases, gates, commit)
.claude/
├── commands/            # 22 slash commands (auto-pipeline.md is the engine wrapper)
├── agents/              # 15 agents — the set reachable from a live slash command
│                        #   (interactive helpers only; the engine inlines its prompts)
├── rules/               # Project conventions (api.md, database.md, react.md)
├── templates/           # Pattern references (api-endpoint, auth-flow, crud-page, webhook)
├── skills/              # Scaffolding skills (new-migration, scaffold-api)
├── lib/                 # Error patterns, next steps, context engine (reference docs)
├── hooks/               # protect-files.sh + auto-format.sh (Claude Code hooks via settings.json);
│                        #   detect-project.sh + notify.sh (wired into run-pipeline.sh startup/exit)
├── artifacts/           # Per-session output ({session-id}/*.md + .raw/.err/.verdict)
├── history.json         # Pipeline run history (per-run costUSD)
└── settings.json        # Hooks + profiles (protected by protect-files.sh)

targets/                 # Tool-specific ports (cursor, cline, windsurf, copilot, aider, codex)
demo/                    # Demo kit with a starter Express project + red acceptance test
pipeline-viz/            # Real-time pixel-art visualization
```

### Key Execution Pattern

Each phase runs as a **separate subprocess** (`claude -p`) to prevent memory accumulation. The
orchestrator builds the prompt, spawns the subprocess with scoped tools + a per-phase budget cap,
parses the returned cost/verdict JSON, validates the artifact, and applies the gate. Cost is
tracked cumulatively against `--max-run-budget-usd`.

## Profiles

| Profile | Skip Phases | Gate Mode | Use Case |
|---------|-------------|-----------|----------|
| `yolo` | 3, 5, 7, 8, 9, 10 | soft | Fast prototyping |
| `fast` | 7, 8, 9, 10 | standard | Feature dev, keep adversarial + drift + security |
| `standard` | none | mixed | Normal development (default) |
| `paranoid` | none | hard | Production / payments / auth |

## Validation Philosophy

Gates are driven by **objective checks** — file existence, pattern/count thresholds, and real
exit codes — not by a model asserting success. Two signals matter most:

- **Phase 9 test-exit-code gate** — the orchestrator runs the project's real test command and
  gates on its captured exit code (`run_tests()` / `validate_phase_9`).
- **Typed verdicts** — gating phases (3, 11, 12) emit a `## Verdict:` token that
  `read_verdict()` extracts via an anchored grep (tolerant of `##`/`###`/`**bold**`).

> **Known constraint:** `--json-schema` (which would force a typed verdict the gate cannot
> misread) triggers a spurious `Prompt is too long` API error on Opus at high effort — verified
> with a one-line prompt. It is therefore disabled (`phase_schema()` returns empty), and the
> anchored-grep verdict is the fallback in production.

## Auto-Recovery Loops

- Phase 3 `REVISE_DESIGN` → feed the critique back to Phase 2, re-review (max 1).
- Phase 5 `DRIFT_DETECTED` → add the missing plan steps, re-check (max 1).
- Phase 6 step failure → retry with error context (max 2/step).
- Phase 12 `REQUEST_CHANGES` → feed the review findings to a fix pass, re-test, re-review
  (max `MAX_CODE_REVIEW_HEALS`, default 2); halt for a human only after the heals are exhausted.
  Commits the diff only on an `APPROVE` verdict, and only the built code (pipeline scratch under
  `.claude/artifacts/` is excluded from the commit).

## Rules Integration

When generating code for projects using this pipeline, follow conventions in `.claude/rules/`:
- `api.md`: Authentication patterns, handler structure, Swagger docs
- `database.md`: Connection pooling, parameterized queries, migration conventions
- `react.md`: MUI Grid v2 syntax, @tanstack/react-query, theme tokens
