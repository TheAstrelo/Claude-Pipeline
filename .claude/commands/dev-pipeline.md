Run the unified quality-gated development pipeline for the following task:

$ARGUMENTS

Execute these phases IN SEQUENCE. After each artifact-producing phase, **pause and present the output to the user**. Wait for the user to say "continue" (or provide feedback) before proceeding to the next phase. Do NOT skip phases unless explicitly noted.

---

## Phase 0: Session Setup

Create a new session directory for this task:

```bash
SESSION_DIR=".claude/artifacts/$(date +%Y%m%d-%H%M%S)-$(echo '$ARGUMENTS' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-40)"
mkdir -p "$SESSION_DIR"
echo "$SESSION_DIR" > .claude/artifacts/current.txt
```

---

## Phase 1: Requirements Crystallization

Use the **requirements-crystallizer** agent.

1. Parse the task description for ambiguities
2. Explore the codebase to understand relevant existing code
3. Generate clarifying questions grouped by theme (Scope, Behavior, Constraints, Dependencies)
4. Ask the user these questions (max 3 rounds)
5. Output `brief.md` to the session directory

### Checkpoint

Present the brief summary and say:

```
Phase 1 Complete — Requirements crystallized.
Standalone command: /arm

[Brief summary: problem statement + success criteria]

Artifact: {session-dir}/brief.md

Tip: You can run this phase independently anytime with `/arm <task>` — it crystallizes fuzzy requirements into a structured brief through Q&A.

Review the brief above. Reply with feedback to revise, or "continue" to proceed to Phase 2: Technical Design (/design).
```

**WAIT for user response before continuing.**

---

## Phase 2: Technical Design

Use the **architect** agent.

**Input:** Read `brief.md` from the session directory.

1. Research live documentation via WebSearch/WebFetch for relevant libraries/APIs
2. Analyze existing codebase patterns via Glob/Grep/Read
3. Make design decisions — each must cite live docs OR existing codebase patterns
4. Define component interfaces, data models, API contracts
5. Output `design.md` to the session directory

### Checkpoint

Present the design summary and say:

```
Phase 2 Complete — Technical design ready.
Standalone command: /design

[Summary: key decisions, components, data flow]

Artifact: {session-dir}/design.md

Tip: You can run this phase independently with `/design` — it researches live docs and existing code to produce a grounded technical design.

Review the design above. Reply with feedback to revise, or "continue" to proceed to Phase 3: Adversarial Review (/ar).
```

**WAIT for user response before continuing.**

---

## Phase 3: Adversarial Review

Use the **adversarial-coordinator** agent.

**Input:** Read `design.md` from the session directory.

Run 3 critique passes:
1. **Architect Critic** — Scalability, coupling, performance
2. **Skeptic Critic** — Edge cases, error states, security
3. **Implementer Critic** — Clarity, types, testability

Output `critique.md` to the session directory.

### Verdict Rules

- **REVISE_DESIGN** if: any HIGH severity issue, 3+ MEDIUM issues, or consensus issue (2+ critics)
- **APPROVED** if: no HIGH issues, fewer than 3 MEDIUM, all concerns LOW or mitigated

### Checkpoint

Present the critique summary and say:

```
Phase 3 Complete — Adversarial review done.
Standalone command: /ar

**Verdict:** [APPROVED | REVISE_DESIGN]

[Summary: consensus issues, high severity items, critic breakdown]

Artifact: {session-dir}/critique.md

Tip: You can run this phase independently with `/ar` — it attacks the design from 3 perspectives (architect, skeptic, implementer) to find weaknesses.

[If APPROVED] Reply "continue" to proceed to Phase 4: Planning (/plan).
[If REVISE_DESIGN] I recommend revising the design to address the issues above. Reply "revise" to go back to Phase 2 (/design), or "override" to proceed anyway.
```

**WAIT for user response before continuing.**

- If user says "revise": go back to Phase 2 with critique feedback. Max 2 revision cycles.
- If user says "override": proceed and log the override in critique.md.

---

## Phase 4: Deterministic Planning

Use the **atomic-planner** agent.

**Input:** Read `design.md` and `critique.md` (if exists) from the session directory.

1. Extract all components, endpoints, and changes from the design
2. For each change: verify file paths, read current code, create BEFORE/AFTER snippets
3. Order steps by dependency (5-8 steps max)
4. Add concrete test cases with inputs/outputs
5. Output `plan.md` to the session directory

### Checkpoint

Present the plan summary and say:

```
Phase 4 Complete — Implementation plan ready.
Standalone command: /plan

[Summary: step overview table, files affected]

Artifact: {session-dir}/plan.md

Tip: You can run this phase independently with `/plan` — it creates deterministic, atomic steps with exact BEFORE/AFTER code so the builder doesn't have to guess.

Review the plan above. Reply with feedback to revise, or "continue" to proceed to Phase 5: Drift Detection (/pmatch).
```

**WAIT for user response before continuing.**

---

## Phase 5: Drift Detection

Use the **drift-detector** agent.

**Input:** Read `design.md` and `plan.md` from the session directory.

1. Extract all design requirements
2. Map each requirement to plan step(s)
3. Check for: missing coverage, scope creep, contradictions, incomplete steps
4. Output `drift-report.md` to the session directory

### Verdict Rules

