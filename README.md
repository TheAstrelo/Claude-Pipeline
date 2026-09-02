<div align="center">

# AI Development Auto-Pipeline

[![Codex](https://img.shields.io/badge/Provider-Codex-black)](https://developers.openai.com/codex)
[![Claude Code](https://img.shields.io/badge/Provider-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**AI coding tools generate code fast — but ship bugs faster.**
This pipeline adds structured quality gates between "idea" and "production" so you stop crossing your fingers every time you deploy.

One command. 13 phases (0–12). Design review, security, testing, and a final code-review-and-commit gate — handled automatically.

```bash
bash run-pipeline.sh --provider=codex "add user authentication with JWT"
bash run-pipeline.sh --provider=claude "add user authentication with JWT"
```

Built for **Codex and Claude Code** with one Bash engine.

<!--
  TODO: Replace this comment with a GIF or screenshot of the pipeline in action.
  Record the terminal output of a full run.
  Place the file at .github/assets/demo.gif and uncomment the line below:
-->
<!-- ![Pipeline Demo](.github/assets/demo.gif) -->

</div>

---

## Why This Exists

You've seen it before: a coding agent writes 200 lines and 10 minutes later something is broken. No tests, no security check, no one asked "does this even match the existing code?"

This pipeline fixes that. Every feature goes through **pre-flight checks, adversarial review, drift detection, and a full QA suite** before a single line ships. It catches the things you'd catch in code review — except it catches them *before* you commit.

**What it does:**
- Reviews the design adversarially and scans for OWASP issues before anything ships
- Gates Phase 9 on your project's **real test exit code** — and spends no model call narrating a green run
- Runs deterministic checks before Phases 7, 8, and 10; clean results make zero
  provider calls, while objective findings trigger one bounded remediation call
- Runs a final trusted test/build/typecheck/lint/docs matrix after Phase 10 and every review heal; a heal also invalidates and rebuilds the security review
- Reviews the actual git diff (Phase 12) and commits only on `APPROVE`, auto-healing up to twice first
- Requires verification, security, review, and the exact commit object to attest the same Git tree
- Publishes the exact reviewed tree with an immutable parent and compare-and-swap branch update
- Uses Claude tool allowlists or Codex sandbox boundaries per phase
- Runs every phase in a fresh, non-resumed subprocess
- Captures tracked and untracked changes before security and final review
- Records every versioned routing decision before invocation, including the
  rule, evidence, selected lane/effort, and projected budget impact
- Runs non-waivable protected-path, secret-signature, dependency-source, and
  escaping-symlink scanners before Phase 11 sees the candidate
- Redacts high-confidence secrets and sensitive environment values before
  provider or trusted-command output becomes durable
- Supports `legacy`, review-only `shadow`, and `enforced` policy rollout modes,
  plus explicit terminal-run retention and an operational SLO dashboard

The current roadmap is [`IMPLEMENTATION-PLAN-V2.md`](IMPLEMENTATION-PLAN-V2.md);
the portable contract is [`PIPELINE-SPEC.md`](PIPELINE-SPEC.md). Earlier audits
and the original PRD are archived under [`docs/archive/`](docs/archive/). Offline
control-plane checks pass; a real-provider evaluation corpus (Milestone 1 of the
roadmap) is what measures whether the pipeline produces good code.

---

## The Problem

AI coding tools are brilliant but impulsive. Tell one "add login to my app" and it starts writing code immediately — no requirements gathering, no design review, no security check. The result? Hallucinated architectures, missed edge cases, scope creep, and vulnerabilities that slip into production.

## The Solution

This pipeline makes AI follow the same process a senior engineering team would:

1. **Understand** what you're actually asking for
2. **Design** a solution backed by real documentation
3. **Critique** the design from three different angles — before writing a single line of code
4. **Plan** every file change in advance at intent level (file, anchor, intent, test), lint-verified against the live tree
5. **Verify** the plan matches the design (nothing lost, nothing added)
6. **Build** step by step, following the plan
7. **Check** the result — types, tests, docs, and security

Every phase produces a readable artifact. Every design decision cites a source. Every critique issue has a fix. Full traceability from task to code.

| Feature | Benefit |
|---------|---------|
| **4 Profiles** | `yolo` (fast), `fast`, `standard` (balanced, default), `paranoid` (thorough) |
| **Pre-Check Phase** | Finds existing code/libraries before building from scratch |
| **Provider Model Routing** | Versioned, profile-aware Opus/Sonnet routing on Claude and GPT-5.6 Sol/Terra routing on Codex |
| **Deterministic QA Paths** | Clean Phases 7, 8, 9, and 10 make no provider call; objective findings can trigger bounded remediation |
| **Fresh Final Evidence** | A frozen test/build/typecheck/lint/docs policy reruns after Phase 10 and review heals; security reruns after every heal |
| **Non-Waivable Security Scanners** | Protected paths, high-confidence secrets, risky dependency sources, and escaping symlinks halt before the Phase 11 model |
| **Durable Data Controls** | Output is redacted before persistence; terminal-run retention is opt-in and ledger-recorded |
| **Commit Code-Review** | Phase 12 reviews the real diff and commits on `APPROVE`, with a bounded auto-heal loop and exact-tree integrity checks |
| **Per-Phase Authority** | Claude tool allowlists; Codex read-only/workspace-write sandboxes |
| **Auto-Recovery** | Design revision, drift repair, and code-review healing before pausing |
| **Wired Hooks** | protect-files + auto-format (Claude Code), detect-project + notify (engine lifecycle) |

---

## Quick Start

### 1. Install one provider CLI

```bash
npm install -g @openai/codex
# or
npm install -g @anthropic-ai/claude-code
```

Authenticate the selected CLI, then copy `run-pipeline.sh` into a clean,
committed project. Copy `.claude/` too if you want the Claude slash-command
helpers and hooks.

### 2. Run the pipeline

```bash
# Auto-detect the host provider
bash run-pipeline.sh "implement user dashboard"

# Select explicitly
bash run-pipeline.sh --provider=codex "implement user dashboard"
bash run-pipeline.sh --provider=claude "implement user dashboard"

# Full oversight — pause on any issue
bash run-pipeline.sh --provider=codex --profile=paranoid "payment integration"

# Review but leave the commit to a human
bash run-pipeline.sh --no-commit "add dashboard widget"
```

---

## Flags

These are the flags the engine (`run-pipeline.sh`, and the `/auto-pipeline` wrapper that
forwards to it) actually parses:

| Flag | Description |
|------|-------------|
| `--provider=auto\|claude\|codex` | Select the subprocess provider (default: host-aware `auto`) |
| `--profile=yolo\|fast\|standard\|paranoid` | Select a profile (default: `standard`) |
| `--mode=auto\|dev` | `auto` (non-interactive) or `dev` (pause after each of Phases 1–6) |
| `--skip-arm` | Skip Phase 1 (Requirements) |
| `--skip-ar` | Skip Phase 3 (Adversarial Review) |
| `--skip-pmatch` | Skip Phase 5 (Drift Detection) |
| `--quality=max\|balanced\|cheap` | Model lane and effort per phase (default: `max`) — see Model Routing |
| `--model-strong=MODEL` | Override the provider's strong model lane |
| `--model-fast=MODEL` | Override the provider's balanced model lane |
| `--model-review=MODEL` | Override the critique/final-review lane (`max`: the most capable model available) |
| `--max-budget-usd=N` | Per-phase cap; native on Claude, post-call estimate on Codex (default: `4.00` with a run cap, `50.00` without) |
| `--max-run-budget-usd=N` | Whole-run spend cap (default: uncapped — budgets are opt-in runaway guards) |
| `--resume=RUN_ID` | Resume from the last verified atomic checkpoint; requires the original task and identical engine, config, Git baseline, branch, worktree, and durable evidence |
| `--policy-rollout=legacy\|shadow\|enforced` | `legacy` restores fixed/model-first behavior; `shadow` records deterministic recommendations but retains baseline calls and disables commit; `enforced` is the default |
| `--retention-days=N` | Remove terminal run artifacts older than N days at startup; `0` disables (default) |
| `--retention-max-runs=N` | Keep at most N terminal run artifact sets; `0` disables (default) |
| `--no-commit` | Run final verification and review without publishing a commit; clean runs still use an isolated pipeline branch |
| `--allow-dirty` | Allow a dirty baseline and disable auto-commit |
| `--allow-untested-commit` | Explicitly permit auto-commit when no trusted test command is configured; the waiver is recorded |

There is no `--yolo`/`--fast`/`--paranoid` shorthand — use `--profile=`.

For production auto-commit, the repository must start clean. Verification
commands are frozen as trusted argv plus package-script and executable identities
at run start. A verifier that changes the candidate or Git control state, a
mid-run verification-policy change, missing configured tooling, stale security
or review attestation, or a competing branch update halts the run. These
integrity failures are not softened by `yolo` or `fast`.
Each trusted command has a 900-second default bound; set
`PIPELINE_COMMAND_TIMEOUT_SECONDS` to a positive integer before the run to
change it.

Production provider calls are capability-gated, not version-string-gated.
Claude isolation is credential-aware: `--bare` reads auth strictly from
`ANTHROPIC_API_KEY`/apiKeyHelper (OAuth is never read), so the engine uses
bare mode only when such a credential exists and otherwise runs the
OAuth-compatible isolation set (explicit `CLAUDE_CODE_DISABLE_*` env, empty
setting sources, `--strict-mcp-config`) so subscription-login users and cloud
sessions can spawn phases at all. A startup auth preflight performs one cheap
end-to-end `claude -p` probe and halts with an actionable message if nested
spawns cannot authenticate (`PIPELINE_AUTH_PREFLIGHT=0` skips). Codex
auto-commit requires `codex exec --ignore-user-config` and rejects a
repository `.codex/config.toml`. Provider subprocesses are wall-clock-bounded
(`PIPELINE_PROVIDER_TIMEOUT_SECONDS`, default 2400) and transient API
failures are retried once (`PIPELINE_PROVIDER_RETRIES`).

### Environment knobs

| Variable | Default | Effect |
|---|---|---|
| `PIPELINE_PROVIDER` | `auto` | Same as `--provider=` |
| `PIPELINE_STATE_DIR` | `.pipeline` | Where run state lives; an absolute path must be outside the repository |
| `PIPELINE_NONINTERACTIVE` | `0` | `1`: a failed HARD gate exits 3 instead of prompting |
| `PIPELINE_NO_NOTIFY` | `0` | `1`: skip the desktop notification on exit |
| `PIPELINE_AUTH_PREFLIGHT` | `1` | `0`: skip the startup `claude -p` auth probe |
| `PIPELINE_BASELINE_CHECKS` | `1` | `0`: skip the baseline test/build/typecheck/lint/docs matrix |
| `PIPELINE_PROVIDER_TIMEOUT_SECONDS` | `2400` | Wall-clock bound per provider subprocess |
| `PIPELINE_PROVIDER_RETRIES` | `1` | Retries on timeout / transient API error |
| `PIPELINE_COMMAND_TIMEOUT_SECONDS` | `900` | Bound per trusted test/build/lint command |
| `PIPELINE_WORKTREE` | `1` | `0`: legacy in-place mode (requires a clean tree) |
| `PIPELINE_WORKTREE_LINK_PATHS` | `node_modules .venv venv vendor` | Gitignored build state symlinked into the run worktree |
| `PIPELINE_ALLOW_REMOTE_DEPS` | `0` | `1`: recorded waiver for git/https dependency specifiers |
| `PIPELINE_BUDGET_POLICY` | `elastic` | Same as `--budget=`; `strict` halts on the first per-phase cap hit |
| `PIPELINE_BUDGET_EXTENSIONS` | `2` | Elastic per-phase cap doublings allowed within the run cap |
| `PIPELINE_COLLAPSE` | `1` | `0`: full planning ladder even in `yolo`/`fast` |
| `PIPELINE_BUILD_FIX_ATTEMPTS` | `2` | In-build verify/fix calls after Phase 6; `0` disables |
| `MAX_CODE_REVIEW_HEALS` | `2` | Phase 12 auto-heal rounds before a human halt |
| `PIPELINE_PUSH_REMOTE` | `origin` | Remote for `--push` / `--pr` |

### Examples

```bash
# Balanced Codex pipeline
bash run-pipeline.sh --provider=codex "add user authentication"

# Skip adversarial review, keep everything else
bash run-pipeline.sh --provider=claude --skip-ar "add dashboard widget"

# Cap spend and pick models explicitly
bash run-pipeline.sh --provider=codex --max-run-budget-usd=8 --model-fast=gpt-5.6-terra "add dashboard widget"

# Standalone runner in interactive dev mode (pauses between phases)
bash run-pipeline.sh --mode=dev --profile=paranoid "handle payments"

# Resume an interrupted run; repeat its original task and options
bash run-pipeline.sh --resume=RUN_ID --provider=codex "add user authentication"
```

> **Implemented delivery flags:** `--push` (publish the committed run branch
> to the remote) and `--pr` (`--push` plus pull-request guidance).
> Unknown flags are rejected, never passed through as task text. Planned
> additions (`--quality=`, opt-in budgets, structured verdicts on Claude) are
> tracked in `IMPLEMENTATION-PLAN-V2.md`.

---


## Pipeline Commands

### Core Pipeline
| Command | Description |
|---------|-------------|
| `/auto-pipeline <task>` | Run the engine with all flags (thin wrapper over `run-pipeline.sh`) |
| `/pipeline-undo` | Discard a run: remove its worktree and `pipeline/<run>` branch (your checkout was never modified) |
| `/pipeline-history` | Show past runs with costs and tokens |
| `/pipeline-scan` | Proactive issue detection via the `code-scanner` agent |
| `/plan-review <task>` | Interactive plan → review (the `planner` and `plan-reviewer` agents) |

The per-phase slash-command ladder (`/arm`, `/design`, `/ar`, …) was removed:
it had drifted from the engine's contracts. The engine builds every phase
prompt inline in `build_prompt()`.

---


## The 13 Phases

```
Task Description
       │
       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 0    │───▶│  Phase 1     │───▶│  Phase 2     │
│  Pre-Check  │    │  Requirements│    │  Design      │
│  [HARD]     │    │  [SOFT]      │    │  [SOFT]      │
└─────────────┘    └──────────────┘    └──────────────┘
                                              │
       ┌──────────────────────────────────────┘
       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 3    │───▶│  Phase 4     │───▶│  Phase 5     │
│  Adversarial│    │  Planning    │    │  Drift Check │
│  [HARD]     │    │  [SOFT]      │    │  [SOFT]      │
└─────────────┘    └──────────────┘    └──────────────┘
                                              │
       ┌──────────────────────────────────────┘
       ▼
┌─────────────┐    ┌──────────────────────────────────┐
│  Phase 6    │───▶│  Phases 7-10                      │
│  Build      │    │  7: Denoise    8: Quality Fit     │
│  [HARD]     │    │  9: Behavior  10: Docs            │
└─────────────┘    └──────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────┐    ┌────────────────────┐
                          │  Phase 11    │───▶│  Phase 12          │
                          │  Security    │    │  Commit Code-Review│
                          │  [HARD]      │    │  [HARD] ─ commit   │
                          └──────────────┘    └────────────────────┘
                                                        │
                                                        ▼
                                          APPROVE → commit · else auto-heal ×2 → human
```

| Phase | What It Does | Why It Matters |
|-------|-------------|----------------|
| **0. Pre-Check** | Searches your codebase for existing code and libraries | Prevents rebuilding what already exists |
| **1. Requirements** | Extracts testable success criteria from your task | Turns a vague idea into a concrete spec |
| **2. Design** | Creates architecture decisions citing real documentation | Decisions are traceable, not hallucinated |
| **3. Adversarial Review** | Three critics stress-test the design | Catches security gaps and edge cases before code |
| **4. Planning** | Intent-level steps: file, verbatim anchor, intent, test; a deterministic lint verifies every anchor exists before the build spends anything | Plans survive small drift in the live tree |
| **5. Drift Detection** | Verifies the plan covers every design requirement | Nothing gets lost or added |
| **6. Build** | Executes the plan step by step with verification | No YOLO code dumps |
| **7. Denoise** | Removes console.log, debugger, commented-out code | Clean production code |
| **8. Quality Fit** | Type checking, linting, convention compliance | Code matches project standards |
| **9. Quality Behavior** | Runs real tests; green evidence is recorded directly without a model call, failures can be diagnosed by a model | Code actually works as designed without paying for deterministic narration |
| **10. Quality Docs** | Checks Swagger/JSDoc coverage — the route-docs rule fires only in repos that already document routes or state the convention in `CLAUDE.md`/`AGENTS.md` | API documentation stays current without manufacturing docs the project never wanted |
| **11. Security** | Non-waivable deterministic scanners, then an OWASP model review bound to the exact diff/tree | High-confidence policy failures stop before model judgment |
| **12. Commit Code-Review** | Reviews the real git diff against the brief; commits on `APPROVE`, else auto-heals (≤2), re-verifies, re-runs security, and asks a human if unresolved | The exact verified and reviewed tree is committed with an atomic ref update |

---

## Profiles

| Profile | What Gets Skipped | Gate Mode | When To Use |
|---------|-------------------|-----------|-------------|
| **yolo** | 3, 5, 7-10 | soft | Prototyping, experiments |
| **fast** | 7-10 | standard | Feature dev, moderate risk |
| **standard** | Nothing | mixed | Normal development (default) |
| **paranoid** | Nothing | hard | Production, payments, auth |

```bash
/auto-pipeline --profile=yolo "quick prototype"
/auto-pipeline --profile=fast "add dashboard widget"
/auto-pipeline --profile=paranoid "handle payments"
```

### Policy rollout and rollback

`--policy-rollout=enforced` is the default deterministic-first behavior.
`shadow` runs the same checks and records what would be skipped or promoted, but
retains baseline model calls and forcibly disables commit. `legacy` is the
rollback switch: it restores fixed routing and model-first Phases 7–10 while
retaining the engine's release-integrity and security boundaries.

---

## History & Undo

### View History

```bash
/pipeline-history
```

Lists past runs from `.pipeline/history.json` (status, task, cost, tokens),
rebuilt from each run's verified ledger.

### Undo Last Run

```bash
/pipeline-undo
```

Removes a run's worktree and its `pipeline/<run>` branch. Runs never modify
your original checkout, so there is nothing else to revert.

---

## Cost Efficiency

### Model Routing

Three model lanes, three quality presets (`--quality=`, default `max`).

| Provider | Strong lane | Balanced lane | Review lane (`max` only) |
|---|---|---|---|
| Claude | `claude-opus-5` | `claude-sonnet-5` | `claude-fable-5-1` (falls back to Opus 5) |
| Codex | `gpt-5.6-sol` | `gpt-5.6-terra` | strong lane |

| Phase | `max` | `balanced` | `cheap` |
|---|---|---|---|
| 0 Pre-Check | strong / high | strong / high | balanced / medium |
| 1, 2, 4 Requirements, Design, Planning | strong / xhigh | strong / high | balanced / medium |
| 3 Adversarial Review | review / xhigh | strong / high | balanced / medium |
| 6 Build (and build-fix, heal) | strong / xhigh | strong / high | balanced / medium |
| 11 Security | strong / xhigh | strong / high | balanced / high |
| 12 Commit Code-Review | review / max | strong / high | balanced / high |
| 5, 7, 8, 9, 10 drift and QA remediation | balanced / high | balanced / medium | balanced / medium |

Effort is clamped to what the provider accepts (Claude `max`, Codex `xhigh`).
A startup probe verifies each routed model is usable by this account and falls
back along Fable 5.1 → Opus 5 → Opus 4.8 with a warning. Override any lane with
`--model-strong=`, `--model-fast=`, or `--model-review=`. The refuter that
re-checks a BLOCKER runs on the same lane as the reviewer it may overrule.

Routing policy `1.0` keeps those phase routes as the baseline and applies only
mechanical, pre-call task signals—never a model-generated confidence score:

- `yolo` keeps fixed baseline routing except that high-risk Security is
  non-skippable and promoted when its baseline is not already strong.
- `fast` promotes high-risk Build and Security work.
- `standard` promotes high-risk Requirements, Planning, Build, and Security
  work, and promotes ambiguous Requirements and Planning work.
- `paranoid` promotes Requirements, Planning, Drift Detection, Build, and
  Security work.
- Design, Adversarial Review, and final review remain on the strong lane for all
  profiles. A Phase 7/8/10 remediation uses the balanced lane only after the
  deterministic check reports findings or cannot run.

Each decision is appended to `ledger.jsonl` before invocation with its policy
version, evidence, selected model/effort, and projected per-call cap. The frozen
12-case offline corpus reports precision `1.00`, recall `1.00`, a `100%` clean-QA
call reduction, and no required-check regression against its labeled baseline.
These are policy-fixture results, not a claim about live model quality; cost and
latency are relative units. The offline release-SLO corpus also passes every
control-plane threshold, but explicitly records `gaEligible: false` until a
controlled provider canary and security approval exist.

Claude uses `--bare` (only when an API credential is present — see the
credential-aware isolation note above), an empty settings-source set, strict MCP isolation,
disabled memory/background features, and only the built-in tools for that
phase. Codex suppresses project-document injection, ignores user configuration,
disables every supported plugin/memory/subagent feature, uses read-only versus
workspace-write sandboxes, and disables web search outside research phases.
Codex still has no general per-tool allowlist, so the sandbox remains the
authority boundary for its built-in tools.

For compatibility audits, `--no-commit` permits an older provider CLI and emits
an explicit isolation warning. It is deliberately not accepted for production
auto-commit.

### Cost

Claude reports actual per-call USD and enforces the per-phase cap natively.
Codex reports token usage; the engine calculates an API-price-equivalent
estimate for GPT-5.6 Sol/Terra/Luna and enforces caps only after each call. That
estimate is not ChatGPT subscription billing and does not include separately
priced tool calls.

Each run has a hash-linked, append-only `ledger.jsonl` as its source of truth.
Atomic checkpoints bind the engine, effective configuration, original task,
Git baseline and branch, worktree, verification plan, and content-addressed
artifacts. `run.json` and the schema-2 `.pipeline/history.json` index are
derived views and can be rebuilt from verified run evidence. Resume is
fail-closed: it never guesses through changed or corrupt state and it never
reuses a verdict whose declared inputs no longer match.

Model and deterministic checks have separate attempt envelopes with hashed
inputs and outputs. Provider/model/prefix-scoped prompt-cache telemetry records
read and write tokens, but cache behavior has no effect on validation or gates.
See the archived
[July 2026 audit](docs/archive/PIPELINE-AUDIT-2026-07.md#cost-and-budget-semantics)
before relying on budget numbers.

---

## File Structure

```
Claude-Pipeline/
├── run-pipeline.sh               # THE engine (13 phases, gates, commit)
├── CLAUDE.md                     # Engine guide (Claude Code reads this)
├── AGENTS.md                     # Pointer to CLAUDE.md (Codex reads this)
├── PIPELINE-SPEC.md              # Portable, vendor-independent contract
├── IMPLEMENTATION-PLAN-V2.md     # Roadmap
├── tests/                        # Mocked-provider battery (tests/run-all.sh discovers tests/*.sh)
├── evals/
│   ├── corpus/<task>/            # Sealed real-provider tasks: task.json, task.md, hidden/ tests
│   ├── fixtures/<name>/          # Small runnable projects the corpus tasks target
│   ├── results/                  # Corpus run results (committed by the weekly workflow)
│   ├── run-corpus.mts · score.mts  # Corpus runner and scorer (node 22, no build step)
│   └── *.v1.json                 # Frozen routing / release-SLO fixtures for the offline evaluators
├── docs/
│   ├── archive/                  # Superseded audits, PRD, and plan (historical)
│   └── examples/                 # Reference-project rules and skills (shape, not content)
├── demo/                         # Demo kit: starter Express project + red acceptance test
├── .pipeline/                    # Ignored run state, created on demand (artifacts, worktrees, history)
└── .claude/
    ├── commands/                 # auto-pipeline · plan-review · pipeline-scan · pipeline-history · pipeline-undo
    ├── agents/                   # planner · plan-reviewer · code-scanner (interactive helpers only)
    ├── rules/                    # review-precedents.md (engine-read) + your conventions (session-read)
    ├── hooks/                    # protect-files · auto-format (settings.json); detect-project · notify (engine)
    └── settings.json             # Claude Code hooks
```

---

## Customization

### Rules

Add project-specific conventions in `.claude/rules/`:

```markdown
# .claude/rules/api.md
- Use Hono instead of Express
- Return { data, error } shape
```

**These are read by interactive Claude Code sessions only.** The engine
deliberately runs each phase with project instruction files disabled and
does not read `.claude/rules/` — except `.claude/rules/review-precedents.md`,
which it appends to the Phase 3/11/12 review prompts. Feeding your
conventions to every phase is Milestone 2 of `IMPLEMENTATION-PLAN-V2.md`
(the repo-context pack). A worked example of convention files lives in
`docs/examples/reference-project-rules/`.

### Hooks

**Claude Code hooks** (wired in `.claude/settings.json`, enforced by the harness):

```bash
# guard-commands.sh — PreToolUse(Bash), build/heal phases only: denies git
#                     commit/push/reset/checkout/rebase, publishing, network
#                     fetchers, and writes into .pipeline/ (the orchestrator
#                     commits the reviewed tree; a builder never does).
# protect-files.sh  — PreToolUse(Edit|Write): blocks edits to .env, .git/,
#                     package-lock.json, amplify.yml, and .claude/settings.json.
#                     Fails CLOSED (denies on parse failure) and uses node, not jq.
# auto-format.sh    — PostToolUse(Edit|Write): formats the file that was just written
#                     when the project uses Prettier (config or dependency present);
#                     otherwise a no-op.
```

**Engine lifecycle hooks** (wired into `run-pipeline.sh`):

```bash
# detect-project.sh — runs at startup: detects the stack (framework, language,
#                     test/build/lint commands, search dirs), writes
#                     project-config.json into the session artifacts, fills the
#                     test command if none was found, and prepends a one-line
#                     "match this stack" note to every phase prompt.
# notify.sh         — fires on EVERY exit (success, HARD-gate halt, budget cut,
#                     error) via an EXIT trap: desktop notification + terminal bell,
#                     cross-platform (macOS / Linux / Windows toast + beep).
```

---

## Requirements

- [Codex CLI](https://developers.openai.com/codex) or
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code), installed and authenticated
- Bash (Git Bash on native Windows)
- Node.js for JSON parsing, evidence hashing, and usage accounting
- Git ≥ 2.5 (worktrees); run from the repository root of a repo with at least one commit
- Copying `.claude/` into your project installs its hooks for *all* your
  Claude Code sessions there (`protect-files.sh` blocks `.env`/lockfile edits)
- A clean working tree is no longer required: runs execute in an isolated
  per-run git worktree from the HEAD commit (uncommitted changes are not part
  of the run; `PIPELINE_WORKTREE=0` restores in-place mode, which does
  require a clean tree; `--allow-dirty` reviews in place without commit)
- For auto-commit: Claude Code (bare mode with an API credential, or the
  OAuth-compatible isolation fallback), or Codex CLI with
  `codex exec --ignore-user-config`

## Offline production checks

These fixtures use fake provider CLIs and temporary repositories; they make no
paid model or network calls.

**Run the whole battery with one command** — `tests/run-all.sh`
auto-discovers every `tests/*.sh` suite (so a new suite can never be silently
dropped), runs each, reads its real exit code, and prints a pass/fail table.
It exits non-zero if any suite fails:

```bash
bash tests/run-all.sh        # everything, sequentially
bash tests/run-all.sh -p     # everything, in parallel (faster)
bash tests/run-all.sh m2 kill-matrix   # only suites whose name matches
```

Individual suites still run standalone:

```bash
bash tests/smoke-provider-adapters.sh
bash tests/deterministic-first-smoke.sh
bash tests/milestone-2-smoke.sh
bash tests/milestone-3-smoke.sh
bash tests/milestone-4-smoke.sh
bash tests/resume-kill-matrix.sh
bash tests/parser-golden.sh          # engine parsers vs. realistic model-output fixtures
bash tests/provider-failure-smoke.sh # timeout / budget-cap / api_error / malformed-output paths
node tests/evaluate-routing-policy.js \
  evals/routing-corpus.v1.json \
  evals/routing-eval-report.v1.json
node tests/evaluate-release-slos.js \
  evals/release-slo-corpus.v1.json \
  evals/release-slo-report.v1.json
```

---

## Contributing

Contributions are welcome — open an issue or a PR. Whether it's a new agent, a
bug fix, or better docs, it's appreciated.

---

## License

MIT — see [`LICENSE`](LICENSE). Use it, adapt it, ship it.
