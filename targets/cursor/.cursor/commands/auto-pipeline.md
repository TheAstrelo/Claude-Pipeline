## Auto Pipeline

Run a full automated development pipeline for the given task. This orchestrates 12 phases from pre-check through security review, producing production-ready code.

### Usage
`/auto-pipeline [--profile=yolo|standard|paranoid] <task description>`

### Profiles
- **yolo** — Fast prototyping. Skips phases 3,5,7-10. Only HARD failures pause.
- **standard** (default) — Balanced. All phases run. HARD failures pause, SOFT failures warn.
- **paranoid** — Full oversight. All phases run. Any failure pauses.

### Execution

Create a session directory: `.pipeline/artifacts/{timestamp}/`

Run these phases in order. For each phase, delegate to the matching subagent by name. After each phase, validate the output and apply the gate decision.

**Phase 0: Pre-Check (HARD gate — NEVER skip)**
- Delegate to `pre-check` agent
- Input: the task description
- Output: `pre-check.md` → must contain a recommendation (EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW)
- Validators: must have "Codebase Matches" section, must have recommendation, must have reasoning
- If EXTEND_EXISTING: load found file paths into Phase 2 context
- If USE_LIBRARY: add install command to Phase 4 steps

**Phase 1: Requirements (SOFT gate)**
- Delegate to `requirements` agent
- Input: task + pre-check context
- Output: `brief.md`
- Validators: must have Problem section, must have Success Criteria, must NOT contain "NEEDS_INPUT"
- HARD fail on NEEDS_INPUT (requirements too ambiguous)

**Phase 2: Design (SOFT gate)**
- Delegate to `architect` agent
- Input: brief.md summary (Problem, Criteria, Constraints only)
- Output: `design.md`
- Validators: must have Decisions section, must have source citations, must NOT contain "NEEDS_RESEARCH"
- HARD fail on NEEDS_RESEARCH

**Phase 3: Adversarial Review (HARD gate) — skip in yolo**
- Delegate to `adversarial` agent
- Input: design.md decisions list only
- Output: `critique.md`
- Validators: must have verdict (APPROVED or REVISE_DESIGN), no HIGH severity issues, no consensus issues
- On REVISE_DESIGN: feed issues back to architect agent, rerun Phase 2 (max 1 retry)

**Phase 4: Planning (SOFT gate)**
- Delegate to `planner` agent
- Input: design.md decisions + file paths
- Output: `plan.md`
- Validators: must have steps, each step needs BEFORE/AFTER code, max 8 steps, MODIFY paths must exist
- HARD fail on NEEDS_DETAIL or missing paths

**Phase 5: Drift Detection (SOFT gate) — skip in yolo**
- Delegate to `drift-detector` agent
- Input: design requirements list + plan step titles
- Output: `drift-report.md`
- Validators: must have verdict, coverage >= 90%
- On DRIFT_DETECTED: add missing steps to plan (max 1 retry)

**Phase 6: Build (NONE gate, HARD on BLOCKED)**
- Delegate to `builder` agent
- Input: plan.md, one step at a time (context isolation)
- Output: `build-report.md`
- On step failure: retry with error context (max 2 per step)
- On BLOCKED: pause for human review

**Phases 7-10: QA (NONE gate — auto-fix) — skip 7-10 in yolo**
Run these in parallel if possible:
- Phase 7: Delegate to `denoiser` agent — remove debug artifacts
- Phase 8: Delegate to `quality-fit` agent — fix lint/type errors
- Phase 9: Delegate to `quality-behavior` agent — run tests, log results
- Phase 10: Delegate to `quality-docs` agent — check doc coverage
- Output: append to `qa-report.md`

**Phase 11: Security (HARD gate — NEVER skip, even in yolo)**
- Delegate to `security` agent
- Input: list of changed files from build-report.md
- Output: append to `qa-report.md`
- Validators: must have findings section, no CRITICAL, no SQLi, all API routes auth-protected, no hardcoded secrets
- CRITICAL findings ALWAYS pause, even in yolo profile

### Gate Decision Logic

After each phase's validators run:
- All pass → **AUTO** (proceed silently)
- SOFT fail only + yolo → **AUTO**
- SOFT fail only + standard → **WARN** (log and proceed)
- SOFT fail only + paranoid → **PAUSE**
- Any HARD fail → **PAUSE** (all profiles)

On PAUSE: show the user what failed and wait for instructions. User can say "continue", "revise", or "override".

### Auto-Recovery

Before pausing, try to self-correct:
- Phase 3 REVISE_DESIGN → retry Phase 2 with critique feedback (max 1)
- Phase 5 DRIFT_DETECTED → add missing plan steps (max 1)
- Phase 6 step failure → retry step with error (max 2 per step)

### Final Report

When all phases complete, output:

```
Pipeline Complete [{profile}]

Task: {task}
Session: {session}

Phases:
 0. Pre-Check      [result]  → {recommendation}
 1. Requirements   [result]  validators: N/N
 2. Design         [result]  validators: N/N
 3. Adversarial    [result]  validators: N/N
 4. Planning       [result]  validators: N/N
 5. Drift          [result]  validators: N/N
 6. Build          [result]  validators: N/N
 7-10. QA          [result]  auto-fixed: N issues
11. Security       [result]  validators: N/N

Files changed: {list}
Warnings: {list or "none"}
```
