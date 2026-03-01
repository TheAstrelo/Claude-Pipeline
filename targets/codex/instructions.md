# AI Development Pipeline — Codex CLI

This project uses a structured 12-phase development pipeline. When asked to run the pipeline (e.g., "run the pipeline for: <task>"), follow these rules exactly.

---

## Profiles

- **yolo** — Skip phases 3,5,7-10. Only HARD failures pause. Max 1 retry.
- **standard** (default) — All phases. HARD pauses, SOFT warns. Max 2 retries.
- **paranoid** — All phases. Any failure pauses. Max 3 retries.

Phase 0 (Pre-Check) and Phase 11 (Security) are NEVER skipped, regardless of profile.

---

## Gate System

- **HARD gates** (phases 0, 3, 11): Must pass or stop for human review.
- **SOFT gates** (phases 1, 2, 4, 5): Warn and proceed. Stop in paranoid.
- **NONE gates** (phases 6-10): Always proceed, auto-fix if possible.

### Decision Matrix

| HARD Fails | SOFT Fails | yolo | standard | paranoid |
|------------|------------|------|----------|----------|
| 0 | 0 | AUTO | AUTO | AUTO |
| 0 | 1+ | AUTO | WARN | PAUSE |
| 1+ | any | PAUSE | PAUSE | PAUSE |

- **AUTO** — Proceed silently.
- **WARN** — Proceed, log the warning.
- **PAUSE** — Stop and ask the user. User can respond: continue, revise, or override.

---

## Validation Principle

Never trust self-reported confidence. Validate outputs by checking:
- Required sections exist in the artifact
- Failure flags (NEEDS_INPUT, CRITICAL, etc.) are absent
- Referenced file paths exist on disk
- Count thresholds are met

---

## Flag Vocabulary

| Flag | Meaning | Produced By |
|------|---------|-------------|
| `NEEDS_INPUT` | Requirements are ambiguous | Phase 1 |
| `NEEDS_RESEARCH` | Cannot find documentation | Phase 2 |
| `NEEDS_DETAIL` | Plan step lacks specificity | Phase 4 |
| `APPROVED` | Design passes review | Phase 3 |
| `REVISE_DESIGN` | Design has critical issues | Phase 3 |
| `ALIGNED` | Plan covers all requirements | Phase 5 |
| `DRIFT_DETECTED` | Plan misses requirements | Phase 5 |
| `BLOCKED` | Build step cannot proceed | Phase 6 |
| `SUCCESS` / `PARTIAL` / `FAILED` | Build result | Phase 6 |
| `CRITICAL` | Security vulnerability found | Phase 11 |
| `EXTEND_EXISTING` | Extend existing code | Phase 0 |
| `USE_LIBRARY` | Use an installed library | Phase 0 |
| `BUILD_NEW` | Build from scratch | Phase 0 |

---

## Model Routing

Use cheaper models for mechanical phases. Only phases 2 (Design) and 3 (Adversarial Review) need a strong model. All others use the fast model.

| Phases | Tier | OpenAI Model |
|--------|------|--------------|
| 0, 1, 4-11 | fast | `o3-mini` or `gpt-4.1-mini` |
| 2, 3 | strong | `o3` or `gpt-4.1` |

This gives ~70% cost reduction vs. using the strong model for everything.

---

## Auto-Recovery

- Phase 3 `REVISE_DESIGN` → feed issues back to Phase 2, retry once.
- Phase 5 `DRIFT_DETECTED` → add missing plan steps, retry once.
- Phase 6 step failure → retry with error context, max 2 per step.
- Phases 7-10 → auto-fix inline, max 1 attempt.

---

## Artifacts

Store all pipeline artifacts in `.pipeline/artifacts/{session}/`:
- `pre-check.md`, `brief.md`, `design.md`, `critique.md`
- `plan.md`, `drift-report.md`, `build-report.md`, `qa-report.md`

---

## Phase Definitions

### Phase 0: Pre-Check (HARD gate, NEVER skip)

**Goal:** Prevent duplicate work by searching for existing implementations.

**Process:**
1. Extract keywords from task (feature names, entities, actions)
2. Search codebase for matches: API routes, components, services, utils, migrations
3. Check package manifest for related installed libraries
4. Web search for external options (max 3 searches)

**Output** `pre-check.md`:
```
# Pre-Check: {task}

## Codebase Matches
| Type | Path | Relevance |
|------|------|-----------|

## Installed Libraries
| Package | Version | Purpose |
|---------|---------|---------|

## Recommendation
[EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW]

**Reasoning:** (1-2 sentences)
```

**Validators:**
- `codebase_searched` → has "Codebase Matches" section (HARD)
- `has_recommendation` → contains EXTEND_EXISTING, USE_LIBRARY, or BUILD_NEW (HARD)
- `reasoning_present` → contains "Reasoning:" (SOFT)

