<div align="center">

# Claude Code Auto-Pipeline

[![Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![Agents](https://img.shields.io/badge/Agents-15-green)](.claude/agents/)
[![Tool Agnostic](https://img.shields.io/badge/Works%20with-Claude%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Copilot-orange)](#tool-support)

**AI coding tools generate code fast — but ship bugs faster.**
This pipeline adds structured quality gates between "idea" and "production" so you stop crossing your fingers every time you deploy.

One command. 13 phases (0–12). Design review, security, testing, and a final code-review-and-commit gate — handled automatically. Phase prompts are structured CONSTRAINTS→CONTEXT→TASK→FORMAT→VERIFY.

```bash
/auto-pipeline "add user authentication with JWT"
# or run the engine directly:
bash run-pipeline.sh "add user authentication with JWT"
```

Works with **Claude Code, Cursor, Cline, Windsurf, GitHub Copilot, and Aider**.

<!--
  TODO: Replace this comment with a GIF or screenshot of the pipeline in action.
  Record the pipeline-viz pixel art office + terminal output side by side.
  Place the file at .github/assets/demo.gif and uncomment the line below:
-->
<!-- ![Pipeline Demo](.github/assets/demo.gif) -->

</div>

---

## Why This Exists

You've seen it before: Claude writes 200 lines, you hit "accept all," and 10 minutes later something's broken. No tests, no security check, no one asked "does this even match the existing code?"

This pipeline fixes that. Every feature goes through **pre-flight checks, adversarial review, drift detection, and a full QA suite** before a single line ships. It catches the things you'd catch in code review — except it catches them *before* you commit.

**What it does:**
- Reviews the design adversarially and scans for OWASP issues before anything ships
- Gates Phase 9 on your project's **real test exit code** — a signal a model can't fake
- Reviews the actual git diff (Phase 12) and commits only on `APPROVE`, auto-healing up to twice first
- Scopes each subprocess's tools to cut the per-phase bootstrap 50–78% (measured)
- Works with any codebase — drop in the `.claude/` folder and go

> **Cost:** a full 13-phase run is typically ~$3–6 (measured on the demo task). See
> [Cost Efficiency](#cost-efficiency) for the model routing and the real per-phase breakdown.

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
| **Balanced Model Routing** | Opus on Design, Adversarial, and Code-Review; Sonnet everywhere else — never Haiku |
| **Test-Exit-Code Gate** | Phase 9 gates on your real test suite's exit code, not a model's say-so |
| **Commit Code-Review** | Phase 12 reviews the real diff and commits on `APPROVE`, with a bounded auto-heal loop |
| **Per-Phase Tool Scoping** | Loads only the tools each phase needs — 50–78% smaller bootstrap per subprocess |
| **Auto-Recovery** | Design revision, drift repair, build retries, and code-review healing before pausing |
| **Tool Agnostic** | Works with Claude Code, Cursor, Windsurf, Copilot, Cline, Aider |

---

## Quick Start

### 1. Copy to your project

```bash
git clone https://github.com/TheAstrelo/Claude-Pipeline.git
cp -r Claude-Pipeline/.claude/ /path/to/your/project/
```

### 2. Start your AI tool

```bash
# Claude Code
npx @anthropic-ai/claude-code@latest

# Or open in Cursor, Cline, Windsurf, Copilot, or Aider
```

### 3. Run the pipeline

```bash
# Fast prototyping — skip adversarial, drift, and QA; just build
/auto-pipeline --profile=yolo "add a logout button"

# Balanced (default) — full pipeline
/auto-pipeline "implement user dashboard"

# Full oversight — pause on any issue
/auto-pipeline --profile=paranoid "payment integration"

# Skip QA phases only, keep adversarial + drift + security
/auto-pipeline --profile=fast "add dashboard widget"
```

---

## Flags

These are the flags the engine (`run-pipeline.sh`, and the `/auto-pipeline` wrapper that
forwards to it) actually parses:

| Flag | Description |
|------|-------------|
| `--profile=yolo\|fast\|standard\|paranoid` | Select a profile (default: `standard`) |
| `--mode=auto\|dev` | `auto` (non-interactive) or `dev` (pause after each artifact-producing phase) |
| `--skip-arm` | Skip Phase 1 (Requirements) |
| `--skip-ar` | Skip Phase 3 (Adversarial Review) |
| `--skip-pmatch` | Skip Phase 5 (Drift Detection) |
| `--model-strong=MODEL` | Model for Phases 2, 3, 12 (default: `claude-opus-4-8`) |
| `--model-fast=MODEL` | Model for all other phases (default: `claude-sonnet-5`) |
| `--max-budget-usd=N` | Per-phase spend cap (default: `4.00`) |
| `--max-run-budget-usd=N` | Whole-run spend cap (default: `15.00`) |

There is no `--yolo`/`--fast`/`--paranoid` shorthand — use `--profile=`.

### Examples

```bash
# Balanced pipeline
/auto-pipeline "add user authentication"

# Skip adversarial review, keep everything else
/auto-pipeline --skip-ar "add dashboard widget"

# Cap spend and pick models explicitly
bash run-pipeline.sh --max-run-budget-usd=8 --model-fast=claude-sonnet-5 "add dashboard widget"

# Standalone runner in interactive dev mode (pauses between phases)
bash run-pipeline.sh --mode=dev --profile=paranoid "handle payments"
```

> **Roadmap (not yet implemented):** `--resume`, `--batch-qa`, `--template`,
> `--dry-run`, `--test`, `--branch`, `--pr`, `--estimate`, `--fix`, and `--only`.
> The engine ignores these today. See `AUDIT-FABLE.md` (§6, Remediation) for sequencing.

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
| `/pipeline-estimate <task>` | Preview cost before running |
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
│  [NONE]     │    │  9: Behavior  10: Docs            │
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
| **9. Quality Behavior** | Runs build + tests, verifies behavior | Code actually works as designed |
| **10. Quality Docs** | Checks Swagger/JSDoc coverage | API documentation stays current |
| **11. Security** | OWASP scan: injection, XSS, auth bypass, secrets | Vulnerabilities caught before merge |
| **12. Commit Code-Review** | Reviews the real git diff against the brief; commits on `APPROVE`, else auto-heals (≤2) then asks a human | The last line of defense — nothing commits unreviewed |

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

Two models, never Haiku, never `max` effort. Opus does the hard-reasoning and
last-line-of-defense work; Sonnet does everything else.

| Phases | Model | Effort |
|--------|-------|--------|
| 2 Design, 3 Adversarial | `claude-opus-4-8` | high |
| 12 Commit Code-Review | `claude-opus-4-8` | xhigh (clamped to high if the CLI caps it) |
| 0 Pre-Check, 11 Security | `claude-sonnet-5` | high |
| 4, 5, 6, 9 | `claude-sonnet-5` | medium |
| 1, 7, 8, 10 | `claude-sonnet-5` | low |

Override with `--model-strong=` / `--model-fast=`. Each subprocess also loads only its phase's
tools (`--tools`) and runs hermetically (`--strict-mcp-config`), cutting the per-phase bootstrap
50–78%.

### Cost

Measured on the demo task (`add a GET /api/version endpoint`), a full 13-phase run is **~$3–6**:
the three Opus phases (Design, Adversarial, Code-Review) run ~$0.8–1.7 each and dominate; the
Sonnet phases run ~$0.13–0.26 each. A `--skip-ar` run with no code-review healing landed at
**$3.06**; a run that hit `REQUEST_CHANGES` and auto-healed once cost **$3.83** (the extra ~$1
buys a fix pass + a second Opus review instead of a human interrupt).

Spend is capped by `--max-budget-usd` (per phase, default $4) and `--max-run-budget-usd` (whole
run, default $15). Every phase emits `--output-format json`, so per-phase `total_cost_usd` is
recorded in `.claude/history.json` — run once to get real numbers for your own tasks.

---

## File Structure

```
Claude-Pipeline/
├── run-pipeline.sh               # THE engine (13 phases, gates, commit)
├── .claude/
│   ├── commands/                 # 22 slash commands
│   │   ├── auto-pipeline.md      # Thin wrapper that runs run-pipeline.sh
│   │   ├── plan-review.md        # Plan → review (dispatches to agents)
│   │   ├── design.md · ar.md · pmatch.md · security-review.md   # per-phase helpers
│   │   └── pipeline-scan.md      # Proactive scanning (code-scanner agent)
│   ├── agents/                   # 15 agents — reachable from a live slash command
│   │   ├── architect.md · atomic-planner.md · adversarial-coordinator.md
│   │   ├── security-auditor.md · code-scanner.md · builder.md · denoiser.md …
│   ├── lib/                      # Reference docs (error patterns, next steps, context)
│   ├── templates/                # Pattern references (api-endpoint, auth-flow, crud-page, webhook)
│   ├── hooks/                    # protect-files.sh + auto-format.sh (Claude Code, via settings.json);
│   │   │                         #   detect-project.sh + notify.sh (run-pipeline.sh startup/exit)
│   ├── history.json              # Run history (per-run costUSD)
│   └── artifacts/                # Per-session output ({session}/*.md + .raw/.err/.verdict)
│
├── targets/                      # Other tool ports (cursor, cline, windsurf, copilot, aider, codex)
├── demo/                         # Demo kit (starter Express project + red acceptance test)
└── pipeline-viz/                 # Real-time pixel-art visualization
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

## Tool Support

This pipeline is **tool-agnostic**. Drop the `.claude/` folder into any project and use it with:

| Tool | Status | Notes |
|------|--------|-------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Full support | Native slash commands |
| [Cursor](https://cursor.sh) | Full support | Via rules and agents |
| [Windsurf](https://codeium.com/windsurf) | Full support | Via rules and agents |
| [GitHub Copilot](https://github.com/features/copilot) | Full support | Via instructions |
| [Cline](https://github.com/cline/cline) | Full support | Via custom instructions |
| [Aider](https://aider.chat) | Full support | Via conventions |

---

## Live Visualization

The `pipeline-viz/` folder includes a **real-time pixel-art visualization** that shows your pipeline progress as an animated isometric office with agents working at desks.

```bash
cd pipeline-viz && npm install && npm start
```

<!-- TODO: Add a screenshot of pipeline-viz here -->
<!-- ![Pipeline Visualization](.github/assets/pipeline-viz.png) -->

---

## Requirements

- An AI coding tool (Claude Code, Cursor, Cline, Windsurf, Copilot, Codex, or Aider)
- Node.js (for build/type-check steps in QA phases)
- A project with a `CLAUDE.md` file

---

## Contributing

Contributions are welcome — open an issue or a PR. Whether it's a new agent, a
bug fix, or better docs, it's appreciated.

---

## License

MIT — see [`LICENSE`](LICENSE). Use it, adapt it, ship it.
