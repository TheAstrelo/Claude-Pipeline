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
# Fast prototyping — skip reviews, just build
/auto-pipeline --yolo "add a logout button"

# Balanced (default) — full pipeline
/auto-pipeline "implement user dashboard"

# Full oversight — pause on any issue
/auto-pipeline --paranoid "payment integration"

# Skip QA but keep safety checks
/auto-pipeline --fast "add dashboard widget"
```

---

## Enhanced Flags

Control pipeline behavior with powerful flags:

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing files |
| `--fast` | Skip QA phases 7-10, keep adversarial & security |
| `--fix` | Auto-retry failures up to 3 times |
| `--auto` / `--yolo` | Never pause, log warnings only |
| `--quiet` | Single-line output for scripting |
| `--only=X` | Run specific phases (e.g., `--only=0,2,6`) |
| `--preview` | Show git diff before applying changes |
| `--test` | Run tests after build phase |
| `--branch[=name]` | Create feature branch before build |
| `--pr` | Create PR after successful completion |
| `--template=X` | Use pre-configured template |
| `--estimate` | Show cost estimate without running |
| `--resume[=N]` | Resume from last or specific phase |

### Examples

```bash
# Preview what would change
/auto-pipeline --dry-run "refactor auth middleware"

# Full pipeline with tests, then create PR
/auto-pipeline --test --pr "add user authentication"

# Preview diff before applying
/auto-pipeline --preview --branch=feature/auth "add login"

# Check cost before running
/auto-pipeline --estimate "implement payment processing"

# Use template for common patterns
/auto-pipeline --template=api-endpoint "users GET /api/users"

# Run only design and build phases
/auto-pipeline --only=2,6 "quick prototype"
```

---

## Templates

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

## The 12 Phases

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
| **3. Adversarial Review** | Three critics stress-test the design | Catches security gaps and edge cases before code |
| **4. Planning** | Produces exact BEFORE/AFTER code for every file change | Every change is deterministic |
| **5. Drift Detection** | Verifies the plan covers every design requirement | Nothing gets lost or added |
| **6. Build** | Executes the plan step by step with verification | No YOLO code dumps |
| **7. Denoise** | Removes console.log, debugger, commented-out code | Clean production code |
| **8. Quality Fit** | Type checking, linting, convention compliance | Code matches project standards |
| **9. Quality Behavior** | Runs build + tests, verifies behavior | Code actually works as designed |
| **10. Quality Docs** | Checks Swagger/JSDoc coverage | API documentation stays current |
| **11. Security** | OWASP scan: injection, XSS, auth bypass, secrets | Vulnerabilities caught before merge |

---

## Profiles

| Profile | What Gets Skipped | Gate Mode | When To Use |
|---------|-------------------|-----------|-------------|
| **yolo** | 3, 5, 7-10 | soft | Prototyping, experiments |
| **fast** | 7-10 | standard | Feature dev, moderate risk |
| **standard** | Nothing | mixed | Normal development (default) |
| **paranoid** | Nothing | hard | Production, payments, auth |

```bash
/auto-pipeline --yolo "quick prototype"
/auto-pipeline --fast "add dashboard widget"
/auto-pipeline --paranoid "handle payments"
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
  1  ✓        add user authentication        $0.24    3m 12s
  2  ✓        fix login bug                  $0.08    1m 04s
  3  ✗        implement payment flow         $0.15    2m 30s
               └─ Failed: Phase 11 (Security)

Summary:
  Total runs: 47    Success: 44 (94%)    Failed: 3 (6%)
  Total cost: $8.42
```

### Undo Last Run

```bash
/pipeline-undo
```

Reverts to the git checkpoint created before the pipeline made changes.

---

## Cost Efficiency

### Model Routing

Only 2 of 12 phases need the expensive model:

| Phase | Model Tier | Why |
|-------|-----------|-----|
| Design (2), Adversarial Review (3) | **Strong** | Architecture and critique require deep reasoning |
| All other phases (0,1,4-11) | **Fast** | Mechanical tasks |

**Result: ~70% cost reduction** compared to using the strongest model for everything.

### Cost Estimation

```bash
/auto-pipeline --estimate "implement user authentication"
```

```
Estimated Cost:
  ├─ Minimum: $0.15 (best case)
  ├─ Expected: $0.22 (typical)
  └─ Maximum: $0.45 (worst case)

Estimated Duration: 2-4 minutes
```

---

## File Structure

```
Claude-Pipeline/
├── .claude/
│   ├── commands/                 # Slash commands
│   │   ├── auto-pipeline.md      # Main pipeline
│   │   ├── pipeline-undo.md      # Undo last run
│   │   ├── pipeline-history.md   # View past runs
│   │   ├── pipeline-estimate.md  # Cost estimation
│   │   └── pipeline-scan.md      # Proactive scanning
│   ├── agents/                   # Agent definitions
│   │   ├── suggestion-engine.md  # Error fix suggestions
│   │   └── code-scanner.md       # Proactive scanning
│   ├── lib/                      # Configuration
│   │   ├── error-patterns.md     # Error → fix mappings
│   │   ├── next-steps.md         # Success suggestions
│   │   └── context-engine.md     # History recommendations
│   ├── templates/                # Quick-start templates
│   │   ├── api-endpoint.md
│   │   ├── auth-flow.md
│   │   ├── crud-page.md
│   │   └── webhook.md
│   ├── hooks/                    # Automation hooks
│   │   ├── notify.sh             # Completion notifications
│   │   └── detect-project.sh     # Project detection
│   ├── history.json              # Run history
│   └── artifacts/                # Per-session output
│
├── targets/                      # Other tool implementations
│   ├── cursor/
│   ├── cline/
│   ├── windsurf/
│   ├── copilot/
│   └── aider/
│
└── demo/                         # Demo kit
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

```bash
# auto-format.sh — runs after edits
bunx biome format --write "$FILE"

# notify.sh — cross-platform completion notification
# detect-project.sh — auto-detect project type
```

---

## Requirements

- An AI coding tool (Claude Code, Cursor, Cline, Windsurf, Copilot, Codex, or Aider)
- Node.js (for build/type-check steps in QA phases)
- A project to run it on

---

## License

MIT