**Effects:** EXTEND_EXISTING → load found file into Phase 2 context. USE_LIBRARY → add install to Phase 4 steps.

---

### Phase 1: Requirements (SOFT gate)

**Goal:** Extract clear, testable requirements.

**Input:** Task description + pre-check context.

**Output** `brief.md`:
```
# Brief: {title}

## Verdict: [CLEAR | NEEDS_INPUT]

## Problem
(1-2 sentences)

## Success Criteria
1. (testable criterion)
2. (testable criterion)

## Scope
- In: (included)
- Out: (excluded)

## Constraints
- (technical or business constraints)

## Context Found
- (relevant file:line references)

## Assumptions
- (anything assumed)
```

**Validators:**
- `has_problem` → has "## Problem" section (SOFT)
- `has_criteria` → has "## Success Criteria" section (SOFT)
- `no_ambiguity` → does NOT contain "NEEDS_INPUT" (HARD)

**Rules:** Max 3 clarifying questions. Skip Q&A if task is specific enough.

---

### Phase 2: Design (SOFT gate, strong model)

**Goal:** Technical design with cited sources for every decision.

**Input:** `brief.md` (Problem, Success Criteria, Constraints only).

**Output** `design.md`:
```
# Design: {title}

## Decisions
1. **{choice}** — {rationale} — Source: {URL or file:line}
(max 6 decisions)

## Components
| Name | Purpose | Interface |
(max 4 components)

## Data Changes
(SQL schema changes or "None")

## Risks
| Risk | Mitigation |
```

**Validators:**
- `has_decisions` → has "## Decisions" section (SOFT)
- `has_sources` → at least 1 decision has "Source:" (SOFT)
- `no_research_gap` → does NOT contain "NEEDS_RESEARCH" (HARD)
- `paths_exist` → referenced file paths exist on disk (SOFT)

---

### Phase 3: Adversarial Review (HARD gate, skip in yolo)

**Goal:** Critique the design from 3 angles in a single pass.

**Input:** `design.md` decisions list only.

**Angles:**
1. **Architect** — Scalability, coupling, performance
2. **Skeptic** — Edge cases, error paths, security
3. **Implementer** — Type safety, testability, ambiguity

**Output** `critique.md`:
```
# Critique: {title}

## Verdict: [APPROVED | REVISE_DESIGN]

## Issues
| # | Angle | Severity | Issue | Fix |
(max 10 issues, 1-line fix each)

## Consensus
(issues raised by 2+ angles — highest priority)

## Blocks (if REVISE_DESIGN)
1. (must fix before proceeding)
```

**Verdict rules:**
- Any HIGH issue → REVISE_DESIGN
- 3+ MEDIUM issues → REVISE_DESIGN
- Any consensus issue → REVISE_DESIGN
- Otherwise → APPROVED

**Recovery:** On REVISE_DESIGN → feed issues back to Phase 2, retry once.

**Validators:**
- `has_verdict` → contains APPROVED or REVISE_DESIGN (HARD)
- `no_high_severity` → no "| HIGH |" rows (HARD)
- `few_medium` → fewer than 3 MEDIUM issues (SOFT)
- `no_consensus` → no consensus issues listed (HARD)

---

### Phase 4: Planning (SOFT gate)

**Goal:** Convert design into deterministic implementation steps.

**Input:** `design.md` (decisions + file paths).

**Output** `plan.md`:
```
# Plan: {title}

## Verdict: [READY | NEEDS_DETAIL]

## Steps
| # | File | Action | Depends |
|---|------|--------|---------|

### Step 1: {title}
**File:** `path` [MODIFY|CREATE]
**Deps:** None

**Before:**
```{lang}
(current code — 3-5 lines of context)
```

**After:**
```{lang}
(new code — paste-ready)
```

**Test:** {input} → {expected output}
```

**Validators:**
- `has_steps` → at least 1 "### Step" heading (HARD)
- `has_before_after` → each step has Before/After blocks (SOFT)
- `max_8_steps` → no more than 8 steps (SOFT)
- `paths_verified` → MODIFY file paths exist on disk (HARD)
- `no_detail_flag` → does NOT contain "NEEDS_DETAIL" (HARD)

---

### Phase 5: Drift Detection (SOFT gate, skip in yolo)

**Goal:** Verify the plan covers all design requirements.

**Input:** `design.md` + `plan.md`.

**Output** `drift-report.md`:
```
# Drift Report: {title}

## Verdict: [ALIGNED | DRIFT_DETECTED]

## Coverage Matrix
| Design Requirement | Plan Step | Status |
|--------------------|-----------|--------|

## Missing Coverage
(requirements with no plan step)

## Scope Creep
(plan steps not justified by design)

## Summary
- Design Requirements: N
- Covered: N
- Missing: N
- Coverage: N%
```

