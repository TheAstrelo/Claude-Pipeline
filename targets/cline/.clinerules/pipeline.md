# AI Development Pipeline

You have access to a structured development pipeline that transforms task descriptions into production-ready code through 12 phases. Follow these rules whenever the pipeline is invoked.

## Profiles

| Profile    | Skipped Phases     | Gate Behavior                        | Max Retries |
|------------|--------------------|------------------------------------- |-------------|
| yolo       | 3, 5, 7, 8, 9, 10 | Only HARD failures pause             | 1           |
| standard   | None               | HARD pauses, SOFT warns              | 2           |
| paranoid   | None               | Any failure pauses                   | 3           |

Default profile is **standard**. Phase 0 and Phase 11 are NEVER skipped.

## Gate System

| Gate Type | Phases           | Behavior                              |
|-----------|------------------|---------------------------------------|
| HARD      | 0, 3, 11         | Must pass or pause for human review   |
| SOFT      | 1, 2, 4, 5       | Warn and proceed (pause in paranoid)  |
| NONE      | 6, 7, 8, 9, 10   | Always proceed, auto-fix if possible  |

### Decision Matrix

| HARD Fails | SOFT Fails | yolo | standard | paranoid |
|------------|------------|------|----------|----------|
| 0          | 0          | AUTO | AUTO     | AUTO     |
| 0          | 1+         | AUTO | WARN     | PAUSE    |
| 1+         | any        | PAUSE| PAUSE    | PAUSE    |

- **AUTO** — proceed silently
- **WARN** — log warning and proceed
- **PAUSE** — stop and ask the user what to do

## Validation Principle

**Never trust self-reported confidence.** Validate each phase's output by checking:
- Required sections exist in the artifact
- Failure flags (NEEDS_INPUT, NEEDS_RESEARCH, etc.) are absent
- Referenced file paths exist on disk
- Count thresholds are met (coverage >= 90%, issues < 3, etc.)

## Flag Vocabulary

| Flag              | Meaning                               | Gate Effect       |
|-------------------|---------------------------------------|-------------------|
| NEEDS_INPUT       | Requirements ambiguous                | HARD fail         |
| NEEDS_RESEARCH    | Cannot find docs for a decision       | HARD fail         |
| NEEDS_DETAIL      | Plan step lacks specificity           | HARD fail         |
| APPROVED          | Design passes review                  | Pass              |
| REVISE_DESIGN     | Design has critical issues            | HARD + retry      |
| ALIGNED           | Plan covers all requirements          | Pass              |
| DRIFT_DETECTED    | Plan misses requirements              | SOFT + retry      |
| BLOCKED           | Build step cannot proceed             | HARD fail         |
| CRITICAL          | Security vulnerability                | Always PAUSE      |
| EXTEND_EXISTING   | Extend existing code                  | Feeds design      |
| USE_LIBRARY       | Use installed library                 | Feeds planning    |
| BUILD_NEW         | Build from scratch                    | Default path      |

## Auto-Recovery

Before pausing, try to self-correct:
- Phase 3 REVISE_DESIGN → retry Phase 2 with critique feedback (max 1)
- Phase 5 DRIFT_DETECTED → add missing plan steps (max 1)
- Phase 6 step failure → retry step with error (max 2 per step)

## Context Isolation

- Each phase gets only its specified inputs, not the full history
- The build phase works one step at a time
- QA phases scan only files changed during the build
- Pass summaries downstream, not full artifacts

## Artifact Storage

All artifacts go in `.pipeline/artifacts/{session}/`:
`pre-check.md`, `brief.md`, `design.md`, `critique.md`, `plan.md`, `drift-report.md`, `build-report.md`, `qa-report.md`
