# Claude Code Dev Pipeline

An 11-phase, quality-gated development pipeline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It turns a single task description into production-ready code through structured requirements gathering, adversarial design review, deterministic planning, context-isolated building, and automated QA — with human checkpoints at every major gate.

```
/dev-pipeline Add a notes feature to the company detail view
```

That one command kicks off the entire flow below.

---

## How It Works

```
  YOU                          CLAUDE CODE
   |                               |
   |  /dev-pipeline <task>         |
   |------------------------------>|
   |                               |
   |   Phase 1: Requirements       |  Asks clarifying questions,
   |   brief.md                    |  explores codebase for context
   |<------------------------------|
   |                               |
   |  "continue" / feedback        |
   |------------------------------>|
   |                               |
   |   Phase 2: Design             |  Researches live docs,
   |   design.md                   |  cites sources for decisions
   |<------------------------------|
   |                               |
   |  "continue" / feedback        |
   |------------------------------>|
   |                               |
   |   Phase 3: Adversarial Review |  3 critic perspectives attack
   |   critique.md                 |  the design for weaknesses
   |<------------------------------|
   |                               |
   |  "continue" / "revise"        |  Can loop back to Phase 2
   |------------------------------>|
   |                               |
   |   Phase 4: Planning           |  Atomic steps with exact
   |   plan.md                     |  BEFORE/AFTER code snippets
   |<------------------------------|
   |                               |
   |  "continue" / feedback        |
   |------------------------------>|
   |                               |
   |   Phase 5: Drift Detection    |  Compares plan vs design
   |   drift-report.md             |  for missing coverage
   |<------------------------------|
   |                               |
   |  "continue" / "fix-plan"      |  Can loop back to Phase 4
   |------------------------------>|
   |                               |
   |   Phase 6: Build              |  Executes plan step-by-step
   |   build-report.md             |  with context isolation
   |<------------------------------|
   |                               |
   |  "continue"                   |
   |------------------------------>|
   |                               |
   |   Phases 7-11: QA Pipeline    |  Runs automatically:
   |   qa-report.md                |  Denoise -> Quality Fit ->
   |                               |  Quality Behavior ->
   |                               |  Quality Docs -> Security
   |<------------------------------|
   |                               |
   |   Final Report                |
   |<------------------------------|
```

After each artifact-producing phase, the pipeline **pauses** and presents the output. You say `"continue"` to advance, or give feedback to revise. The QA phases (7-11) run back-to-back automatically.

---

## Quick Start

### 1. Copy the `.claude/` directory into your project

```bash
# Clone this repo
git clone https://github.com/TheAstrelo/Claude-Pipeline.git

# Copy into your project
cp -r Claude-Pipeline/.claude/ /path/to/your/project/.claude/
```

### 2. Customize for your project

The pipeline ships with example rules for a Next.js/TypeScript/PostgreSQL/MUI stack. You'll want to adapt these to your own stack:

| File | What to customize |
|------|-------------------|
| `.claude/rules/api.md` | Your API conventions (auth patterns, response formats, doc standards) |
| `.claude/rules/database.md` | Your DB conventions (ORM/raw SQL, naming, migration patterns) |
| `.claude/rules/react.md` | Your frontend conventions (component library, state management, file structure) |
| `.claude/hooks/auto-format.sh` | Your formatter (prettier, biome, black, etc.) |
| `.claude/hooks/protect-files.sh` | Files that should never be edited by AI (.env, lock files, CI config) |
| `.claude/skills/` | Scaffolding templates for your project's common patterns |

### 3. Update your `CLAUDE.md`

Add the pipeline reference to your project's `CLAUDE.md` so Claude Code knows to use it. See the included [`CLAUDE.md`](CLAUDE.md) for a complete example. The key section is:

```markdown
## Required Development Workflow

**MANDATORY:** For any non-trivial task, you MUST use `/dev-pipeline`.

### The Pipeline — `/dev-pipeline <task>`
A single command that runs 11 phases automatically, pausing after each
artifact-producing phase for user review.
```

### 4. Run it

Open Claude Code in your project and type:

```
/dev-pipeline <describe your task here>
```

---

## The 11 Phases

### Phase 1: Requirements Crystallization (`/arm`)

