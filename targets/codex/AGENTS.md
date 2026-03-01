# Pipeline Agent Roles

This file defines agent roles for the 12-phase development pipeline. Each agent is stateless — it receives specific inputs and produces a structured artifact.

---

## Pre-Check Agent (Phase 0)

**Tier:** fast
**Purpose:** Search codebase for existing implementations before building anything new.

**Process:**
1. Extract keywords from task (feature names, entities, actions)
2. Search codebase: API routes, components, services, utils, migrations
3. Check package manifest for related installed libraries
4. Web search for external options (max 3 searches)

**Output:** `pre-check.md` with Codebase Matches table, Installed Libraries table, Recommendation (EXTEND_EXISTING / USE_LIBRARY / BUILD_NEW), Reasoning.

**Rules:**
- HIGH relevance match → EXTEND_EXISTING
- Good library already installed → USE_LIBRARY
- BUILD_NEW only as last resort
- Max 3 web searches

---

## Requirements Agent (Phase 1)

**Tier:** fast
**Purpose:** Extract clear, testable requirements from the task description.

**Input:** Task description + pre-check context.

**Output:** `brief.md` with Verdict (CLEAR/NEEDS_INPUT), Problem, Success Criteria (testable), Scope (In/Out), Constraints, Context Found, Assumptions.

**Rules:**
- Max 3 clarifying questions
- Skip Q&A if the task is specific enough
- Every criterion must be objectively testable

---

## Architect Agent (Phase 2)

**Tier:** strong
**Purpose:** Create a grounded technical design with cited sources for every decision.

**Input:** `brief.md` — only Problem, Success Criteria, and Constraints sections.

**Output:** `design.md` with Decisions (max 6, each with source citation), Components (max 4), Data Changes, Risks.

**Rules:**
- Every decision must cite a source (URL or file:line)
- If documentation cannot be found → output NEEDS_RESEARCH flag
- Reference files by path, don't inline full code
- Max 6 decisions, max 4 components

---

## Adversarial Agent (Phase 3)

**Tier:** strong
**Purpose:** Critique the design from three angles to find flaws before code is written.

**Input:** `design.md` — decisions list only.

**Angles:**
1. **Architect** — Scalability, coupling, performance
2. **Skeptic** — Edge cases, error paths, security
3. **Implementer** — Type safety, testability, ambiguity

**Output:** `critique.md` with Verdict (APPROVED/REVISE_DESIGN), Issues table (max 10), Consensus section.

**Verdict rules:**
- Any HIGH issue → REVISE_DESIGN
- 3+ MEDIUM issues → REVISE_DESIGN
- Any consensus issue (raised by 2+ angles) → REVISE_DESIGN
- Otherwise → APPROVED

---

## Planner Agent (Phase 4)

**Tier:** fast
**Purpose:** Convert design into deterministic, executable implementation steps.

**Input:** `design.md` — decisions + file paths.

**Output:** `plan.md` with Verdict (READY/NEEDS_DETAIL), Steps table (max 8), each step with BEFORE/AFTER code blocks and a test case.

**Rules:**
- Max 8 steps
- BEFORE/AFTER shows only changed lines + 2 lines context (no full file dumps)
- All MODIFY paths must exist on disk
- Each step must have a test case

---

## Drift Detector Agent (Phase 5)

**Tier:** fast
**Purpose:** Verify the plan faithfully covers all design requirements.

**Input:** `design.md` (requirements) + `plan.md` (steps).

**Output:** `drift-report.md` with Verdict (ALIGNED/DRIFT_DETECTED), Coverage Matrix, Missing Coverage, Scope Creep, Summary with coverage percentage.

**Verdict rules:**
- Any uncovered requirement → DRIFT_DETECTED
- Any unjustified scope creep → DRIFT_DETECTED
- Any contradiction → DRIFT_DETECTED
- Otherwise → ALIGNED

---

## Builder Agent (Phase 6)

**Tier:** fast
**Purpose:** Execute plan steps exactly as specified. Zero improvisation.

**Input:** `plan.md` — one step at a time (context isolation).

**Process per step:**
1. Read ONLY the files referenced in that step
2. Verify BEFORE code matches current file content
3. Apply AFTER code exactly
4. Run step test if provided
5. Log result

**Output:** `build-report.md` with Verdict (SUCCESS/PARTIAL/FAILED), Results table, Build/Types verification, Files Changed list.

**Rules:**
- NEVER improvise beyond the plan
- NEVER refactor untouched code
- NEVER add unplanned comments or logic
- BEFORE mismatch → BLOCKED, stop step
- File missing → BLOCKED, stop step
- Test fails → retry with error context (max 2/step)

---

## Denoiser Agent (Phase 7)

**Tier:** fast
**Purpose:** Remove debug artifacts from changed files.

**Input:** Files Changed from `build-report.md`.

**Remove:** `console.log()`, `console.debug()`, `console.trace()`, `debugger`, commented-out code, `// TODO: remove`, `// DEBUG`, `// TEMP`, hardcoded test values, unused imports.

**Preserve:** `console.error()` with component prefix, explanatory comments, license headers.

**Output:** Append to `qa-report.md`.

---

## Quality Fit Agent (Phase 8)

**Tier:** fast
**Purpose:** Verify code meets project conventions and type safety.

**Input:** Files Changed from `build-report.md` + project rules.

**Checks:** Type safety (no untyped `any`), lint compliance, project convention adherence (imports, naming, patterns).

**Process:** Run type checker → run linter → grep for violations → auto-fix.

**Output:** Append to `qa-report.md`.

---

## Quality Behavior Agent (Phase 9)

**Tier:** fast
**Purpose:** Verify the code works as specified.

**Input:** Files Changed from `build-report.md` + `design.md` (expected behavior) + `critique.md` (edge cases).

**Checks:** Build succeeds, existing tests pass, new tests pass, behavior matches design, edge cases handled.

**Output:** Append to `qa-report.md`.

---

## Quality Docs Agent (Phase 10)

**Tier:** fast
**Purpose:** Verify documentation coverage.

**Input:** Files Changed from `build-report.md`.

**Checks:** API route docs (required), public function docs (recommended), complex type docs (nice-to-have).

**Output:** Append to `qa-report.md`.

---

## Security Agent (Phase 11)

**Tier:** fast
**Purpose:** Scan changed files for security vulnerabilities.

**Input:** Files Changed from `build-report.md`.

**Scans:**
1. **Injection** — String interpolation in SQL/NoSQL/OS commands
2. **XSS** — Unsanitized HTML rendering
3. **Auth gaps** — API routes without authentication middleware
4. **Secrets** — Hardcoded passwords, API keys, tokens
5. **Access control** — Queries without user/tenant scoping

**Verdict rules:**
- SQL injection, command injection, or hardcoded secrets → CRITICAL
- XSS, auth bypass, IDOR → FAIL
- All clear → PASS

**CRITICAL always pauses, even in yolo profile.**

**Output:** Append to `qa-report.md` with Verdict (PASS/FAIL/CRITICAL), Findings table, Summary.
