# Pipeline Agent Roles

When running the pipeline, adopt these roles for each phase. Each role has specific inputs, outputs, and constraints.

**Model routing:** Phases marked `[fast]` can use the cheaper/faster model. Phases marked `[strong]` need the best available model for deep reasoning.

---

## Phase 0: Pre-Check Agent [fast]

**Goal:** Prevent duplicate work by searching for existing implementations.

**Input:** Task description

**Process:**
1. Extract keywords (feature names, entities, actions)
2. Search codebase: API routes, components, services, utils, migrations
3. Check package manifest for related libraries
4. Web search for external options (max 3 searches)

**Output** (`pre-check.md`):
- Codebase Matches table (Type | Path | Relevance)
- Installed Libraries table
- Recommendation: EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW
- Reasoning (1-2 sentences)

**Rules:** If HIGH relevance match → EXTEND_EXISTING. If good library installed → USE_LIBRARY. BUILD_NEW only as last resort.

---

## Phase 1: Requirements Agent [fast]

**Goal:** Extract clear, testable requirements.

**Input:** Task + pre-check context

**Output** (`brief.md`):
- Verdict: CLEAR or NEEDS_INPUT
- Problem (1-2 sentences)
- Success Criteria (numbered, testable)
- Scope (in/out), Constraints, Assumptions

**Rules:** Max 3 clarifying questions. Skip Q&A if task is specific. Always output a brief, even with assumptions.

---

## Phase 2: Design Agent [strong]

**Goal:** Create technical design with cited sources.

**Input:** brief.md (Problem, Criteria, Constraints only)

**Output** (`design.md`):
- Decisions (max 6) — each with 1-line rationale + source citation
- Components table (max 4)
- Data Changes (SQL or "None")
- Risks table

**Rules:** Every decision cites a source. No docs found → output NEEDS_RESEARCH. Reference files by path, don't inline code.

---

## Phase 3: Adversarial Agent [strong]

**Goal:** Critique design from 3 angles in one pass.

**Input:** design.md decisions list only

**Angles:** Architect (scalability, coupling), Skeptic (edge cases, security), Implementer (types, testability)

**Output** (`critique.md`):
- Verdict: APPROVED or REVISE_DESIGN
- Issues table (max 10): Angle | Severity | Issue | 1-line Fix
- Consensus section (issues raised by 2+ angles)

**Verdict:** HIGH issue OR 3+ MEDIUM OR consensus → REVISE_DESIGN. Else → APPROVED.

---

## Phase 4: Planning Agent [fast]

**Goal:** Convert design into deterministic executable steps.

**Input:** design.md decisions + file paths

**Output** (`plan.md`):
- Verdict: READY or NEEDS_DETAIL
- Steps table (max 8): File | Action (MODIFY/CREATE) | Depends
- Each step: BEFORE code (3-5 lines context), AFTER code (paste-ready), Test case

**Rules:** Max 8 steps. MODIFY paths must exist. No full file dumps. Missing detail → NEEDS_DETAIL flag.

---

## Phase 5: Drift Detection Agent [fast]

**Goal:** Verify plan covers all design requirements.

**Input:** design.md + plan.md

**Output** (`drift-report.md`):
- Verdict: ALIGNED or DRIFT_DETECTED
- Coverage Matrix: Design Requirement | Plan Step | COVERED/MISSING
- Missing Coverage, Scope Creep, Contradictions sections
- Coverage percentage

**Verdict:** Any uncovered requirement or contradiction → DRIFT_DETECTED.

---

## Phase 6: Builder Agent [fast]

**Goal:** Execute plan steps exactly. No improvisation.

**Input:** plan.md (one step at a time)

**Process per step:**
1. Read ONLY files in that step
2. Verify BEFORE matches current code
3. Apply AFTER exactly
4. Run step test
5. Log result

**Output** (`build-report.md`):
- Verdict: SUCCESS, PARTIAL, or FAILED
- Results table: Step | File | Status (DONE/BLOCKED) | Notes
- Build/Types verification
- Files Changed list

**Rules:** NEVER improvise. NEVER refactor untouched code. NEVER add unplanned comments. If blocked → STOP and report.

---

## Phases 7-10: QA Agents [fast]

All QA agents read `build-report.md` for changed files. Output appends to `qa-report.md`.

**Phase 7 — Denoiser:** Remove console.logs, debugger, commented code, TODO/DEBUG markers, unused imports. Keep console.error with component prefix.

**Phase 8 — Quality Fit:** Run type checker + linter on changed files. Check project conventions. Auto-fix what's possible.

**Phase 9 — Quality Behavior:** Run production build + tests. Verify behavior matches design spec. Check edge cases from critique.

**Phase 10 — Quality Docs:** Check API routes have doc comments. Check exported functions have doc comments. Priority: API docs > function docs > type docs.

---

## Phase 11: Security Agent [fast]

**Goal:** Scan changed files for vulnerabilities.

**Input:** Changed files from build-report.md

**Scans:**
1. Injection — string interpolation in queries
2. XSS — unsanitized HTML rendering
3. Auth gaps — API routes without auth middleware
4. Secrets — hardcoded passwords/keys/tokens
5. Access control — queries without user scoping

**Output** (append to `qa-report.md`):
- Verdict: PASS, FAIL, or CRITICAL
- Findings table: Type | File:Line | Severity | Fix

**Verdict:** Injection/secrets → CRITICAL (always pauses). XSS/auth bypass → FAIL. All clear → PASS.
