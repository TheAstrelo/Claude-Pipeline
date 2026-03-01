# Auto Pipeline

Run a full automated development pipeline for the given task.

Parse the user's input for an optional profile flag (`--profile=yolo|standard|paranoid`). Default is `standard`.

## Step 1: Setup

Create the session directory:
```
mkdir -p .pipeline/artifacts/{timestamp}
```

Record the profile, task description, and start time.

## Step 2: Phase 0 — Pre-Check (HARD gate, NEVER skip)

Act as the Pre-Check Agent (see pipeline agent roles).

1. Extract keywords from the task
2. Search the codebase for existing implementations (API routes, components, services, migrations)
3. Check the package manifest for related libraries
4. Output `pre-check.md` with recommendation: EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW

**Validate:**
- Has "Codebase Matches" section → HARD
- Has recommendation (EXTEND_EXISTING / USE_LIBRARY / BUILD_NEW) → HARD
- Has reasoning → SOFT

If HARD fail → pause and ask user. Otherwise proceed.

## Step 3: Phase 1 — Requirements (SOFT gate)

Act as the Requirements Agent.

1. Parse the task for features, entities, actions
2. Search codebase for related code
3. Ask max 3 questions only if genuinely ambiguous
4. Output `brief.md`

**Validate:**
- Has Problem section → SOFT
- Has Success Criteria → SOFT
- Does NOT contain "NEEDS_INPUT" → HARD

## Step 4: Phase 2 — Design (SOFT gate)

Act as the Design Agent.

1. Read brief.md (Problem, Criteria, Constraints only)
2. Research technologies, search codebase for patterns
3. Output `design.md` with cited decisions

**Validate:**
- Has Decisions section → SOFT
- Has source citations → SOFT
- Does NOT contain "NEEDS_RESEARCH" → HARD
- Referenced file paths exist → SOFT

## Step 5: Phase 3 — Adversarial Review (HARD gate)

**Skip in yolo profile.**

Act as the Adversarial Agent.

1. Read design.md decisions only
2. Critique from Architect, Skeptic, and Implementer angles
3. Output `critique.md`

**Validate:**
- Has verdict (APPROVED / REVISE_DESIGN) → HARD
- No HIGH severity issues → HARD
- Fewer than 3 MEDIUM issues → SOFT
- No consensus issues (raised by 2+ angles) → HARD

**On REVISE_DESIGN:** Feed issues back to Step 4 (Design), rerun once. If still failing, pause.

## Step 6: Phase 4 — Planning (SOFT gate)

Act as the Planning Agent.

1. Read design.md decisions + file paths
2. Create implementation steps with BEFORE/AFTER code
3. Output `plan.md`

**Validate:**
- Has at least 1 step → HARD
- Steps have BEFORE/AFTER code → SOFT
- Max 8 steps → SOFT
- MODIFY file paths exist → HARD
- Does NOT contain "NEEDS_DETAIL" → HARD

## Step 7: Phase 5 — Drift Detection (SOFT gate)

**Skip in yolo profile.**

Act as the Drift Detection Agent.

1. Read design.md requirements and plan.md steps
2. Map each requirement to plan steps
3. Output `drift-report.md`

**Validate:**
- Has verdict (ALIGNED / DRIFT_DETECTED) → HARD
- Coverage >= 90% → SOFT

**On DRIFT_DETECTED:** Add missing steps to plan, rerun once. If still drifting, pause.

## Step 8: Phase 6 — Build (NONE gate, HARD on BLOCKED)

Act as the Builder Agent.

For each step in plan.md:
1. Read only the files for that step
2. Verify BEFORE code matches
3. Apply AFTER code exactly
4. Run step test if provided
5. On failure: retry with error context (max 2 per step)
6. On BLOCKED: pause for human review

Output `build-report.md`.

## Step 9: Phases 7-10 — QA (NONE gate, auto-fix)

**Skip phases 7-10 in yolo profile.**

Run these on the changed files from build-report.md:

1. **Denoise** — Remove console.logs, debugger statements, commented code, TODO markers
2. **Quality Fit** — Run type checker + linter, check conventions, auto-fix
3. **Quality Behavior** — Run build + tests, verify against design spec
4. **Quality Docs** — Check API doc comments, function doc comments

Append all results to `qa-report.md`.

## Step 10: Phase 11 — Security (HARD gate, NEVER skip)

Act as the Security Agent.

1. Scan changed files for: injection, XSS, auth gaps, hardcoded secrets, missing access control
2. Append findings to `qa-report.md`

**Validate:**
- Has findings section → HARD
- No CRITICAL findings → HARD
- No SQL injection → HARD
- All API routes auth-protected → HARD
- No hardcoded secrets → HARD

**CRITICAL findings ALWAYS pause, even in yolo.**

## Step 11: Final Report

Output a summary:

```
Pipeline Complete [{profile}]

Task: {task}
Session: {session}

Phases:
 0. Pre-Check      [result] → {recommendation}
 1. Requirements   [result] validators: N/N
 2. Design         [result] validators: N/N
 3. Adversarial    [result] validators: N/N
 4. Planning       [result] validators: N/N
 5. Drift          [result] validators: N/N
 6. Build          [result] validators: N/N
 7-10. QA          [result] auto-fixed: N issues
11. Security       [result] validators: N/N

Files changed: {list}
Warnings: {list or "none"}
```
