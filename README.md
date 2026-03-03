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
| **Model Allocation** | Haiku/Sonnet/Opus strategically assigned by phase complexity |
| **Continuation Planning** | Large tasks auto-split into phases (>8 steps) |
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
│  Phase 0: Pre-Check [HAIKU]           (NEVER SKIPPED)           │
│  • Searches codebase for existing implementations               │
│  • Checks package.json for installed libraries                  │
│  • Recommends: EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Requirements [SONNET]                                 │
│  • Extracts requirements from task                              │
│  • Minimal Q&A (max 3 questions if truly ambiguous)             │
│  Output: brief.md                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Design [OPUS]               [CACHE: patterns]         │
│  • Creates technical design with citations                      │
│  • Uses cached patterns (rest-api, auth-jwt, crud-endpoint)     │
│  Output: design.md                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Adversarial Review [OPUS]   [HARD GATE]               │
│  • Single-pass critique from 3 angles                           │
│  • Auto-retry on REVISE_DESIGN (max 1)                          │
│  Output: critique.md                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: Planning [SONNET]                                     │
│  • Deterministic steps with BEFORE/AFTER code                   │
│  • Max 8 steps per phase                                        │
│  • If >8 steps needed → NEEDS_CONTINUATION (auto-splits)        │
│  Output: plan.md                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: Drift Detection [HAIKU]                               │
│  • Verifies plan covers all requirements                        │
│  • Auto-fix on <90% coverage                                    │
│  Output: drift-report.md                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 6: Build [SONNET]                                        │
│  • Executes plan step-by-step                                   │
│  • Context isolation per step                                   │
│  • Auto-retry on failure (max 2 per step)                       │
│  Output: build-report.md + code changes                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phases 7-11: QA Pipeline (parallel)  [CACHE: qa-rules]         │
│  7. Denoise [HAIKU] — remove debug artifacts                    │
│  8. Quality Fit [HAIKU] — types, lint                           │
│  9. Quality Behavior [SONNET] — tests                           │
│  10. Quality Docs [HAIKU] — Swagger, JSDoc                      │
│  11. Security [OPUS] — OWASP scan     [CACHE: security] [HARD]  │
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

## Model Allocation

Strategic model selection based on task complexity:

| Model | Phases | Tasks | Cost |
|-------|--------|-------|------|
| **Haiku** | 0, 5, 7, 8, 10 | Search, validation, pattern matching | $0.25/1M |
| **Sonnet** | 1, 4, 6, 9 | Reasoning, code generation | $3/1M |
| **Opus** | 2, 3, 11 | Architecture, critique, security | $15/1M |

### Why This Matters

- **Haiku** is 60x cheaper than Opus — perfect for deterministic tasks
- **Opus** catches subtle design flaws and security issues — worth the cost
- **Sonnet** handles the balanced middle ground efficiently

### Cost Per Run

```
Optimized allocation:  ~$0.20/run
  ├─ Haiku phases:     ~8k tokens  = $0.002
  ├─ Sonnet phases:    ~15k tokens = $0.045
  └─ Opus phases:      ~10k tokens = $0.150

vs. All Sonnet:        ~$0.23/run (lower quality on critical phases)
vs. All Opus:          ~$1.17/run (overkill for simple tasks)
```

---

## Continuation Planning

For tasks requiring more than 8 steps, the pipeline automatically splits into phases:

```
User: /auto-pipeline "add full auth with JWT, OAuth, password reset"

Phase 4 (Planning) detects 14 steps needed:
├── Verdict: NEEDS_CONTINUATION
├── Phase 1 of 3: Core JWT + refresh tokens (6 steps)
├── Phase 2 of 3: OAuth provider setup (5 steps)
└── Phase 3 of 3: Frontend components (3 steps)

Pipeline:
1. Builds Phase 1 → QA → Security
2. Prompts: "Phase 1 complete. Continue to Phase 2? [y/n]"
3. Loops until all phases complete
```

### Rules

- Each phase is independently testable
- Max 8 steps per phase
- All remaining phases documented upfront
- Full QA pipeline runs after each phase

### Output

```
Pipeline Complete [MULTI-PHASE: 3 of 3]

Build Phases:
  Phase 1/3: Core JWT + refresh tokens  ✓ (Steps 1-6)
  Phase 2/3: OAuth provider setup       ✓ (Steps 1-5)
  Phase 3/3: Frontend components        ✓ (Steps 1-3)

Total steps executed: 14 (across 3 phases)
```

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

Token-efficient versions of all agents with strategic model assignment:

| Agent | Model | Token Reduction |
|-------|-------|-----------------|
| pre-check | Haiku | — |
| requirements-slim | Sonnet | 76% |
| architect-slim | **Opus** | 60% |
| adversarial-slim | **Opus** | 78% |
| planner-slim | Sonnet | 78% |
| drift-detector | Haiku | — |
| builder-slim | Sonnet | 82% |
| denoiser | Haiku | — |
| quality-fit | Haiku | — |
| quality-behavior | Sonnet | — |
| quality-docs | Haiku | — |
| security-slim | **Opus** | 84% |

**Total savings: 40-60% per pipeline run + optimized model costs**

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
├── agents/                   # Model assignments in frontmatter
│   ├── pre-check.md          # [haiku] Pre-flight search
│   ├── requirements-slim.md  # [sonnet] Requirements extraction
│   ├── architect-slim.md     # [opus] Technical design
│   ├── adversarial-slim.md   # [opus] Design critique
│   ├── planner-slim.md       # [sonnet] Step planning
│   ├── drift-detector.md     # [haiku] Plan verification
│   ├── builder-slim.md       # [sonnet] Code execution
│   ├── denoiser.md           # [haiku] Debug removal
│   ├── quality-fit.md        # [haiku] Lint/conventions
│   ├── quality-behavior.md   # [sonnet] Tests/behavior
│   ├── quality-docs.md       # [haiku] Documentation
│   └── security-slim.md      # [opus] Security scan
│
├── lib/
│   ├── config.md             # Profiles, budgets, model allocation
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

## Token & Cost Efficiency

| Optimization | Token Savings | Cost Impact |
|--------------|---------------|-------------|
| Slim agents | 40-60% | Direct reduction |
| Model allocation | — | 60x cheaper on Haiku phases |
| Phase skipping (yolo) | 30-40% | Fewer API calls |
| Caching | 15-25% | Compounding savings |
| Context isolation | 10-20% | Smaller per-step context |

**Token Example:**
```
Original pipeline:     ~78k tokens
With slim agents:      ~35k tokens
With yolo profile:     ~18k tokens
With caching:          ~15k tokens
```

**Cost Example (standard profile):**
```
Single-phase task:     ~$0.20/run
Multi-phase task:      ~$0.18/phase (QA cached after first)

Breakdown:
  Haiku phases:        $0.002 (search, validation, docs)
  Sonnet phases:       $0.045 (requirements, planning, build)
  Opus phases:         $0.150 (design, critique, security)
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
