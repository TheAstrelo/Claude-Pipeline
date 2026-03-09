# Pipeline Phase Definitions

Reference this file when executing the pipeline. Each phase has a role, inputs, outputs, and validation rules.

## Phase 0: Pre-Check (HARD gate, NEVER skip)

**Goal:** Prevent duplicate work.
**Process:** Extract keywords from task → search codebase (API routes, components, services, migrations) → check package manifest → web search (max 3).
**Output** `pre-check.md`: Codebase Matches table, Installed Libraries table, Recommendation (EXTEND_EXISTING / USE_LIBRARY / BUILD_NEW), Reasoning.
**Validate:** Has matches section (HARD), has recommendation (HARD), has reasoning (SOFT).
**Effects:** EXTEND_EXISTING → load found file into Phase 2. USE_LIBRARY → add install to Phase 4.

## Phase 1: Requirements (SOFT gate)

**Goal:** Extract testable requirements.
**Input:** Task + pre-check context.
**Output** `brief.md`: Verdict (CLEAR/NEEDS_INPUT), Problem, Success Criteria, Scope, Constraints, Assumptions.
**Validate:** Has Problem (SOFT), has Criteria (SOFT), no NEEDS_INPUT (HARD).
**Rules:** Max 3 questions. Skip Q&A if task is specific.

## Phase 2: Design (SOFT gate)

**Goal:** Technical design with cited sources.
**Input:** brief.md (Problem, Criteria, Constraints only).
**Output** `design.md`: Decisions (max 6, each with source citation), Components (max 4), Data Changes, Risks.
**Validate:** Has Decisions (SOFT), has sources (SOFT), no NEEDS_RESEARCH (HARD), paths exist (SOFT).

## Phase 3: Adversarial Review (HARD gate, skip in yolo)

**Goal:** Critique design from 3 angles.
**Input:** design.md decisions only.
**Angles:** Architect (scalability), Skeptic (edge cases/security), Implementer (types/testability).
**Output** `critique.md`: Verdict (APPROVED/REVISE_DESIGN), Issues table (max 10: Angle | Severity | Issue | Fix), Consensus.
**Verdict rules:** HIGH issue OR 3+ MEDIUM OR consensus → REVISE_DESIGN.
**Recovery:** On REVISE_DESIGN → feed issues back to Phase 2, retry once.

## Phase 4: Planning (SOFT gate)

**Goal:** Deterministic implementation steps.
**Input:** design.md decisions + file paths.
**Output** `plan.md`: Verdict (READY/NEEDS_DETAIL), Steps table (max 8), each with BEFORE/AFTER code + test case.
**Validate:** Has steps (HARD), has BEFORE/AFTER (SOFT), max 8 steps (SOFT), MODIFY paths exist (HARD), no NEEDS_DETAIL (HARD).

## Phase 5: Drift Detection (SOFT gate, skip in yolo)

**Goal:** Verify plan covers design.
**Input:** design.md + plan.md.
**Output** `drift-report.md`: Verdict (ALIGNED/DRIFT_DETECTED), Coverage Matrix, Missing/Creep/Contradictions.
**Validate:** Has verdict (HARD), coverage >= 90% (SOFT).
**Recovery:** On DRIFT_DETECTED → add missing steps, retry once.

## Phase 6: Build (NONE gate, HARD on BLOCKED)

**Goal:** Execute plan exactly.
**Process:** For each step: read only that step's files → verify BEFORE matches → apply AFTER exactly → run test → log result.
**Output** `build-report.md`: Verdict (SUCCESS/PARTIAL/FAILED), Results table, Build/Types check, Files Changed.
**Rules:** NEVER improvise. NEVER refactor untouched code. BLOCKED → stop and report. Retry failures max 2/step.

## Phases 7-10: QA (NONE gate, skip in yolo)

All work on changed files from build-report.md. Append to `qa-report.md`.

- **Phase 7 Denoise:** Remove console.logs, debugger, commented code, TODO/DEBUG markers, unused imports. Keep console.error with prefix.
- **Phase 8 Quality Fit:** Run type checker + linter. Check conventions. Auto-fix.
- **Phase 9 Quality Behavior:** Run build + tests. Verify against design spec. Check edge cases from critique.
- **Phase 10 Quality Docs:** Check API route docs (required), function docs (recommended), type docs (nice-to-have).

## Phase 11: Security (HARD gate, NEVER skip)

**Goal:** Scan for vulnerabilities.
**Input:** Changed files from build-report.md.
**Scans:** Injection (string interpolation in queries), XSS, auth gaps (routes without middleware), secrets (hardcoded keys/passwords), access control (queries without user scoping).
**Output:** Append to `qa-report.md`: Verdict (PASS/FAIL/CRITICAL), Findings table (Type | File:Line | Severity | Fix).
**Verdict:** Injection/secrets → CRITICAL. XSS/auth bypass → FAIL. Clear → PASS.
**CRITICAL always stops, even in yolo.**