**Agent:** `requirements-crystallizer`
**Artifact:** `brief.md`

Transforms a fuzzy task description into a structured requirements brief through targeted Q&A. The agent explores your codebase first, then asks clarifying questions grouped by theme:

- **Scope** — What's in/out?
- **Behavior** — Edge cases, error states, user feedback?
- **Constraints** — Performance, security, compatibility?
- **Dependencies** — External APIs, database changes, affected features?

Max 3 rounds of Q&A, then crystallizes into a brief with problem statement, success criteria, scope boundaries, and codebase context.

---

### Phase 2: Technical Design (`/design`)

**Agent:** `architect`
**Artifact:** `design.md`
**Requires:** `brief.md`

Creates a technical design grounded in two sources:

1. **Live documentation** — Searches the web for current best practices, API patterns, and library docs. Every decision cites a URL.
2. **Your codebase** — Analyzes existing patterns so the design is consistent with what you already have.

Outputs component interfaces, data models, API contracts, and architectural decisions with documented alternatives.

---

### Phase 3: Adversarial Review (`/ar`)

**Agent:** `adversarial-coordinator`
**Artifact:** `critique.md`
**Requires:** `design.md`

Attacks the design from 3 perspectives:

| Critic | Focus |
|--------|-------|
| **Architect** | Scalability, coupling, consistency, performance |
| **Skeptic** | Edge cases, error states, security, concurrency |
| **Implementer** | Clarity, types, state management, testability |

**Verdict rules:**
- **REVISE_DESIGN** — Any HIGH severity issue, 3+ MEDIUM issues, or consensus issues (raised by 2+ critics)
- **APPROVED** — No HIGH issues, fewer than 3 MEDIUM, all concerns LOW or mitigated

If the verdict is REVISE_DESIGN, you can say `"revise"` to loop back to Phase 2 (max 2 cycles) or `"override"` to proceed anyway.

---

### Phase 4: Deterministic Planning (`/plan`)

**Agent:** `atomic-planner`
**Artifact:** `plan.md`
**Requires:** `design.md`, optionally `critique.md`

Creates 5-8 atomic implementation steps. Every step includes:

- **Exact file path** — Verified against your codebase
- **Action** — MODIFY or CREATE
- **BEFORE code** — Current state of the file
- **AFTER code** — Complete, copy-pasteable replacement
- **Dependencies** — Which steps must complete first
- **Test case** — Concrete input, expected output
- **Acceptance criteria** — Checkboxes for verification

> **Key principle:** If the builder has to guess, the plan failed.

---

### Phase 5: Drift Detection (`/pmatch`)

**Agent:** `drift-detector`
**Artifact:** `drift-report.md`
**Requires:** `design.md` + `plan.md`

Compares the plan against the design to catch:

- **Missing coverage** — Design requirement not in plan
- **Scope creep** — Plan step not justified by design
- **Contradictions** — Plan conflicts with design
- **Incomplete steps** — Plan step missing required detail

If drift is detected, you can say `"fix-plan"` (back to Phase 4), `"fix-design"` (back to Phase 2), or `"override"`.

---

### Phase 6: Build (`/build`)

**Agent:** `builder`
**Artifact:** `build-report.md` + actual code changes
**Requires:** `plan.md`

Executes the plan step-by-step with **context isolation** — each step only reads the files mentioned in that step, preventing context bleed between steps.

For each step:
1. Fresh read of only the relevant files
2. Verify BEFORE code matches current state
3. Apply AFTER code
4. Verify acceptance criteria
5. Log result

After all steps: runs `npm run build` and `npx tsc --noEmit`.

**If a step fails** (BEFORE mismatch, file not found), the builder **stops and reports** — it does not improvise fixes.

---

### Phases 7-11: QA Pipeline (automatic)

These run back-to-back without pausing, producing a combined `qa-report.md`.

| Phase | Command | Agent | What it checks |
|-------|---------|-------|----------------|
| 7 | `/denoise` | denoiser | `console.log`, `debugger`, commented-out code, TODO artifacts |
| 8 | `/qf` | quality-fit | TypeScript types, ESLint, project conventions |
| 9 | `/qb` | quality-behavior | Build success, test results, behavior vs design spec |
| 10 | `/qd` | quality-docs | Swagger on API routes, JSDoc on exports, type descriptions |
| 11 | `/security-review` | security-auditor | SQL injection, XSS, auth bypass, multi-tenant leaks, hardcoded secrets |

