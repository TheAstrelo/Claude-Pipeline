<div align="center">

# Claude Code Auto-Pipeline

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-blueviolet)](https://docs.anthropic.com/en/docs/claude-code)
[![Agents](https://img.shields.io/badge/Agents-41-green)](.claude/agents/)
[![Tool Agnostic](https://img.shields.io/badge/Works%20with-Claude%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Copilot-orange)](#tool-support)

**AI coding tools generate code fast — but ship bugs faster.**
This pipeline adds structured quality gates between "idea" and "production" so you stop crossing your fingers every time you deploy.

One command. 11 phases. Security, accessibility, performance, and testing — handled automatically.

```bash
/auto-pipeline "add user authentication with JWT"
```

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

**Results from real usage:**
- Caught N+1 queries, XSS vectors, and missing auth checks that would have shipped otherwise
- 40-60% token savings vs. naive "just ask Claude to build it" approaches
- Works with any codebase — drop in the `.claude/` folder and go

> **Looking for the manual workflow?** See the [`full-workflow-legacy`](https://github.com/TheAstrelo/Claude-Pipeline/tree/full-workflow-legacy) branch for the original 11-phase pipeline with human checkpoints.

---

## Features

| Feature | Benefit |
|---------|---------|
| **3 Profiles** | `yolo` (fast), `standard` (balanced), `paranoid` (thorough) |
| **Pre-Check Phase** | Finds existing code/libraries before building from scratch |
| **41 Specialized Agents** | Security, accessibility, performance, tech debt, and more |
| **Slim Agents** | 60-84% fewer tokens than standard agents |
| **Output Validation** | Objective checks replace self-reported confidence |
| **Caching** | Security scans, patterns, QA rules cached across runs |
| **Auto-Recovery** | Retries failures before pausing |
| **Tool Agnostic** | Works with Claude Code, Cursor, Windsurf, Copilot, Cline, Aider |

---

## Quick Start

### 1. Copy to your project

```bash
git clone https://github.com/TheAstrelo/Claude-Pipeline.git
cp -r Claude-Pipeline/.claude/ /path/to/your/project/
```

### 2. Start Claude Code

```bash
npx @anthropic-ai/claude-code@latest
```

### 3. Run the pipeline

```bash
# Fast prototyping
/auto-pipeline --profile=yolo "add a logout button"

# Balanced (default)
/auto-pipeline "implement user dashboard"

# Full oversight
/auto-pipeline --profile=paranoid "payment integration"
```

---

## Profiles

| Profile | Skips | Gate Mode | Use Case |
|---------|-------|-----------|----------|
| `yolo` | Phases 3,5,7-10 | Only critical fails pause | Prototypes, experiments |
| `standard` | None | Critical pauses, others warn | Normal development |
| `paranoid` | None | Any issue pauses | Production, sensitive code |

```bash
/auto-pipeline --profile=yolo "quick prototype"
/auto-pipeline --profile=paranoid "handle payments"
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        /auto-pipeline                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: Pre-Check (NEVER SKIPPED)                             │
│  • Searches codebase for existing implementations               │
│  • Checks package.json for installed libraries                  │
│  • Recommends: EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Requirements                                          │
│  • Extracts requirements from task                              │
│  • Minimal Q&A (max 3 questions if truly ambiguous)             │
│  Output: brief.md                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Design                      [CACHE: patterns]         │
│  • Creates technical design with citations                      │
│  • Uses cached patterns (rest-api, auth-jwt, crud-endpoint)     │
│  Output: design.md                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Adversarial Review          [HARD GATE]               │
│  • Single-pass critique from 3 angles                           │
│  • Auto-retry on REVISE_DESIGN (max 1)                          │
│  Output: critique.md                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: Planning                                              │
│  • Deterministic steps with BEFORE/AFTER code                   │
│  • Max 8 steps                                                  │
│  Output: plan.md                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: Drift Detection                                       │
│  • Verifies plan covers all requirements                        │
│  • Auto-fix on <90% coverage                                    │
│  Output: drift-report.md                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 6: Build                                                 │
│  • Executes plan step-by-step                                   │
│  • Context isolation per step                                   │
│  • Auto-retry on failure (max 2 per step)                       │
│  Output: build-report.md + code changes                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phases 7-11: QA Pipeline (parallel)  [CACHE: qa-rules]         │
│  7. Denoise — remove debug artifacts                            │
│  8. Quality Fit — types, lint                                   │
│  9. Quality Behavior — tests                                    │
│  10. Quality Docs — Swagger, JSDoc                              │
│  11. Security — OWASP scan            [CACHE: security] [HARD]  │
│  Output: qa-report.md                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                         ✅ Done
```

---

## Pre-Check Phase

Before building anything, the pipeline searches for existing solutions:

```
User: "add user authentication"

Pre-Check runs:
├── grep "auth" src/pages/api/     → finds /api/auth/login.ts
├── grep "next-auth" package.json  → finds next-auth installed
└── Recommendation: EXTEND_EXISTING

Result: Pipeline extends existing auth instead of rebuilding
```

**Prevents duplicate work** — Claude won't rebuild what already exists.

---

## Caching

Cache artifacts to save tokens across runs.

| Cached | Key | Tokens Saved |
|--------|-----|--------------|
| Security scans | lockfile hash | ~3000/run |
| Design patterns | pattern name | ~1500/run |
| QA rules | framework | ~1000/run |

### Commands

```bash
/cache-stats    # View cache hits and savings
/cache-clear    # Clear all or specific cache
/cache-warm     # Pre-populate patterns
```

### Pre-Cached Patterns

- `rest-api` — REST endpoint with auth, validation, errors
- `auth-jwt` — JWT authentication flow
- `crud-endpoint` — Full CRUD with soft delete

---

## Output-Based Validation

**No more self-reported confidence.** Each phase is validated with objective checks:

```yaml
Phase 3 (Adversarial):
  ✓ has_verdict       → grep "APPROVED|REVISE"
  ✓ no_high_severity  → ! grep "| HIGH |"
  ✓ no_consensus      → no issues raised by 2+ critics

Result: All pass → AUTO | HARD fail → PAUSE | SOFT fail → WARN
```

### Gate Types

| Gate | Phases | Behavior |
|------|--------|----------|
| HARD | 0, 3, 11 | Must pass or pipeline pauses |
| SOFT | 1, 2, 4, 5 | Warn and proceed |
| NONE | 6-10 | Auto-proceed, auto-fix |

---

## Slim Agents

Token-efficient versions of all agents:

| Agent | Reduction |
|-------|-----------|
| adversarial-slim | 78% |
| planner-slim | 78% |
| security-slim | 84% |
| builder-slim | 82% |
| requirements-slim | 76% |
| architect-slim | 60% |

**Total savings: 40-60% per pipeline run**

---

## File Structure

```
.claude/
├── commands/
│   ├── auto-pipeline.md      # Main automated pipeline
│   ├── pre-check.md          # Standalone pre-check
│   ├── cache-stats.md        # View cache
│   ├── cache-clear.md        # Clear cache
│   └── ...                   # Individual phase commands
│
├── agents/
│   ├── pre-check.md          # Pre-flight search agent
│   ├── *-slim.md             # Token-efficient agents
│   └── ...                   # Full agents (legacy)
│
├── lib/
│   ├── config.md             # Profiles and settings
│   ├── validator.md          # Output validation rules
│   └── cache.md              # Caching documentation
│
├── cache/
│   ├── manifest.json         # Cache index
│   ├── patterns/             # Design pattern cache
│   ├── security/             # Security scan cache
│   └── qa-rules/             # QA rules cache
│
├── hooks/
│   ├── cache.sh              # Cache operations
│   ├── auto-format.sh        # Post-edit formatting
│   └── protect-files.sh      # File protection
│
├── rules/                    # Project conventions
└── artifacts/                # Per-session outputs
```

---

## Customization

### Rules

Edit `.claude/rules/` for your stack:

```markdown
# .claude/rules/api.md
- Use Hono instead of Express
- Return { data, error } shape
```

### Hooks

Edit `.claude/hooks/` for your tools:

```bash
# auto-format.sh
bunx biome format --write "$FILE"
```

### Patterns

Add custom patterns to `.claude/cache/patterns/`:

```markdown
# .claude/cache/patterns/my-pattern.md
## Structure
...
## Template
...
```

---

## Individual Commands

Run any phase standalone:

| Command | Purpose |
|---------|---------|
| `/pre-check <task>` | Search for existing solutions |
| `/cache-stats` | View cache statistics |
| `/cache-clear` | Clear cache |
| `/arm <task>` | Requirements only |
| `/design` | Design only |
| `/ar` | Adversarial review only |
| `/plan` | Planning only |
| `/build` | Build only |
| `/security-review` | Security scan only |

---

## Token Efficiency

| Optimization | Savings |
|--------------|---------|
| Slim agents | 40-60% |
| Phase skipping (yolo) | 30-40% |
| Caching | 15-25% (compounding) |
| Context isolation | 10-20% |

**Example:**
```
Original pipeline:     ~78k tokens
With slim agents:      ~35k tokens
With yolo profile:     ~18k tokens
With caching:          ~15k tokens
```

---

## Legacy Pipeline

For the original manual 11-phase pipeline with human checkpoints at every gate:

```bash
git checkout full-workflow-legacy
```

Or use directly:
```bash
/dev-pipeline "your task"  # Manual checkpoints
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

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (or any supported tool above)
- Node.js (for build/type-check steps)
- A project with a `CLAUDE.md` file

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Whether it's a new agent, a bug fix, or better docs — PRs are appreciated.

---

## License

MIT — use it, adapt it, ship it. See [LICENSE](LICENSE).
