# AI Development Pipeline

This project uses a structured 12-phase development pipeline. When the pipeline is invoked, follow these rules.

## Profiles

- **yolo** — Skip phases 3,5,7-10. Only HARD failures pause. Max 1 retry.
- **standard** (default) — All phases. HARD pauses, SOFT warns. Max 2 retries.
- **paranoid** — All phases. Any failure pauses. Max 3 retries.

Phase 0 (Pre-Check) and Phase 11 (Security) are NEVER skipped.

## Gate System

- **HARD gates** (phases 0, 3, 11): Must pass or pause for human review.
- **SOFT gates** (phases 1, 2, 4, 5): Warn and proceed. Pause in paranoid.
- **NONE gates** (phases 6-10): Always proceed, auto-fix if possible.

Decision: 0 HARD + 0 SOFT = AUTO. 0 HARD + SOFT fails = WARN (or PAUSE in paranoid). Any HARD fail = PAUSE in all profiles.

## Validation

Never trust self-reported confidence. Validate outputs by checking: required sections exist, failure flags are absent, referenced file paths exist, count thresholds are met.

## Flags

- NEEDS_INPUT / NEEDS_RESEARCH / NEEDS_DETAIL → HARD fail
- APPROVED / REVISE_DESIGN → Phase 3 verdict
- ALIGNED / DRIFT_DETECTED → Phase 5 verdict
- BLOCKED → HARD fail in build
- CRITICAL → Always PAUSE (security)
- EXTEND_EXISTING / USE_LIBRARY / BUILD_NEW → Phase 0 recommendation

## Auto-Recovery

- Phase 3 REVISE_DESIGN → retry Phase 2 with critique (max 1)
- Phase 5 DRIFT_DETECTED → add missing steps (max 1)
- Phase 6 step failure → retry with error (max 2/step)

## Artifacts

Store all artifacts in `.pipeline/artifacts/{session}/`.