---

## Skip Options

Not every task needs the full pipeline:

| Flag | Skips | Use when |
|------|-------|----------|
| `--skip-arm` | Phase 1 (Requirements) | Requirements are already crystal clear |
| `--skip-ar` | Phase 3 (Adversarial Review) | Small, low-risk change |
| `--skip-pmatch` | Phase 5 (Drift Detection) | Quick iteration, you trust the plan |

**Never skipped:** Phases 2, 4, 6, and QA (7-11).

**Skip the entire pipeline** for truly trivial changes — single-line fixes, typos, exact step-by-step instructions from the user.

---

## Running Phases Individually

Each phase works as a standalone command. Useful for re-running a specific phase or building your own workflow:

| Command | Phase | Creates | Needs |
|---------|-------|---------|-------|
| `/arm <task>` | Requirements | `brief.md` | Nothing (creates session) |
| `/design` | Design | `design.md` | `brief.md` |
| `/ar` | Adversarial Review | `critique.md` | `design.md` |
| `/plan` | Planning | `plan.md` | `design.md` |
| `/pmatch` | Drift Detection | `drift-report.md` | `design.md` + `plan.md` |
| `/build` | Build | `build-report.md` | `plan.md` |
| `/denoise` | Denoise | `qa-report.md` | `build-report.md` |
| `/qf` | Quality Fit | `qa-report.md` | `build-report.md` |
| `/qb` | Quality Behavior | `qa-report.md` | `build-report.md` |
| `/qd` | Quality Docs | `qa-report.md` | `build-report.md` |
| `/security-review` | Security Audit | `qa-report.md` | `build-report.md` |

All artifacts are saved in `.claude/artifacts/{session}/` with a timestamped session directory.

---

## File Structure

```
.claude/
├── commands/              # Slash commands (the user-facing interface)
│   ├── dev-pipeline.md    # Main orchestrator — runs all 11 phases
│   ├── arm.md             # Phase 1: Requirements crystallization
│   ├── design.md          # Phase 2: Technical design
│   ├── ar.md              # Phase 3: Adversarial review
│   ├── plan.md            # Phase 4: Deterministic planning
│   ├── plan-review.md     # Alternative: Plan + Codex review
│   ├── pmatch.md          # Phase 5: Drift detection
│   ├── build.md           # Phase 6: Build execution
│   ├── denoise.md         # Phase 7: Debug artifact removal
│   ├── qf.md              # Phase 8: Quality fit (types/lint)
│   ├── qb.md              # Phase 9: Quality behavior (tests)
│   ├── qd.md              # Phase 10: Quality docs (Swagger/JSDoc)
│   └── security-review.md # Phase 11: Security audit
│
├── agents/                # Agent definitions (the brains behind each phase)
│   ├── requirements-crystallizer.md
│   ├── architect.md
│   ├── adversarial-coordinator.md
│   ├── atomic-planner.md
│   ├── drift-detector.md
│   ├── builder.md
│   ├── denoiser.md
│   ├── quality-fit.md
│   ├── quality-behavior.md
│   ├── quality-docs.md
│   ├── security-auditor.md
│   ├── clarifier.md       # General-purpose clarification
│   ├── code-reviewer.md   # Standalone code review
│   ├── implementer.md     # Standalone implementation
│   ├── planner.md         # Standalone planning
│   ├── plan-reviewer.md   # Plan quality review
│   └── tester.md          # Standalone testing
│
├── rules/                 # Project convention rules (customize these)
│   ├── api.md             # API route patterns and auth conventions
│   ├── database.md        # SQL patterns, migration rules, naming
│   └── react.md           # Frontend component and state conventions
│
├── hooks/                 # Shell hooks that run on tool events
│   ├── auto-format.sh     # Runs prettier after every file edit
│   └── protect-files.sh   # Blocks edits to .env, lock files, CI config
│
├── skills/                # Scaffolding templates
│   ├── new-migration/     # Generates a migration file with correct ID
│   │   └── SKILL.md
│   └── scaffold-api/      # Generates an authenticated API route
│       └── SKILL.md
│
├── settings.json          # Wires hooks to tool events
└── artifacts/             # Session output (created at runtime)
    └── {session}/         # Timestamped per-task
        ├── brief.md
        ├── design.md
        ├── critique.md
        ├── plan.md
        ├── drift-report.md
        ├── build-report.md
        └── qa-report.md
```