**Validators:**
- `has_verdict` → contains ALIGNED or DRIFT_DETECTED (HARD)
- `coverage_ok` → coverage >= 90% (SOFT)
- `no_drift` → does NOT contain "DRIFT_DETECTED" (SOFT)

**Recovery:** On DRIFT_DETECTED → add missing steps, retry once.

---

### Phase 6: Build (NONE gate, HARD on BLOCKED)

**Goal:** Execute plan steps exactly as specified. No improvisation.

**Process:** For each step:
1. Read ONLY the files referenced in that step (context isolation)
2. Verify BEFORE code matches current file content
3. Apply AFTER code exactly
4. Run step test if provided
5. Log result

**Output** `build-report.md`:
```
# Build: {title}

## Verdict: [SUCCESS | PARTIAL | FAILED]

## Results
| Step | File | Status | Notes |
|------|------|--------|-------|

## Verification
- Build: [PASS|FAIL]
- Types: [PASS|FAIL]

## Files Changed
(list of all modified/created files)
```

**Rules:**
- NEVER improvise beyond the plan
- NEVER refactor untouched code
- NEVER add unplanned comments or logic
- If blocked → STOP and report

**Validators:**
- `no_blocked` → does NOT contain "BLOCKED" (HARD)
- `build_passes` → contains "Build:.*PASS" (SOFT)
- `types_pass` → contains "Types:.*PASS" (SOFT)

---

### Phases 7-10: QA (NONE gates, skip in yolo)

All phases work on changed files from `build-report.md`. Append results to `qa-report.md`.

**Phase 7 — Denoise:** Remove `console.log`, `debugger`, commented-out code, TODO/DEBUG/TEMP markers, unused imports. Keep `console.error` with component prefix.

**Phase 8 — Quality Fit:** Run type checker + linter. Check project conventions. Auto-fix violations.

**Phase 9 — Quality Behavior:** Run build + tests. Verify behavior against design spec. Check edge cases from critique.

**Phase 10 — Quality Docs:** Check API route docs (required), public function docs (recommended), type docs (nice-to-have).

---

### Phase 11: Security (HARD gate, NEVER skip)

**Goal:** Scan changed files for security vulnerabilities.

**Scans:**
1. **Injection** — String interpolation in SQL/NoSQL/OS commands
2. **XSS** — Unsanitized HTML rendering
3. **Auth gaps** — API routes without authentication middleware
4. **Secrets** — Hardcoded passwords, API keys, tokens
5. **Access control** — Queries without user/tenant scoping

**Output** (append to `qa-report.md`):
```
# Security: {title}

## Verdict: [PASS | FAIL | CRITICAL]

## Findings
| Type | File:Line | Pattern | Severity | Fix |

## Summary
- Injection: [CLEAR|FOUND]
- Auth: [N/M routes protected]
- Secrets: [CLEAR|FOUND]
```

**Verdict rules:**
- SQL injection, command injection, or hardcoded secrets → CRITICAL
- XSS, auth bypass, IDOR → FAIL
- All clear → PASS

**CRITICAL always pauses, even in yolo profile.**

**Validators:**
- `scan_complete` → has "## Findings" section (HARD)
- `no_critical` → does NOT contain "CRITICAL" (HARD)
- `no_sqli` → does NOT contain "SQLi" (HARD)
- `auth_coverage` → does NOT contain "No middleware" (HARD)
- `no_secrets` → does NOT contain "Hardcoded" (HARD)

---

## Execution Flow

When running the pipeline:

1. Create session directory: `.pipeline/artifacts/{timestamp}/`
2. For each phase 0-11:
   - Check if phase is in the profile's skip list (never skip 0 or 11)
   - Run the phase with appropriate context
   - Write the output artifact to the session directory
   - Validate the artifact against the phase's validators
   - Apply gate decision (AUTO / WARN / PAUSE)
   - If PAUSE: attempt auto-recovery first, then ask the user
3. Output a final summary with phase results, validator counts, and files changed

### Final Summary Format

```
Pipeline Complete [PROFILE: {profile}]

Task: {task}
Session: {session}

Phases:
 0. Pre-Check      [AUTO]  → {recommendation}
 1. Requirements   [AUTO]  validators: N/N passed
 2. Design         [AUTO]  validators: N/N passed
 3. Adversarial    [AUTO]  validators: N/N passed
 4. Planning       [AUTO]  validators: N/N passed
 5. Drift          [AUTO]  validators: N/N passed
 6. Build          [AUTO]  validators: N/N passed
 7-10. QA          [AUTO]  auto-fixed: N issues
11. Security       [AUTO]  validators: N/N passed

Total validators: N/N passed
Files changed: {list}
Warnings: {list or "none"}
```
