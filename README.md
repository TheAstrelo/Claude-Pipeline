<div align="center">

# AI Development Auto-Pipeline

[![Codex](https://img.shields.io/badge/Provider-Codex-black)](https://developers.openai.com/codex)
[![Claude Code](https://img.shields.io/badge/Provider-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![Agents](https://img.shields.io/badge/Agents-15-green)](.claude/agents/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**AI coding tools generate code fast — but ship bugs faster.**
This pipeline adds structured quality gates between "idea" and "production" so you stop crossing your fingers every time you deploy.

One command. 13 phases (0–12). Design review, security, testing, and a final code-review-and-commit gate — handled automatically. Phase prompts are structured CONSTRAINTS→CONTEXT→TASK→FORMAT→VERIFY.

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

See [the July 2026 audit](PIPELINE-AUDIT-2026-07.md) for the exact provider
differences, gate strength, budget semantics, and remaining limitations.
The [deterministic-first PRD](DETERMINISTIC-FIRST-PRD.md) defines the implemented
reliability spine, durable ledger/resume layer, and deterministic-first adaptive
routing/security policy. Milestone 4 controls pass offline; a controlled
real-provider canary and security approval remain the GA release gates.

---

## The Problem

AI coding tools are brilliant but impulsive. Tell one "add login to my app" and it starts writing code immediately — no requirements gathering, no design review, no security check. The result? Hallucinated architectures, missed edge cases, scope creep, and vulnerabilities that slip into production.

## The Solution

This pipeline makes AI follow the same process a senior engineering team would:

1. **Understand** what you're actually asking for
2. **Design** a solution backed by real documentation
3. **Critique** the design from three different angles — before writing a single line of code
4. **Plan** every file change in advance with exact before/after diffs
5. **Verify** the plan matches the design (nothing lost, nothing added)
6. **Build** step by step, following the plan exactly
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
| `--mode=auto\|dev` | `auto` (non-interactive) or `dev` (pause after each artifact-producing phase) |
| `--skip-arm` | Skip Phase 1 (Requirements) |
| `--skip-ar` | Skip Phase 3 (Adversarial Review) |
| `--skip-pmatch` | Skip Phase 5 (Drift Detection) |
| `--model-strong=MODEL` | Override the provider's strong model lane |
| `--model-fast=MODEL` | Override the provider's balanced model lane |
| `--max-budget-usd=N` | Per-phase cap; native on Claude, post-call estimate on Codex |
| `--max-run-budget-usd=N` | Whole-run spend cap (default: `15.00`) |
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

> **Roadmap (not yet implemented):** `--batch-qa`, `--template`,
> `--dry-run`, `--test`, `--branch`, `--pr`, `--estimate`, `--fix`, and `--only`.
> The engine rejects these today. See `PIPELINE-AUDIT-2026-07.md` for current gaps.

---

## Templates

> **Roadmap — not yet wired.** `--template` is not parsed by the engine today; the files under
> `.claude/templates/` are pattern references, not an implemented flag. The examples below show
> the intended interface.

Skip requirements gathering with pre-configured templates:

| Template | Use Case |
|----------|----------|
| `api-endpoint` | REST API endpoints with validation |
| `auth-flow` | JWT/OAuth authentication |
| `crud-page` | Full CRUD interface (list, create, edit, delete) |
| `webhook` | Webhook handlers with signature verification |

```bash
/auto-pipeline --template=api-endpoint "users GET /api/users"
/auto-pipeline --template=auth-flow "jwt with refresh tokens"
/auto-pipeline --template=crud-page "products with name, price, category"
/auto-pipeline --template=webhook "stripe payment_intent.succeeded"
```

---

## Pipeline Commands

### Core Pipeline
| Command | Description |
|---------|-------------|
| `/auto-pipeline <task>` | Run full pipeline with all flags |
| `/pipeline-undo` | Revert last pipeline run |
| `/pipeline-history` | Show past runs with costs |
| `/pipeline-scan` | Proactive issue detection |

### Individual Phases
| Command | Phase | What It Does |
|---------|-------|-------------|
| `/pre-check <task>` | 0 | Search for existing solutions |
| `/arm <task>` | 1 | Requirements crystallization |
| `/design` | 2 | Technical design |
| `/ar` | 3 | Adversarial review |
| `/plan` | 4 | Implementation planning |
| `/pmatch` | 5 | Drift detection |
| `/build` | 6 | Execute the plan |
| `/denoise` | 7 | Remove debug artifacts |
| `/qf` | 8 | Quality fit check |
| `/qb` | 9 | Quality behavior check |
| `/qd` | 10 | Quality docs check |
| `/security-review` | 11 | Security audit |

---

## Intelligent Suggestions

> **Illustrative / aspirational.** The mock terminal output below shows an *intended* suggestion
> UX. `/pipeline-scan` is backed by the `code-scanner` agent, but the on-failure and on-success
> suggestion flows — and the `--fix`, `--test`, and `--pr` flags they reference — are not yet
> wired into the engine.

### On Failure

Get actionable fix suggestions with clickable file references:

```
✗ add auth endpoint · $0.12

FAILED: Phase 3 (Adversarial) — HIGH severity issue

Suggested fixes:
  1. Add input validation for email field
     └─ src/api/auth.ts:24

  2. Use parameterized SQL query
     └─ src/api/auth.ts:31
     └─ Before: WHERE email = '${email}'
     └─ After:  WHERE email = $1, [email]

Run /auto-pipeline --fix to auto-apply these suggestions
```

### On Success

Context-aware next steps based on what was built:

```
✓ add user dashboard · $0.19

Created:
  src/pages/dashboard.tsx
  src/api/dashboard/stats.ts

Suggested next steps:
  1. Run tests          → /auto-pipeline --test
  2. Create PR          → /auto-pipeline --pr
  3. Add E2E test       → /auto-pipeline "add cypress test for dashboard"
```

### Proactive Scanning

Find issues before they become problems:

```bash
/pipeline-scan
```

```
Found 3 opportunities:

  ⚠ Missing tests
    └─ src/api/users.ts has no corresponding test file
    └─ Suggestion: /auto-pipeline "add tests for users API"

  ⚠ Security
    └─ npm audit found 2 moderate vulnerabilities
    └─ Suggestion: /auto-pipeline "fix npm audit vulnerabilities"

  ⚠ Documentation
    └─ src/api/auth.ts missing JSDoc on 5 exports
    └─ Suggestion: /auto-pipeline "add jsdoc to auth module"

Run suggested pipelines? [1/2/3/all/none]
```

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
| **4. Planning** | Produces exact BEFORE/AFTER code for every file change | Every change is deterministic |
| **5. Drift Detection** | Verifies the plan covers every design requirement | Nothing gets lost or added |
| **6. Build** | Executes the plan step by step with verification | No YOLO code dumps |
| **7. Denoise** | Removes console.log, debugger, commented-out code | Clean production code |
| **8. Quality Fit** | Type checking, linting, convention compliance | Code matches project standards |
| **9. Quality Behavior** | Runs real tests; green evidence is recorded directly without a model call, failures can be diagnosed by a model | Code actually works as designed without paying for deterministic narration |
| **10. Quality Docs** | Checks Swagger/JSDoc coverage | API documentation stays current |
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

```
Pipeline History (last 10 runs)

  #  Status   Task                           Cost     Duration
  ─────────────────────────────────────────────────────────────
  1  ✓        add user authentication        $3.41    6m 22s
  2  ✓        fix login bug                  $2.68    4m 10s
  3  ✗        implement payment flow         $2.15    3m 30s
               └─ Failed: Phase 11 (Security)

Summary:
  Total runs: 12    Success: 10 (83%)    Failed: 2 (17%)
  Total cost: $38.90
```

### Undo Last Run

```bash
/pipeline-undo
```

Reverts to the git checkpoint created before the pipeline made changes.

---

## Cost Efficiency

### Model Routing (Balanced)

The engine uses two model lanes and tunes reasoning separately.

| Provider | Strong lane | Balanced lane |
|---|---|---|
| Codex | `gpt-5.6-sol` | `gpt-5.6-terra` |
| Claude | `claude-opus-4-8` | `claude-sonnet-5` |

Codex uses Sol/xhigh for Security and final review, Sol/high for Design and
Adversarial, and Terra at high/medium/low elsewhere. Claude uses Opus/high for
Design, Adversarial, and final review, with Sonnet at high/medium/low elsewhere.
Override either lane with `--model-strong=` or `--model-fast=`.

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
See
[the audit](PIPELINE-AUDIT-2026-07.md#cost-and-budget-semantics) before relying
on budget numbers.

---

## File Structure

```
Claude-Pipeline/
├── run-pipeline.sh               # THE engine (13 phases, gates, commit)
├── PIPELINE-AUDIT-2026-07.md     # Provider/capability/gate audit
├── tests/
│   ├── smoke-provider-adapters.sh
│   ├── deterministic-first-smoke.sh
│   ├── milestone-2-smoke.sh
│   ├── milestone-3-smoke.sh
│   ├── milestone-4-smoke.sh
│   ├── evaluate-routing-policy.js
│   └── evaluate-release-slos.js
├── evals/
│   ├── routing-corpus.v1.json        # Frozen labeled routing/QA cases
│   ├── routing-eval-report.v1.json   # Frozen routing policy 1.0 evaluation
│   ├── release-slo-corpus.v1.json    # Frozen offline release-control cases
│   └── release-slo-report.v1.json    # Explicitly not live-canary evidence
├── .pipeline/                    # Ignored run state, created on demand
│   ├── history.json
│   ├── operations.json           # Derived operational metrics / GA blocker
│   └── artifacts/<run>-<time>/
│       ├── ledger.jsonl          # Append-only source of truth
│       ├── run.json              # Derived per-run summary
│       ├── attempts/             # Hashed input/output envelopes
│       ├── checkpoints/          # Atomic resume cursors
│       ├── manifests/            # Checkpoint artifact manifests
│       └── objects/              # Content-addressed artifact snapshots
├── .claude/
│   ├── commands/                 # 17 slash commands
│   │   ├── auto-pipeline.md      # Thin wrapper that runs run-pipeline.sh
│   │   ├── plan-review.md        # Plan → review (dispatches to agents)
│   │   ├── design.md · ar.md · pmatch.md · security-review.md   # per-phase helpers
│   │   └── pipeline-scan.md      # Proactive scanning (code-scanner agent)
│   ├── agents/                   # 15 agents — reachable from a live slash command
│   │   ├── architect.md · atomic-planner.md · adversarial-coordinator.md
│   │   ├── security-auditor.md · code-scanner.md · builder.md · denoiser.md …
│   ├── templates/                # Pattern references (api-endpoint, auth-flow, crud-page, webhook)
│   ├── hooks/                    # protect-files.sh + auto-format.sh (Claude Code, via settings.json);
│   │   │                         #   detect-project.sh + notify.sh (run-pipeline.sh startup/exit)
└── demo/                         # Demo kit (starter Express project + red acceptance test)
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

### Hooks

**Claude Code hooks** (wired in `.claude/settings.json`, enforced by the harness):

```bash
# protect-files.sh  — PreToolUse(Edit|Write): blocks edits to .env, .git/,
#                     package-lock.json, amplify.yml, and .claude/settings.json.
#                     Fails CLOSED (denies on parse failure) and uses node, not jq.
# auto-format.sh    — PostToolUse(Edit|Write): formats the file that was just written.
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
- Git for branch/review/commit behavior
- A clean working tree is no longer required: runs execute in an isolated
  per-run git worktree from the HEAD commit (uncommitted changes are not part
  of the run; `PIPELINE_WORKTREE=0` restores in-place mode, which does
  require a clean tree; `--allow-dirty` reviews in place without commit)
- For auto-commit: Claude Code (bare mode with an API credential, or the
  OAuth-compatible isolation fallback), or Codex CLI with
  `codex exec --ignore-user-config`

## Offline production checks

These fixtures use fake provider CLIs and temporary repositories; they make no
paid model or network calls:

```bash
bash tests/smoke-provider-adapters.sh
bash tests/deterministic-first-smoke.sh
bash tests/milestone-2-smoke.sh
bash tests/milestone-3-smoke.sh
bash tests/milestone-4-smoke.sh
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
