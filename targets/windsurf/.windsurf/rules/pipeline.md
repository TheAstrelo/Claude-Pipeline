---
trigger: always_on
description: AI development pipeline — profiles, gates, validation, agent roles, and flag vocabulary
---

# AI Development Pipeline

## Profiles

| Profile | Skip Phases | Gate Mode | Retries |
|---------|-------------|-----------|---------|
| yolo | 3,5,7-10 | Only HARD fails pause | 1 |
| standard | None | HARD pauses, SOFT warns | 2 |
| paranoid | None | Any fail pauses | 3 |

Phase 0 (Pre-Check) and Phase 11 (Security) are NEVER skipped.

## Gates

| Type | Phases | Behavior |
|------|--------|----------|
| HARD | 0, 3, 11 | Must pass or pause for human |
| SOFT | 1, 2, 4, 5 | Warn and proceed (pause in paranoid) |
| NONE | 6-10 | Always proceed, auto-fix |

## Decision Matrix

| HARD Fails | SOFT Fails | yolo | standard | paranoid |
|------------|------------|------|----------|----------|
| 0 | 0 | AUTO | AUTO | AUTO |
| 0 | 1+ | AUTO | WARN | PAUSE |
| 1+ | any | PAUSE | PAUSE | PAUSE |

## Flags

- `NEEDS_INPUT` → HARD fail (ambiguous requirements)
- `NEEDS_RESEARCH` → HARD fail (missing docs)
- `NEEDS_DETAIL` → HARD fail (vague plan step)
- `APPROVED` / `REVISE_DESIGN` → Phase 3 verdict
- `ALIGNED` / `DRIFT_DETECTED` → Phase 5 verdict
- `BLOCKED` → HARD fail (build step stuck)
- `CRITICAL` → Always PAUSE (security)
- `EXTEND_EXISTING` / `USE_LIBRARY` / `BUILD_NEW` → Phase 0 recommendation

## Auto-Recovery

- Phase 3 REVISE_DESIGN → retry Phase 2 with feedback (max 1)
- Phase 5 DRIFT_DETECTED → add missing steps (max 1)
- Phase 6 step failure → retry with error (max 2/step)

## Agent Roles

**Phase 0 Pre-Check:** Search codebase + packages for existing implementations. Output `pre-check.md` with recommendation.

**Phase 1 Requirements:** Extract testable requirements. Max 3 questions. Output `brief.md`.

**Phase 2 Design:** Technical design with cited sources. Max 6 decisions, 4 components. Output `design.md`.

**Phase 3 Adversarial:** Critique from Architect/Skeptic/Implementer angles. Max 10 issues. Output `critique.md`.

**Phase 4 Planning:** BEFORE/AFTER code steps. Max 8 steps. Verify paths exist. Output `plan.md`.

**Phase 5 Drift:** Map requirements to plan steps. Coverage >= 90%. Output `drift-report.md`.

**Phase 6 Build:** Execute steps exactly. No improvisation. One step at a time. Output `build-report.md`.

**Phase 7 Denoise:** Remove console.logs, debugger, commented code from changed files.

**Phase 8 Quality Fit:** Type check + lint + convention compliance on changed files.

**Phase 9 Quality Behavior:** Run build + tests. Verify against design spec.

**Phase 10 Quality Docs:** Check API docs, function docs on changed files.

**Phase 11 Security:** Scan for injection, XSS, auth gaps, secrets. CRITICAL always pauses.

## Validation Principle

Never trust self-reported confidence. Check required sections exist, failure flags absent, file paths valid, count thresholds met.

## Artifacts

Store in `.pipeline/artifacts/{session}/`: `pre-check.md`, `brief.md`, `design.md`, `critique.md`, `plan.md`, `drift-report.md`, `build-report.md`, `qa-report.md`
