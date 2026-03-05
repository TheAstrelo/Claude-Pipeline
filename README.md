# AI Development Pipeline

A structured, multi-phase development workflow for AI coding tools. One command takes a task from idea to production-ready code — with design reviews, adversarial critique, drift detection, and automated QA.

```bash
/auto-pipeline "add user authentication with JWT"
```

Works with **Claude Code, Cursor, Cline, Windsurf, GitHub Copilot, and Aider**.

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

---

## The Simple Explanation

Imagine you hire a contractor to renovate your kitchen.

A **bad contractor** shows up, starts ripping out cabinets, and figures it out as they go.

A **good contractor**:
1. Asks what you need — how do you cook? what's your budget?
2. Draws up blueprints based on actual building codes
3. Has an inspector review the blueprints before any work starts
4. Creates a step-by-step work order — plumbing first, then electrical, then cabinets
5. Double-checks the work order matches the blueprints
6. Builds it, following the plan exactly
7. Does a final inspection — safe? up to code? clean?

This pipeline is the "good contractor" process, but for AI writing software.

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
# See "Tool-Specific Setup" below
```

### 3. Run the pipeline

```bash
# Fast prototyping — skip reviews, just build
/auto-pipeline --profile=yolo "add a logout button"

# Balanced (default) — full pipeline
/auto-pipeline "implement user dashboard"

# Full oversight — pause on any issue
/auto-pipeline --profile=paranoid "payment integration"
```

---

## How It Works

### The 12 Phases

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
                          ┌──────────────┐
                          │  Phase 11    │
                          │  Security    │
                          │  [HARD]      │
                          └──────────────┘
                                    │
                                    ▼
                                  Done
```

| Phase | What It Does | Why It Matters |
|-------|-------------|----------------|
| **0. Pre-Check** | Searches your codebase for existing code and libraries | Prevents rebuilding what already exists |
| **1. Requirements** | Extracts testable success criteria from your task | Turns a vague idea into a concrete spec |
| **2. Design** | Creates architecture decisions citing real documentation | Decisions are traceable, not hallucinated |
| **3. Adversarial Review** | Three critics stress-test the design (Architect, Skeptic, Implementer) | Catches security gaps and edge cases before code is written |
| **4. Planning** | Produces exact BEFORE/AFTER code for every file change | Every change is deterministic — no improvisation |
| **5. Drift Detection** | Verifies the plan covers every design requirement | Nothing from the design gets lost or added |
| **6. Build** | Executes the plan step by step with verification | No YOLO code dumps |
| **7. Denoise** | Removes `console.log`, `debugger`, commented-out code | Clean production code |
| **8. Quality Fit** | Type checking, linting, convention compliance | Code matches project standards |
| **9. Quality Behavior** | Runs build + tests, verifies behavior | Code actually works as designed |
| **10. Quality Docs** | Checks Swagger/JSDoc coverage | API documentation stays current |
| **11. Security** | OWASP scan: injection, XSS, auth bypass, secrets | Vulnerabilities caught before merge |

### Gates

Each phase has a gate that decides what happens next:

| Gate | Behavior | Assigned To |
|------|----------|-------------|
| **HARD** | Must pass or pipeline pauses for your review | Phases 0, 3, 11 |
| **SOFT** | Warns and proceeds | Phases 1, 2, 4, 5 |
| **NONE** | Always proceeds, auto-fixes when possible | Phases 6-10 |

Gates use **objective validation** (does the artifact contain the required sections? do referenced files exist? are there fewer than 3 medium-severity issues?) — not self-reported confidence scores.

### Feedback Loops

The pipeline tries to fix itself before asking you to intervene:

| Failure | Recovery | Max Retries |
|---------|----------|-------------|
| Design has critical issues (Phase 3) | Loop back to Phase 2 with critique feedback | 1 |
| Plan misses design requirements (Phase 5) | Loop back to Phase 4 to add missing steps | 1 |
| Build step fails (Phase 6) | Retry the step with error context | 2 per step |
| QA finds issues (Phases 7-10) | Auto-fix inline | 1 |

---

## Profiles

| Profile | What Gets Skipped | When To Use |
|---------|-------------------|-------------|
| **yolo** | Reviews, drift check, most QA | Prototyping, experiments, "just make it work" |
| **standard** | Nothing | Normal development (default) |
| **paranoid** | Nothing, and any issue pauses | Production code, payments, auth, sensitive features |

```bash
/auto-pipeline --profile=yolo "quick prototype"
/auto-pipeline --profile=paranoid "handle payments"
```

---

## Tool-Agnostic

The pipeline is defined in a single [specification](PIPELINE-SPEC.md) (990 lines) that is independent of any AI tool. It's then implemented natively for each:

| Tool | Location | Setup |
|------|----------|-------|
| **Claude Code** | `.claude/` | `cp -r .claude/ your-project/` |
| **Cursor** | `targets/cursor/` | `cp -r targets/cursor/.cursor/ your-project/` |
| **Cline** | `targets/cline/` | `cp -r targets/cline/.clinerules/ your-project/` |
| **Windsurf** | `targets/windsurf/` | Copy windsurf config to your project |
| **GitHub Copilot** | `targets/copilot/` | `cp -r targets/copilot/.github/ your-project/` |
| **Aider** | `targets/aider/` | Copy aider config to your project |
| **Codex** | `targets/codex/` | Copy codex config to your project |

