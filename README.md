# Claude Code Auto-Pipeline

An automated, token-efficient development pipeline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). One command transforms a task description into production-ready code — with intelligent caching, pre-flight checks, and configurable automation levels.

```bash
/auto-pipeline "add user authentication with JWT"
```

**Perfect for vibe coders** who want Claude to handle the entire development flow with minimal intervention.

> **Looking for the manual workflow?** See the [`full-workflow-legacy`](https://github.com/TheAstrelo/Claude-Pipeline/tree/full-workflow-legacy) branch for the original 11-phase pipeline with human checkpoints.

---

## Features

| Feature | Benefit |
|---------|---------|
| **3 Profiles** | `yolo` (fast), `standard` (balanced), `paranoid` (thorough) |
| **Pre-Check Phase** | Finds existing code/libraries before building |
| **Slim Agents** | 60-84% fewer tokens than standard agents |
| **Output Validation** | Objective checks replace self-reported confidence |
| **Caching** | Security scans, patterns, QA rules cached across runs |
| **Auto-Recovery** | Retries failures before pausing |

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

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Node.js (for build/type-check steps)
- Project with `CLAUDE.md`

---

## License

MIT — use it, adapt it, ship it.
