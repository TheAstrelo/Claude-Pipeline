# CLAUDE.md

## Project Overview
**RDO** - B2B go-to-market intelligence platform. Features: company search, fit scoring, intent signals, persona discovery, pitch generation.

## Commands
```bash
npm run dev          # Dev server (localhost:3000)
npm run build        # Production build
npm run db:migrate   # Run migrations
```
**DB Reset:** `scripts/fresh-start-wipe-all-data.js`

## Architecture
```
src/
├── features/        # Feature modules (search, personas, ranking)
├── domain/          # Domain services (scoring, company)
├── infrastructure/  # Database, auth, cache, providers (HubSpot, Serper, Groq, Salesforce)
└── ui/              # UI components (use MUI first, not CSS)
```

**Path Aliases:** `@/*` → `./src/*`, `@features/*` → `./src/features/*`

## Key Patterns
```typescript
// Database import (default export)
import pool from '@infrastructure/database/connection';

// Auth middleware (use AuthenticatedRequest type)
import { requireAuth, AuthenticatedRequest } from '@infrastructure/auth/middleware';
const userId = req.userId!;
export default requireAuth(handler);

// Admin-only endpoints
import { requireAdmin } from '@infrastructure/auth/middleware';
export default requireAdmin(handler);

// Numeric handling
parseFloat(String(score.composite_score)).toFixed(1)
```

## ML Scoring (Upstash Redis, 24h TTL)
- **Fit Score:** NAICS embeddings (60%) + size similarity (40%)
- **Intent Score:** Semantic topic matching + volume + recency
- **Composite:** `(fit * 0.5) + (intent * 0.5)`

**Files:** `src/domain/scoring/services/ml*.ts`

## Core APIs (197 total routes)
| Endpoint | Purpose |
|----------|---------|
| `/api/ranking/calculate` | ML scoring |
| `/api/goldilocks/recommendations` | Strategic recommendations |
| `/api/discovery/prospects` | ML prospect discovery |
| `/api/recommendations/daily` | 90/10 explore/exploit |
| `/api/integrations/hubspot/sync` | CRM sync |
| `/api/integrations/salesforce/sync` | Salesforce CRM sync |
| `/api/admin/ml-config` | Per-user ML weight config |
| `/api/personas/*` | Persona discovery & scoring |
| `/api/touches/*` | Sales engagement tracking |
| `/api/pitch/*` | Pitch generation & history |

## Data Providers

**Serper** - Web search for intent signals and contact finding ($0.001/search)
- `src/infrastructure/providers/serper/`
- Env: `SERPER_API_KEY`