Same 12 phases, same gates, same validation rules, same artifact structure — just mapped to each tool's native format.

---

## Cost Efficiency

### Model Routing

Only 2 of 12 phases need the expensive model. The rest use fast/cheap models:

| Phase | Model Tier | Why |
|-------|-----------|-----|
| Design (2), Adversarial Review (3) | **Strong** | Architecture and critique require deep reasoning |
| All other phases (0,1,4-11) | **Fast** | Mechanical tasks — search, plan, build, scan |

**Result: ~70% cost reduction** compared to using the strongest model for everything.

### Token Efficiency

| Optimization | Savings |
|-------------|---------|
| Slim agents (included) | 40-60% fewer tokens per agent |
| Phase skipping (yolo profile) | 30-40% fewer phases |
| Caching (security, patterns, QA rules) | 15-25% on repeat runs |
| Context isolation (each phase gets only what it needs) | 10-20% |

---

## Artifacts

Every pipeline run produces artifacts in `.claude/artifacts/{session}/`:

| File | Phase | Contents |
|------|-------|----------|
| `pre-check.md` | 0 | Existing code found, library recommendations |
| `brief.md` | 1 | Problem statement, success criteria, scope |
| `design.md` | 2 | Architecture decisions with source citations |
| `critique.md` | 3 | Issues from 3 critic angles, verdict |
| `plan.md` | 4 | Step-by-step BEFORE/AFTER code changes |
| `drift-report.md` | 5 | Coverage matrix, missing/extra items |
| `build-report.md` | 6 | Step results, build/type check status |
| `qa-report.md` | 7-11 | Denoise, lint, tests, docs, security results |

These are your audit trail. Every design decision is traceable to a source. Every code change is traceable to a plan step. Every plan step is traceable to a design requirement.

---

## Individual Commands

Run any phase standalone:

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

## Customization

### Rules

Add project-specific conventions in `.claude/rules/`:

```markdown
# .claude/rules/api.md
- Use Hono instead of Express
- Return { data, error } shape
```

### Cached Patterns

Add reusable design patterns in `.claude/cache/patterns/`:

- `rest-api.md` — REST endpoint with auth, validation, errors
- `auth-jwt.md` — JWT authentication flow
- `crud-endpoint.md` — Full CRUD with soft delete
- Add your own for repeated patterns in your codebase

### Hooks

Add formatting or protection hooks in `.claude/hooks/`:

```bash
# auto-format.sh — runs after edits
bunx biome format --write "$FILE"
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

## Demo

A ready-to-run demo is included in `demo/`:

- **Starter project:** A tiny Express API (4 files)
- **Task:** "Add user authentication with JWT"
- **Expected output:** Example artifacts showing what each phase produces

```bash
cp -r demo/starter-project/ /tmp/pipeline-demo/
cd /tmp/pipeline-demo/
npm install

# Run with your preferred tool
/auto-pipeline --profile=yolo "add user authentication with JWT"
```

See [`demo/README.md`](demo/README.md) for the full walkthrough.

---

## File Structure

```
Claude-Pipeline/
├── PIPELINE-SPEC.md              # Tool-agnostic specification (990 lines)
├── README.md                     # You are here
│
├── .claude/                      # Claude Code implementation
│   ├── commands/                 # Slash commands (/auto-pipeline, /dev-pipeline, etc.)
│   ├── agents/                   # 12 agent definitions + slim variants
│   ├── lib/                      # Profiles, validators, cache config
│   ├── cache/                    # Cached patterns, security scans, QA rules
│   ├── hooks/                    # Auto-format, file protection
│   ├── rules/                    # Project conventions (api, database, react)
│   └── artifacts/                # Per-session output
│
├── targets/                      # Implementations for other tools
│   ├── cursor/                   # Cursor agent definitions
│   ├── cline/                    # Cline rules and workflows
│   ├── windsurf/                 # Windsurf workflow config
│   ├── copilot/                  # GitHub Copilot agents
│   ├── codex/                    # OpenAI Codex config
│   └── aider/                    # Aider conversation config
│
└── demo/                         # Demo kit
    ├── starter-project/          # Tiny Express app (4 files)
    └── expected-output/          # Example artifacts for "add JWT auth"
```

---

## Implementing for a New Tool

The [pipeline specification](PIPELINE-SPEC.md) is tool-agnostic. To add support for a new AI coding tool:

1. **Map agent roles** to the tool's agent/prompt system (12 roles, each with defined inputs/outputs/tools)
2. **Map validation** to the tool's capabilities (shell scripts, inline checks, or prompt instructions)
3. **Map the orchestrator** to the tool's workflow system (slash command, master prompt, or script)
4. **Map caching** to the tool's storage (filesystem, database, or in-memory)
5. **Map gates** to the tool's interaction model (PAUSE = ask user, WARN = log, AUTO = silent)
6. **Map model routing** to the tool's model selection (strong for phases 2-3, fast for everything else)

See `targets/` for reference implementations.

---

## Requirements

- An AI coding tool (Claude Code, Cursor, Cline, Windsurf, Copilot, Codex, or Aider)
- Node.js (for build/type-check steps in QA phases)
- A project to run it on

---

## License

MIT
