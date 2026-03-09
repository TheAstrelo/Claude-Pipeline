---
description: "Run the full AI development pipeline from pre-check through security review"
agent: "agent"
tools:
  - "terminal"
---

Run the full automated development pipeline for this task. Parse optional `--profile=yolo|standard|paranoid` (default: standard).

Create a session directory at `.pipeline/artifacts/{timestamp}/`.

Execute these phases in order, delegating to the matching agent for each:

**Phase 0: Pre-Check** (HARD gate, NEVER skip) — Use @pre-check agent. Search codebase for existing implementations. Output `pre-check.md` with EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW.

**Phase 1: Requirements** (SOFT gate) — Use @requirements agent. Extract testable requirements. Output `brief.md`. HARD fail on NEEDS_INPUT.

**Phase 2: Design** (SOFT gate) — Use @architect agent. Create cited technical design. Output `design.md`. HARD fail on NEEDS_RESEARCH.

**Phase 3: Adversarial** (HARD gate, skip in yolo) — Use @adversarial agent. Critique design from 3 angles. Output `critique.md`. On REVISE_DESIGN: retry Phase 2 once.

**Phase 4: Planning** (SOFT gate) — Use @planner agent. Create BEFORE/AFTER implementation steps. Output `plan.md`. HARD fail on NEEDS_DETAIL.

**Phase 5: Drift** (SOFT gate, skip in yolo) — Use @drift-detector agent. Verify plan covers design. Output `drift-report.md`. On DRIFT_DETECTED: add missing steps once.

**Phase 6: Build** (NONE gate, HARD on BLOCKED) — Use @builder agent. Execute plan one step at a time. No improvisation. Output `build-report.md`.

**Phases 7-10: QA** (NONE gate, skip in yolo) — On changed files: denoise (remove debug artifacts), quality-fit (types + lint), quality-behavior (build + tests), quality-docs (API docs). Append to `qa-report.md`.

**Phase 11: Security** (HARD gate, NEVER skip) — Use @security agent. Scan for injection, XSS, auth gaps, secrets. CRITICAL always pauses.

Output a final summary with phase results, validator counts, files changed, and warnings.
