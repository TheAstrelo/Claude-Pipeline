# AI Development Pipeline Conventions

## Pipeline Overview

This project uses a structured 12-phase development pipeline. When asked to run the pipeline, follow the phase instructions in `pipeline/phases.md`.

## Profiles

- **yolo** — Skip phases 3,5,7-10. Only HARD failures pause. Max 1 retry.
- **standard** (default) — All phases. HARD pauses, SOFT warns. Max 2 retries.
- **paranoid** — All phases. Any failure pauses. Max 3 retries.

Phase 0 (Pre-Check) and Phase 11 (Security) are NEVER skipped.

## Gate System

- **HARD gates** (phases 0, 3, 11): Must pass or stop for human review.
- **SOFT gates** (phases 1, 2, 4, 5): Warn and proceed (stop in paranoid).
- **NONE gates** (phases 6-10): Always proceed, auto-fix if possible.

## Validation Principle

Never trust self-reported confidence. Validate outputs by checking: required sections exist, failure flags are absent, referenced file paths exist on disk, count thresholds are met.

## Flag Vocabulary

- `NEEDS_INPUT` / `NEEDS_RESEARCH` / `NEEDS_DETAIL` → HARD fail
- `APPROVED` / `REVISE_DESIGN` → Phase 3 verdict
- `ALIGNED` / `DRIFT_DETECTED` → Phase 5 verdict
- `BLOCKED` → HARD fail in build
- `CRITICAL` → Always stop (security)
- `EXTEND_EXISTING` / `USE_LIBRARY` / `BUILD_NEW` → Phase 0 recommendation

## Auto-Recovery

- Phase 3 REVISE_DESIGN → retry Phase 2 with critique feedback (max 1)
- Phase 5 DRIFT_DETECTED → add missing plan steps (max 1)
- Phase 6 step failure → retry with error context (max 2 per step)

## Agent Role Principles

- Each phase gets only its specified inputs, not the full conversation
- The build phase works one step at a time (context isolation)
- QA phases scan only files changed during the build
- NEVER improvise beyond the plan during the build phase
- NEVER refactor untouched code

## Artifacts

Store all pipeline artifacts in `.pipeline/artifacts/{session}/`:
`pre-check.md`, `brief.md`, `design.md`, `critique.md`, `plan.md`, `drift-report.md`, `build-report.md`, `qa-report.md`