**Groq** - LLM analysis (Llama 3.1 8B, 3.3 70B for Goldilocks)
- `src/infrastructure/providers/groq/`
- Env: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_MODEL_GOLDILOCKS`

**HubSpot** - CRM integration (OAuth)
- `src/infrastructure/providers/hubspot/`
- Full company/contact/deal sync with enrichment pipeline

**Salesforce** - CRM integration (OAuth)
- `src/infrastructure/providers/salesforce/`
- Alternative CRM sync option

## Intent Signal Types
| Type | Strength | Source |
|------|----------|--------|
| Social Ask | 90 | LinkedIn, Reddit |
| Tech Change | 85 | Tool switching |
| Job Posting | 80 | LinkedIn Jobs |
| Funding | 75 | News |

## Test User
- Email: `John@sts.com` / Password: `password123`
- ICP Profile ID: `0340cbda-5503-4f36-816f-c4b5eb20db23`

## Required Development Workflow

**MANDATORY:** For any non-trivial task (new features, bug fixes, refactors that touch more than 1-2 files), you MUST use `/dev-pipeline`. Do NOT skip phases.

### The Pipeline — `/dev-pipeline <task>`

A single command that runs 16 phases automatically, **pausing after each artifact-producing phase** for user review. The user says "continue" to advance, or gives feedback to revise.

| Phase | Agent | Artifact | Pauses? |
|-------|-------|----------|---------|
| 1. Research | researcher | `research.md` | Yes |
| 2. Requirements | requirements-crystallizer | `brief.md` | Yes |
| 3. Design | architect | `design.md` | Yes |
| 4. Adversarial Review | adversarial-coordinator | `critique.md` | Yes |
| 5. Planning | atomic-planner | `plan.md` | Yes |
| 6. Test Planning | test-writer | `test-plan.md` | Yes |
| 7. Drift Detection | drift-detector | `drift-report.md` | Yes |
| 8. Build | builder | `build-report.md` | Yes |
| 9. Denoise | denoiser | `qa-report.md` | No (auto) |
| 10. Quality Fit | quality-fit | `qa-report.md` | No (auto) |
| 11. Quality Behavior | quality-behavior | `qa-report.md` | No (auto) |
| 12. Quality Docs | quality-docs | `qa-report.md` | No (auto) |
| 13. Perf Check | performance-profiler | `qa-report.md` | No (auto) |
| 14. Security Review | security-auditor | `qa-report.md` | No (auto) |
| 15. Tech Debt | tech-debt-tracker | `qa-report.md` | No (auto) |
| 16. Rollback Plan | rollback-planner | `rollback-plan.md` | No (auto) |

All artifacts are saved in `.claude/artifacts/{session}/`.

### Feedback Loops

- **Adversarial Review (Phase 4):** If verdict is REVISE_DESIGN, user can say "revise" to loop back to Phase 3. Max 2 revision cycles.
- **Drift Detection (Phase 7):** If DRIFT_DETECTED, user can say "fix-plan" (back to Phase 5) or "fix-design" (back to Phase 3).
- **Build (Phase 8):** If PARTIAL/FAILED, user reviews issues before QA runs.
- **User Override:** At any gate, user can say "override" to proceed despite a failing verdict.

### Skip Options

- `--skip-research` — Skip Phase 1 (Research)
- `--skip-arm` — Skip Phase 2 if requirements are already clear
- `--skip-ar` — Skip Phase 4 for smaller changes
- `--skip-tests` — Skip Phase 6 (Test Planning)
- `--skip-pmatch` — Skip Phase 7 for quick iterations
- Phases 3, 5, 8, and QA (9-16) are never skipped

### When to Skip the Entire Pipeline

Truly trivial changes only — single-line fixes, typo corrections, or changes the user has given exact step-by-step instructions for.

**When in doubt, run the pipeline.**

### Individual Commands

Each phase can also be run standalone via its own slash command:

| Command | Phase | Requires |
|---------|-------|----------|
| `/research <task>` | Research | Nothing (creates session) |
| `/arm <task>` | Requirements | Nothing (creates session) |
| `/design` | Design | `brief.md` |
| `/ar` | Adversarial Review | `design.md` |
| `/plan` | Planning | `design.md` |
| `/write-tests` | Test Planning | `plan.md` |
| `/pmatch` | Drift Detection | `design.md` + `plan.md` |
| `/build` | Build | `plan.md` |
| `/denoise` | Denoise | `build-report.md` |
| `/qf` | Quality Fit | `build-report.md` |
| `/qb` | Quality Behavior | `build-report.md` |
| `/qd` | Quality Docs | `build-report.md` |
| `/perf-check` | Performance Check | `build-report.md` |
| `/security-review` | Security Audit | `build-report.md` |
| `/track-debt` | Tech Debt | `build-report.md` |
| `/rollback-plan` | Rollback Plan | `build-report.md` |

### Agent Locations

All agents are in `.claude/agents/`:
- `researcher.md` — Library/API/prior art research
- `requirements-crystallizer.md` — Requirements Q&A
- `architect.md` — Live-doc-grounded design
- `adversarial-coordinator.md` — Multi-perspective critique
- `atomic-planner.md` — Deterministic specs with BEFORE/AFTER code
- `test-writer.md` — Test-first planning from implementation steps
- `drift-detector.md` — Plan-design alignment
- `builder.md` — Context-isolated execution
- `denoiser.md` — Debug artifact removal
- `quality-fit.md` — Types and conventions
- `quality-behavior.md` — Tests and specs
- `quality-docs.md` — Swagger and JSDoc
- `performance-profiler.md` — N+1 queries, bundle size, memory leaks
- `security-auditor.md` — OWASP audit
- `tech-debt-tracker.md` — TODO/HACK scanning, design deviations
- `rollback-planner.md` — Rollback steps, migration reversal

## Important Notes
- Use **MUI first**, not raw CSS
- **Ask to review changes** before pushing to dev
- JWT auth with `requireAuth` middleware, admin-only with `requireAdmin`
- Users table has `is_admin` flag for admin access control
- **105 migration files (IDs 103-240)** - check for duplicate IDs when adding new ones (116, 133, 134, 151, 152, 233, 234, 235 have duplicates)
- Docs: `docs/features/`, `docs/cost-simulation/`