---

## Customizing for Your Stack

### Rules

The `.claude/rules/` files teach Claude your project's conventions. The QA phases check against these. Replace the contents with your own patterns:

**Example — switching from MUI to Tailwind:**
```markdown
# react.md
## Styling
- Use Tailwind CSS utility classes, never inline styles
- Use `cn()` helper for conditional classes
- Dark mode: use `dark:` prefix, never hardcode colors
```

**Example — switching from PostgreSQL to Prisma:**
```markdown
# database.md
## ORM
- Use Prisma Client for all queries
- Never write raw SQL
- Always include `where: { userId }` for multi-tenant filtering
```

### Hooks

The hooks in `.claude/hooks/` run as shell commands on tool events. Edit `settings.json` to configure when they fire:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/protect-files.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/auto-format.sh" }]
      }
    ]
  }
}
```

### Skills

Skills are reusable scaffolding templates invoked as slash commands. Each skill lives in `.claude/skills/<name>/SKILL.md`. Create your own for repeated patterns in your codebase (new components, new test files, new services, etc.).

### Agents

The agent files in `.claude/agents/` define each agent's personality, process, and output format. You can modify them to change how strict the adversarial review is, what the builder checks, or what the security auditor scans for.

---

## Feedback Loops

The pipeline isn't linear — it has built-in feedback loops at quality gates:

```
                    ┌─── "revise" ───┐
                    v                |
Requirements → Design → Adversarial Review → Planning → Drift Detection → Build → QA
                    ^                                       |        ^        |
                    |                                       |        |        |
                    └──────── "fix-design" ─────────────────┘        |        |
                                                                     |        |
                                                    "fix-plan" ──────┘        |
                                                                              |
                                                    "override" at any gate ───┘
```

- **Phase 3 (Adversarial Review):** `"revise"` loops back to Phase 2. Max 2 cycles.
- **Phase 5 (Drift Detection):** `"fix-plan"` loops to Phase 4, `"fix-design"` loops to Phase 2.
- **Any gate:** `"override"` proceeds despite a failing verdict (logged in the artifacts).

---

## Example Session

```
> /dev-pipeline Add a notes feature to the company detail view

Phase 1 Complete — Requirements crystallized.
Artifact: .claude/artifacts/20260223-143022-add-notes-feature/brief.md

Review the brief above. Reply "continue" to proceed to Phase 2.

> continue

Phase 2 Complete — Technical design ready.
Artifact: .claude/artifacts/20260223-143022-add-notes-feature/design.md

Review the design. Reply "continue" to proceed to Phase 3.

> continue

Phase 3 Complete — Adversarial review done.
Verdict: REVISE_DESIGN (HIGH: missing XSS sanitization on note content)

Reply "revise" to fix, or "override" to proceed.

> revise

Phase 2 (Revised) — Design updated with DOMPurify sanitization.
Phase 3 (Re-review) — APPROVED.

Reply "continue" to proceed to Phase 4.

> continue

... (continues through all phases)

## Pipeline Complete
| Phase | Verdict |
|-------|---------|
| 1. Requirements | CRYSTALLIZED |
| 2. Design | READY_FOR_REVIEW |
| 3. Adversarial Review | APPROVED |
| 4. Planning | READY_FOR_BUILD |
| 5. Drift Detection | ALIGNED |
| 6. Build | SUCCESS |
| 7. Denoise | CLEAN |
| 8. Quality Fit | PASS |
| 9. Quality Behavior | PASS |
| 10. Quality Docs | PASS |
| 11. Security | PASS |

Status: COMPLETE
```

---

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- A project with a `CLAUDE.md` that references the pipeline
- Node.js (for the build/type-check steps — adapt the build commands in `build.md` and `qf.md` for your stack)

---

## License

MIT — use it, adapt it, make it yours.
