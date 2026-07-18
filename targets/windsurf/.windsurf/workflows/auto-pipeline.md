---
description: Run the full AI development pipeline from pre-check through security review
---

# Auto Pipeline

Run a full automated development pipeline. Parse optional `--profile=yolo|standard|paranoid` (default: standard).

## Step 1: Setup
Create `.pipeline/artifacts/{timestamp}/` for session artifacts.

## Step 2: Phase 0 — Pre-Check (HARD gate, NEVER skip)
Search codebase for existing implementations matching the task. Search package manifest for related libraries. Output `pre-check.md` with recommendation: EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW. Validate: has codebase matches section, has recommendation, has reasoning. HARD fail if missing.

## Step 3: Phase 1 — Requirements (SOFT gate)
Extract requirements from task + pre-check context. Max 3 clarifying questions only if genuinely ambiguous. Output `brief.md` with Problem, Success Criteria, Scope, Constraints. HARD fail if NEEDS_INPUT flag present.

## Step 4: Phase 2 — Design (SOFT gate)
Read brief.md (Problem, Criteria, Constraints). Research technologies, search codebase for patterns. Output `design.md` with max 6 cited decisions, max 4 components, data changes, risks. HARD fail if NEEDS_RESEARCH flag present.

## Step 5: Phase 3 — Adversarial Review (HARD gate, skip in yolo)
Read design.md decisions. Critique from Architect (scalability), Skeptic (edge cases), Implementer (types) angles. Output `critique.md` with verdict APPROVED or REVISE_DESIGN. Max 10 issues. HARD fail on HIGH severity or consensus issues. On REVISE_DESIGN: feed issues back to design, retry once.

## Step 6: Phase 4 — Planning (SOFT gate)
Read design.md decisions + file paths. Create max 8 steps with BEFORE/AFTER code. Verify MODIFY paths exist. Output `plan.md`. HARD fail if NEEDS_DETAIL or paths missing.

## Step 7: Phase 5 — Drift Detection (SOFT gate, skip in yolo)
Read design.md requirements + plan.md steps. Map each requirement to plan steps. Output `drift-report.md`. Verdict: ALIGNED or DRIFT_DETECTED. Coverage must be >= 90%. On DRIFT_DETECTED: add missing steps, retry once.

## Step 8: Phase 6 — Build (NONE gate, HARD on BLOCKED)
Execute plan.md one step at a time. For each: read only that step's files, verify BEFORE matches, apply AFTER exactly, run test. Retry failures max 2 per step. On BLOCKED: pause. Output `build-report.md`. NEVER improvise.

## Step 9: Phases 7-10 — QA (NONE gate, skip 7-10 in yolo)
On changed files from build-report.md:
1. **Denoise** — remove console.logs, debugger, commented code, TODO markers
2. **Quality Fit** — run type checker + linter, check conventions, auto-fix
3. **Quality Behavior** — run build + tests, verify against design spec
4. **Quality Docs** — check API doc comments, function doc comments
Append to `qa-report.md`.

## Step 10: Phase 11 — Security (HARD gate, NEVER skip)
Scan changed files for: injection (string interpolation in queries), XSS, auth gaps (routes without middleware), hardcoded secrets, missing access control. Append to `qa-report.md`. HARD fail on CRITICAL, SQLi, auth gaps, secrets. CRITICAL always pauses even in yolo.

## Step 11: Final Report
Output summary with each phase's result, validator pass counts, files changed, and warnings.