- **ALIGNED** if: all requirements covered, no creep, no contradictions
- **DRIFT_DETECTED** if: any requirement uncovered, unjustified scope creep, contradictions

### Checkpoint

Present the drift report and say:

```
Phase 5 Complete — Drift detection done.
Standalone command: /pmatch

**Verdict:** [ALIGNED | DRIFT_DETECTED]

[Summary: coverage stats, any drift issues]

Artifact: {session-dir}/drift-report.md

Tip: You can run this phase independently with `/pmatch` — it compares plan vs. design to catch missing coverage, scope creep, or contradictions before you build.

[If ALIGNED] Reply "continue" to proceed to Phase 6: Build (/build).
[If DRIFT_DETECTED] I recommend fixing the drift. Reply "fix-plan" to revise the plan (/plan), "fix-design" to revise the design (/design), or "override" to build anyway.
```

**WAIT for user response before continuing.**

- If user says "fix-plan": go back to Phase 4.
- If user says "fix-design": go back to Phase 2.
- If user says "override": proceed and log override in drift-report.md.

---

## Phase 6: Build

Use the **builder** agent.

**Input:** Read `plan.md` from the session directory.

For each step in the plan (sequentially):
1. Fresh read — only files mentioned in that step
2. Verify BEFORE code matches current state
3. Apply AFTER code via Edit/Write
4. Verify acceptance criteria
5. Log result in build-report.md

After all steps:
1. Run `npm run build`
2. Run `npx tsc --noEmit`
3. Output `build-report.md` to the session directory

**Error handling:** If a step fails (BEFORE mismatch, file not found), stop and report. Do NOT improvise fixes.

### Checkpoint

Present the build report and say:

```
Phase 6 Complete — Build done.
Standalone command: /build

**Verdict:** [SUCCESS | PARTIAL | FAILED]

[Summary: steps completed, files changed, build/type check status]

Artifact: {session-dir}/build-report.md

Tip: You can run this phase independently with `/build` — it executes the plan step-by-step with context isolation (each step only reads its own files).

[If SUCCESS] Reply "continue" to run the QA pipeline: /denoise → /qf → /qb → /qd → /security-review (Phases 7-11, runs automatically).
[If PARTIAL/FAILED] Review the issues above. Reply "continue" to run QA anyway, or describe what needs fixing.
```

**WAIT for user response before continuing.**

---

## Phases 7-11: QA Pipeline (runs automatically)

These phases run back-to-back without pausing. They are validation-only and produce a combined `qa-report.md`.

### Phase 7: Denoise (`/denoise`)

Use the **denoiser** agent. Scan changed files and remove debug artifacts (console.log, debugger, commented code, TODOs). Keep legitimate error logging.

### Phase 8: Quality Fit (`/qf`)

Use the **quality-fit** agent. Run `npx tsc --noEmit` and `npx eslint [files]`. Check RDO conventions (database imports, auth middleware, MUI Grid v2, theme tokens, React Query).

### Phase 9: Quality Behavior (`/qb`)

Use the **quality-behavior** agent. Run `npm run build` and `npm test`. Verify behavior against design.md requirements and edge cases from critique.md.

### Phase 10: Quality Docs (`/qd`)

Use the **quality-docs** agent. Check API routes for Swagger docs, exported functions for JSDoc, complex types for descriptions.

### Phase 11: Security Review (`/security-review`)

Use the **security-auditor** agent. Scan for injection (SQL, XSS, command), auth bypass, missing multi-tenant filters, hardcoded secrets.

---

## Final Report

After all phases complete, present the final summary:

```
## Pipeline Complete

### Task
[Original task description]

### Session
[Session directory path]

### Phase Results
| Phase | Name | Command | Verdict |
|-------|------|---------|---------|
| 1 | Requirements | `/arm` | CRYSTALLIZED |
| 2 | Design | `/design` | READY_FOR_REVIEW |
| 3 | Adversarial Review | `/ar` | [APPROVED/REVISE_DESIGN] |
| 4 | Planning | `/plan` | [READY_FOR_BUILD/NEEDS_DETAIL] |
| 5 | Drift Detection | `/pmatch` | [ALIGNED/DRIFT_DETECTED] |
| 6 | Build | `/build` | [SUCCESS/PARTIAL/FAILED] |
| 7 | Denoise | `/denoise` | [CLEAN/CLEANED] |
| 8 | Quality Fit | `/qf` | [PASS/FAIL] |
| 9 | Quality Behavior | `/qb` | [PASS/FAIL] |
| 10 | Quality Docs | `/qd` | [PASS/WARN/FAIL] |
| 11 | Security | `/security-review` | [PASS/FAIL/CRITICAL] |

### Files Changed
[List of all files modified/created]

### Overrides
[Any quality gates that were overridden, or "None"]

### Status: [COMPLETE | COMPLETE WITH WARNINGS | NEEDS ATTENTION]
```

---

## Skip Rules

- **Skip Phase 1 (Requirements)** if: the user says requirements are clear, OR passes `--skip-arm`. Session setup still runs.
- **Skip Phase 3 (Adversarial Review)** if: the user passes `--skip-ar` for smaller changes.
- **Skip Phase 5 (Drift Detection)** if: the user passes `--skip-pmatch`.
- **Never skip** Phases 2, 4, 6, or the QA pipeline.

## Trivial Tasks

If the task is truly trivial (single-line fix, typo, config change), do NOT use this pipeline. Just make the change directly.
