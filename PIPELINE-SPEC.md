# AI Development Pipeline Specification

**Version:** 1.0
**Status:** Draft

A tool-agnostic specification for an automated, multi-phase AI development pipeline. This document defines the workflow, agent roles, validation rules, and gating logic that any AI coding tool can implement.

---

## Overview

The pipeline transforms a task description into production-ready code through 12 phases (0-11). Each phase has a dedicated agent role with defined inputs, outputs, and validation rules. Phases are connected by a gating system that decides whether to proceed, warn, or pause for human review.

```
Task Description
       │
       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 0    │───▶│  Phase 1     │───▶│  Phase 2     │
│  Pre-Check  │    │  Requirements│    │  Design      │
│  [HARD]     │    │  [SOFT]      │    │  [SOFT]      │
└─────────────┘    └──────────────┘    └──────────────┘
                                              │
       ┌──────────────────────────────────────┘
       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 3    │───▶│  Phase 4     │───▶│  Phase 5     │
│  Adversarial│    │  Planning    │    │  Drift Check │
│  [HARD]     │    │  [SOFT]      │    │  [SOFT]      │
└─────────────┘    └──────────────┘    └──────────────┘
                                              │
       ┌──────────────────────────────────────┘
       ▼
┌─────────────┐    ┌──────────────────────────────────┐
│  Phase 6    │───▶│  Phases 7-10 (parallel)          │
│  Build      │    │  7: Denoise    8: Quality Fit    │
│  [NONE]     │    │  9: Behavior  10: Docs           │
└─────────────┘    │  [NONE — auto-fix]               │
                   └──────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────┐
                          │  Phase 11    │
                          │  Security    │
                          │  [HARD]      │
                          └──────────────┘
                                    │
                                    ▼
                                  Done
```

---

## 1. Profiles

Profiles control which phases run and how strictly gates are enforced.

| Profile    | Description                | Skipped Phases     | Gate Mode | Max Retries |
|------------|----------------------------|--------------------|-----------|-------------|
| `yolo`     | Fast prototyping           | 3, 5, 7, 8, 9, 10 | soft      | 1           |
| `standard` | Balanced safety            | None               | mixed     | 2           |
| `paranoid` | Full human oversight       | None               | hard      | 3           |

**Phase 0 (Pre-Check) is NEVER skipped, regardless of profile.**

### Skip behavior

When a phase is skipped, the pipeline proceeds to the next phase using whatever artifacts already exist. If a skipped phase's artifact is required by a later phase and doesn't exist, the later phase must handle the missing input gracefully.

---

## 2. Gate System

Gates control whether the pipeline proceeds after each phase. Decisions are based on **output validation**, not self-reported confidence.

### 2.1 Gate Types

| Type   | Behavior                              | Assigned To              |
|--------|---------------------------------------|--------------------------|
| `HARD` | Must pass or pipeline pauses          | Phases 0, 3, 11         |
| `SOFT` | Warn and proceed if fails             | Phases 1, 2, 4, 5       |
| `NONE` | Always proceed, auto-fix if possible  | Phases 6, 7, 8, 9, 10   |

### 2.2 Decision Matrix

| HARD Fails | SOFT Fails | yolo        | standard     | paranoid    |
|------------|------------|-------------|--------------|-------------|
| 0          | 0          | AUTO        | AUTO         | AUTO        |
| 0          | 1+         | AUTO        | WARN         | PAUSE       |
| 1+         | any        | PAUSE       | PAUSE        | PAUSE       |

- **AUTO** — Proceed to next phase silently.
- **WARN** — Proceed but log the warning for the final report.
- **PAUSE** — Stop and wait for human review. Human can `continue`, `revise`, or `override`.

### 2.3 Auto-Recovery

Before pausing, the pipeline should attempt automatic recovery:

| Phase | Failure            | Recovery Action                    | Max Retries |
|-------|--------------------|------------------------------------|-------------|
| 3     | `REVISE_DESIGN`    | Feed issues back to Phase 2, rerun | 1           |
| 5     | `DRIFT_DETECTED`   | Add missing steps to plan          | 1           |
| 6     | Step failure       | Retry the failed step with error   | 2 per step  |
| 7-10  | Any issue          | Auto-fix inline                    | 1           |

---

## 3. Validation Rules

Every phase produces an artifact. Validators are objective checks (pattern matching, file existence, count thresholds) run against that artifact. **Self-reported confidence scores are ignored for gating decisions.**

### 3.1 Validator Format

Each validator has:

```yaml
- name: human_readable_name
  check: "objective check description"
  severity: HARD | SOFT
```

- **HARD validators**: If any fail, the phase fails with HARD severity.
- **SOFT validators**: If any fail, the phase fails with SOFT severity.

A phase's overall severity is the highest severity among its failed validators.

### 3.2 Validators by Phase

#### Phase 0: Pre-Check

| Validator            | Check                                                  | Severity |
|----------------------|--------------------------------------------------------|----------|
| `codebase_searched`  | Output contains "Codebase Matches" or equivalent       | HARD     |
| `has_recommendation` | Output contains one of: EXTEND_EXISTING, USE_LIBRARY, BUILD_NEW | HARD |
| `reasoning_present`  | Output contains reasoning for the recommendation       | SOFT     |

#### Phase 1: Requirements

| Validator          | Check                                                    | Severity |
|--------------------|----------------------------------------------------------|----------|
| `has_problem`      | Output contains a problem statement section              | SOFT     |
| `has_criteria`     | Output contains success criteria section                 | SOFT     |
| `criteria_testable`| At least 2 testable criteria listed                      | SOFT     |
| `no_ambiguity`     | Output does NOT contain "NEEDS_INPUT" flag               | HARD     |

#### Phase 2: Design

| Validator          | Check                                                    | Severity |
|--------------------|----------------------------------------------------------|----------|
| `has_decisions`    | Output contains a decisions section                      | SOFT     |
| `has_sources`      | At least 1 decision has a source citation                | SOFT     |
| `components_defined`| Output contains a components section                    | SOFT     |
| `no_research_gap`  | Output does NOT contain "NEEDS_RESEARCH" flag            | HARD     |
| `paths_exist`      | Referenced source file paths exist on disk               | SOFT     |

#### Phase 3: Adversarial Review

| Validator            | Check                                                  | Severity |
|----------------------|--------------------------------------------------------|----------|
| `has_verdict`        | Output contains verdict: APPROVED or REVISE_DESIGN     | HARD     |
| `no_high_severity`   | Output contains no HIGH severity issues                | HARD     |
| `few_medium`         | Fewer than 3 MEDIUM severity issues                    | SOFT     |
| `no_consensus_issues`| No issue raised by 2+ critique angles                  | HARD     |

#### Phase 4: Planning

| Validator             | Check                                                 | Severity |
|-----------------------|-------------------------------------------------------|----------|
| `has_steps`           | At least 1 implementation step defined                | HARD     |
| `steps_have_before_after` | Each step has BEFORE and AFTER code blocks        | SOFT     |
| `max_8_steps`         | No more than 8 steps total                            | SOFT     |
| `paths_verified`      | Files marked MODIFY exist on disk                     | HARD     |
| `no_detail_flag`      | Output does NOT contain "NEEDS_DETAIL" flag           | HARD     |

#### Phase 5: Drift Detection

| Validator       | Check                                                       | Severity |
|-----------------|-------------------------------------------------------------|----------|
| `has_verdict`   | Output contains verdict: ALIGNED or DRIFT_DETECTED          | HARD     |
| `coverage_ok`   | Coverage percentage >= 90%                                   | SOFT     |
| `no_drift`      | Output does NOT contain "DRIFT_DETECTED"                     | SOFT     |

#### Phase 6: Build

| Validator          | Check                                                    | Severity |
|--------------------|----------------------------------------------------------|----------|
| `no_blocked_steps` | Output does NOT contain "BLOCKED"                        | HARD     |
| `build_passes`     | Output contains build pass indicator                     | SOFT     |
| `types_pass`       | Output contains type check pass indicator                | SOFT     |
| `success_verdict`  | Output contains verdict: SUCCESS                         | SOFT     |

#### Phases 7-10: QA

These phases use NONE gates — they always proceed. Issues are auto-fixed inline.

| Phase | Agent Role       | Action                           |
|-------|------------------|----------------------------------|
| 7     | Denoiser         | Remove debug artifacts, auto-fix |
| 8     | Quality Fit      | Fix lint/type errors, auto-fix   |
| 9     | Quality Behavior | Run tests, log results           |
| 10    | Quality Docs     | Check docs coverage, log warnings|

#### Phase 11: Security

| Validator        | Check                                                     | Severity |
|------------------|-----------------------------------------------------------|----------|
| `scan_complete`  | Output contains findings section                          | HARD     |
| `no_critical`    | Output does NOT contain "CRITICAL" severity               | HARD     |
| `no_sqli`        | No SQL injection findings                                 | HARD     |
| `auth_coverage`  | No unprotected API routes found                           | HARD     |
| `no_secrets`     | No hardcoded secrets found                                | HARD     |

**Security CRITICAL findings always pause, even in `yolo` profile.**

---

## 4. Agent Roles

Each phase is executed by an agent with a specific role, defined inputs/outputs, and allowed tools. Agents are stateless — they receive context and produce an artifact. They do not see other phases' full artifacts unless explicitly passed as input.

### 4.1 Pre-Check Agent

**Purpose:** Prevent duplicate work by searching for existing implementations before building.

**Inputs:**
- Task description
- Access to project codebase (search/read)
- Access to package manifest (package.json, Cargo.toml, etc.)

**Process:**
1. Extract keywords from task (feature names, entity names, action verbs)
2. Search codebase for matching files (API routes, components, services, utils, migrations)
3. Search package manifest for related installed libraries
4. Optionally search web for external library options (max 3 searches)
5. Make recommendation

**Output artifact:** `pre-check.md`

```
# Pre-Check: {task}

## Codebase Matches
| Type | Path | Relevance |
|------|------|-----------|
(files found in codebase that relate to the task)

## Installed Libraries
| Package | Version | Purpose |
|---------|---------|---------|
(relevant packages already installed)

## Recommendation
[EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW]

**Reasoning:** (1-2 sentences)
```

**Downstream effects:**
- `EXTEND_EXISTING` → Found file loaded into Phase 2 context
- `USE_LIBRARY` → Install command added to Phase 4 steps
- `BUILD_NEW` → No special handling

**Allowed tools:** File search, file read, web search

---

### 4.2 Requirements Agent

**Purpose:** Extract clear, testable requirements from the task description.

**Inputs:**
- Task description
- Pre-check output (for context on existing code)

**Process:**
1. Parse task for feature, entities, and actions
2. Search codebase for related existing code
3. Ask max 3 clarifying questions (only if genuinely ambiguous)
4. If task is specific enough, skip Q&A entirely

**Output artifact:** `brief.md`

```
# Brief: {title}

## Verdict: [CLEAR | NEEDS_INPUT]

## Problem
(1-2 sentences)

## Success Criteria
1. (testable criterion)
2. (testable criterion)

## Scope
- In: (included features)
- Out: (explicitly excluded)

## Constraints
- (technical or business constraints)

## Context Found
- (relevant existing file:line references)

## Assumptions
- (anything assumed due to missing info)
```

**Allowed tools:** File search, file read

---

### 4.3 Design Agent

**Purpose:** Create a grounded technical design with cited sources for every decision.

**Inputs:**
- `brief.md` (Problem, Success Criteria, Constraints sections)
- Cached design patterns (if available)

**Process:**
1. Extract technical keywords
2. Fetch documentation for unfamiliar technologies (max 1 fetch per keyword)
3. Search codebase for existing patterns to follow
4. Output decisions with source citations

**Output artifact:** `design.md`

```
# Design: {title}

## Decisions
1. **{choice}** — {1-line rationale} — Source: {URL or file:line}
2. ...
(max 6 decisions)

## Components
| Name | Purpose | Interface |
|------|---------|-----------|
(max 4 components)

## Data Changes
(SQL schema changes or "None")

## Risks
| Risk | Mitigation |
|------|------------|
```

**Constraints:**
- Max 6 decisions
- Max 4 components
- Every decision must cite a source (URL or file:line)
- If documentation cannot be found, output "NEEDS_RESEARCH" flag

**Allowed tools:** File search, file read, web fetch

---

### 4.4 Adversarial Review Agent

**Purpose:** Critique the design from multiple angles in a single pass. Identify issues before code is written.

**Inputs:**
- `design.md` (decisions list only)

**Process:**
Evaluate every decision from 3 angles:
1. **Architect** — Scalability, coupling, performance
2. **Skeptic** — Edge cases, error paths, security
3. **Implementer** — Type safety, testability, ambiguity

**Output artifact:** `critique.md`

```
# Critique: {title}

## Verdict: [APPROVED | REVISE_DESIGN]

## Issues

| # | Angle | Severity | Issue | Fix |
|---|-------|----------|-------|-----|
(max 10 issues, 1-line fix each)

## Consensus
(issues raised by 2+ angles — highest priority)

## Blocks (if REVISE_DESIGN)
1. (must fix before proceeding)
```

**Verdict rules:**
- Any HIGH issue → `REVISE_DESIGN`
- 3+ MEDIUM issues → `REVISE_DESIGN`
- Any consensus issue → `REVISE_DESIGN`
- Otherwise → `APPROVED`

**Allowed tools:** File read, file search

---

### 4.5 Planning Agent

**Purpose:** Convert design into deterministic, executable implementation steps.

**Inputs:**
- `design.md` (decisions + file paths)

**Process:**
1. Read design decisions and referenced files
2. For each change, define a step with BEFORE/AFTER code
3. Verify all referenced file paths exist
4. Order steps by dependency

**Output artifact:** `plan.md`

```
# Plan: {title}

## Verdict: [READY | NEEDS_DETAIL]

## Steps

| # | File | Action | Depends |
|---|------|--------|---------|
| 1 | src/path/file.ts | MODIFY | - |
| 2 | src/path/new.ts | CREATE | 1 |

### Step 1: {title}
**File:** `path` [MODIFY|CREATE]
**Deps:** None

**Before:**
```{lang}
(current code — 3-5 lines of context)
```

**After:**
```{lang}
(new code — complete, paste-ready)
```

**Test:** {input} → {expected output}
```

**Constraints:**
- Max 8 steps
- BEFORE/AFTER shows only changed lines + 2 lines context (no full file dumps)
- All MODIFY paths must exist on disk
- Each step must have a test case

**Allowed tools:** File read, file search

---

### 4.6 Drift Detection Agent

**Purpose:** Verify the plan faithfully covers all design requirements before building.

**Inputs:**
- `design.md` (all requirements)
- `plan.md` (all steps)

**Process:**
1. Extract every requirement from design
2. Map each requirement to plan step(s)
3. Identify: missing coverage, scope creep, contradictions, incomplete steps

**Output artifact:** `drift-report.md`

```
# Drift Report: {title}

## Verdict: [ALIGNED | DRIFT_DETECTED]

## Coverage Matrix

| Design Requirement | Plan Step | Status |
|--------------------|-----------|--------|
| {requirement}      | Step N    | COVERED / MISSING |

## Missing Coverage
(design requirements with no plan step)

## Scope Creep
(plan steps not justified by design)

## Contradictions
(plan steps that conflict with design)

## Summary
- Design Requirements: N
- Covered: N
- Missing: N
- Coverage: N%
```

**Verdict rules:**
- Any uncovered requirement → `DRIFT_DETECTED`
- Any unjustified scope creep → `DRIFT_DETECTED`
- Any contradiction → `DRIFT_DETECTED`
- Otherwise → `ALIGNED`

**Allowed tools:** File read

---

### 4.7 Build Agent

**Purpose:** Execute plan steps exactly as specified. No improvisation.

**Inputs:**
- `plan.md` (one step at a time — context isolation)

**Process:**
For each step:
1. Read ONLY the files referenced in that step (fresh context)
2. Verify BEFORE code matches current file content
3. Apply AFTER code exactly
4. Run step test if provided
5. Log result

**Output artifact:** `build-report.md`

```
# Build: {title}

## Verdict: [SUCCESS | PARTIAL | FAILED]

## Results

| Step | File | Status | Notes |
|------|------|--------|-------|
| 1 | src/path/file.ts | DONE | - |
| 2 | src/path/new.ts | BLOCKED | BEFORE mismatch |

## Verification
- Build: [PASS|FAIL]
- Types: [PASS|FAIL]

## Files Changed
(list of all modified/created files)
```

**Error handling:**
- BEFORE code doesn't match → log `BLOCKED`, stop step
- File missing → log `BLOCKED`, stop step
- Test fails → retry with error context (max 2 retries per step)
- Step succeeds → proceed to next step

**Critical rules:**
- NEVER improvise beyond what the plan specifies
- NEVER refactor untouched code
- NEVER add comments not in the plan
- If blocked, STOP and report — don't guess

**Allowed tools:** File read, file write, file edit, command execution

---

### 4.8 Denoiser Agent (QA Phase 7)

**Purpose:** Remove debug artifacts from changed files.

**Inputs:**
- `build-report.md` (list of changed files)

**Targets for removal:**
- `console.log()`, `console.debug()`, `console.trace()`, `console.dir()`
- `debugger` statements
- Commented-out code blocks
- `// TODO: remove`, `// DEBUG`, `// TEMP` markers
- Hardcoded test values
- Unused imports

**Preserve:**
- `console.error()` with component prefix (legitimate error logging)
- Explanatory comments
- License headers

**Output:** Append to `qa-report.md`

**Allowed tools:** File search, file read, file edit

---

### 4.9 Quality Fit Agent (QA Phase 8)

**Purpose:** Verify code meets project conventions and type safety standards.

**Inputs:**
- `build-report.md` (list of changed files)
- Project rules/conventions (from configuration)

**Checks:**
1. **Type safety** — No untyped `any`, proper interfaces, explicit return types
2. **Lint compliance** — Linter passes without errors
3. **Project conventions** — Import patterns, naming conventions, framework-specific patterns

**Process:**
1. Run type checker on changed files
2. Run linter on changed files
3. Grep for convention violations
4. Auto-fix what's possible

**Output:** Append to `qa-report.md`

**Allowed tools:** File search, file read, file edit, command execution

---

### 4.10 Quality Behavior Agent (QA Phase 9)

**Purpose:** Verify the code actually works as specified.

**Inputs:**
- `build-report.md` (list of changed files)
- `design.md` (expected behavior)
- `critique.md` (edge cases to verify)

**Checks:**
1. Production build succeeds
2. Existing tests pass
3. New tests pass (if any)
4. Behavior matches design spec
5. Edge cases from critique are handled

**Output:** Append to `qa-report.md`

**Allowed tools:** File read, command execution

---

### 4.11 Quality Docs Agent (QA Phase 10)

**Purpose:** Verify documentation coverage for changed code.

**Inputs:**
- `build-report.md` (list of changed files)

**Checks:**
1. API routes have documentation comments (e.g., Swagger/OpenAPI)
2. Exported public functions have doc comments
3. Complex types have descriptions

**Priority order:** API docs (required) > public function docs (recommended) > type docs (nice-to-have)

**Output:** Append to `qa-report.md`

**Allowed tools:** File search, file read

---

### 4.12 Security Agent

**Purpose:** Scan changed files for security vulnerabilities.

**Inputs:**
- `build-report.md` (list of changed files)

**Scan patterns:**
1. **Injection** — String interpolation in queries (SQL, NoSQL, OS commands)
2. **XSS** — Unsanitized HTML rendering
3. **Auth gaps** — API routes without authentication middleware
4. **Secrets** — Hardcoded passwords, API keys, tokens
5. **Access control** — Queries without user/tenant scoping

**Output artifact:** `security-report.md` (also appended to `qa-report.md`)

```
# Security: {title}

## Verdict: [PASS | FAIL | CRITICAL]

## Findings

| Type | File:Line | Pattern | Severity | Fix |
|------|-----------|---------|----------|-----|
(1-line fix per finding)

## Summary
- Injection: [CLEAR|FOUND]
- Auth: [N/M routes protected]
- Secrets: [CLEAR|FOUND]
```

**Verdict rules:**
- SQL injection, command injection, or hardcoded secrets → `CRITICAL`
- XSS, auth bypass, IDOR → `FAIL`
- All clear → `PASS`

**CRITICAL findings always pause the pipeline, even in `yolo` profile.**

**Allowed tools:** File search, file read

---

## 5. Artifact Flow

Each phase produces an artifact that downstream phases consume. This is the dependency graph:

```
Phase 0 (pre-check.md)
  └──▶ Phase 1 (brief.md)
         └──▶ Phase 2 (design.md)
                ├──▶ Phase 3 (critique.md)
                │      └──▶ Phase 2 (revision loop, max 1)
                └──▶ Phase 4 (plan.md)
                       ├──▶ Phase 5 (drift-report.md)
                       │      └──▶ Phase 4 (revision loop, max 1)
                       └──▶ Phase 6 (build-report.md)
                              ├──▶ Phase 7 (qa-report.md)
                              ├──▶ Phase 8 (qa-report.md)
                              ├──▶ Phase 9 (qa-report.md)
                              ├──▶ Phase 10 (qa-report.md)
                              └──▶ Phase 11 (qa-report.md)
```

**Key rules:**
- Phases 7-10 can run in parallel (they all read from build-report.md independently)
- Phase 11 runs after 7-10 (it scans the final state of files after QA fixes)
- Each agent gets only the specific sections it needs from upstream artifacts, not the full document
- Artifacts are stored in a session directory unique to each pipeline run

---

## 6. Caching

Caching reduces token usage and computation across pipeline runs.

### 6.1 What to Cache

| Cache Type       | Key                        | Invalidation             | Token Savings |
|------------------|----------------------------|--------------------------|---------------|
| Security scans   | Hash of lockfile           | When lockfile changes    | ~3000/run     |
| Design patterns  | Pattern name               | Manual update            | ~1500/run     |
| QA rules         | Framework name             | Manual update            | ~1000/run     |

### 6.2 Security Scan Cache

- **Key:** SHA-256 hash of the project's lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, etc.)
- **Behavior:** If lockfile hasn't changed, reuse previous scan results and only scan newly changed files
- **Invalidation:** Automatic when lockfile hash changes

### 6.3 Design Pattern Cache

Pre-built architectural patterns that can be loaded when the task matches:

- REST API endpoint pattern
- Authentication flow pattern
- CRUD with soft-delete pattern
- (extensible — projects can add their own)

When a task matches a cached pattern, it's included in the Design Agent's context, reducing the tokens needed for research.

### 6.4 QA Rules Cache

Pre-computed lint rules, type checking patterns, and convention checks per framework (e.g., Next.js, React, Express, Django, Rails). Loaded once per session and reused across QA phases.

---

## 7. Context Isolation

To prevent token bloat and context pollution:

1. **Per-phase isolation** — Each agent receives only its specified inputs, not the full conversation history
2. **Per-step isolation (Build)** — The build agent reads only the files relevant to the current step
3. **Summary passing** — Downstream agents receive summaries of upstream artifacts, not full documents
4. **Changed-files-only (QA)** — QA agents scan only files modified during the build phase

---

## 8. Pipeline Execution Loop

Pseudocode for the orchestrator:

```
function run_pipeline(task, profile):
    session = create_session_directory()
    context = { task: task }

    for phase in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]:

        # 1. Check skip list
        if phase in profile.skip and phase != 0:
            log("Skipping phase {phase}")
            continue

        # 2. Check cache
        cached = check_cache(phase, context)
        if cached:
            load_cached_artifact(phase, cached)
            continue

        # 3. Run agent with appropriate model
        agent = get_agent(phase)
        model = get_model_tier(phase)  # strong for 2,3; fast for all others
        inputs = gather_inputs(phase, context)
        artifact = agent.run(inputs, model=model, budget=token_budget[phase])

        # 4. Save artifact
        save_artifact(session, phase, artifact)

        # 5. Validate
        results = run_validators(phase, artifact)
        hard_fails = count(results, severity=HARD)
        soft_fails = count(results, severity=SOFT)

        # 6. Gate decision
        decision = decide(hard_fails, soft_fails, profile)

        if decision == AUTO:
            continue
        elif decision == WARN:
            log_warning(phase, results)
            continue
        elif decision == PAUSE:
            # Try auto-recovery first
            if can_retry(phase) and retries_left(phase) > 0:
                feed_errors_back(phase, results)
                retry phase
            else:
                pause_for_human(phase, results)
                # Human responds: continue | revise | override
                handle_human_response(response)

    # 7. Final report
    output_summary(session, all_results)
```

---

## 9. Final Report Format

When the pipeline completes, output a summary:

```
Pipeline Complete [{profile}]

Task: {task description}
Session: {session id}

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

---

## 10. Flag Vocabulary

Agents communicate status through structured flags in their output. These are the reserved flags the pipeline recognizes:

| Flag              | Meaning                                    | Produced By | Consumed By |
|-------------------|--------------------------------------------|-------------|-------------|
| `NEEDS_INPUT`     | Requirements are ambiguous, need human Q&A | Phase 1     | Gate        |
| `NEEDS_RESEARCH`  | Cannot find documentation for a decision   | Phase 2     | Gate        |
| `NEEDS_DETAIL`    | Plan step lacks sufficient specificity     | Phase 4     | Gate        |
| `APPROVED`        | Design passes adversarial review           | Phase 3     | Gate        |
| `REVISE_DESIGN`   | Design has critical issues                 | Phase 3     | Gate + Loop |
| `ALIGNED`         | Plan covers all design requirements        | Phase 5     | Gate        |
| `DRIFT_DETECTED`  | Plan misses design requirements            | Phase 5     | Gate + Loop |
| `BLOCKED`         | Build step cannot proceed                  | Phase 6     | Gate        |
| `SUCCESS`         | Build completed all steps                  | Phase 6     | Gate        |
| `PARTIAL`         | Build completed some steps                 | Phase 6     | Gate        |
| `FAILED`          | Build could not complete                   | Phase 6     | Gate        |
| `CRITICAL`        | Security vulnerability found               | Phase 11    | Gate (always PAUSE) |
| `EXTEND_EXISTING` | Task should extend existing code           | Phase 0     | Phase 2     |
| `USE_LIBRARY`     | Task should use an installed library       | Phase 0     | Phase 4     |
| `BUILD_NEW`       | Task requires new implementation           | Phase 0     | (default)   |

---

## 11. Model Routing

Not all phases require the same model capability. Use cheaper/faster models for mechanical tasks and reserve expensive models for phases that require deep reasoning.

### 11.1 Model Tiers

| Tier     | Description                          | Examples                                      |
|----------|--------------------------------------|-----------------------------------------------|
| `strong` | Best reasoning, architecture, critique | Claude Opus/Sonnet, GPT-4o, Gemini Pro       |
| `fast`   | Quick, cheap, good at following instructions | Claude Haiku, GPT-4o-mini, Gemini Flash |

### 11.2 Phase Assignments

| Phase | Tier     | Reasoning                                              |
|-------|----------|--------------------------------------------------------|
| 0     | `fast`   | Codebase search + pattern matching. Mechanical.        |
| 1     | `fast`   | Requirements extraction. Structured output.            |
| 2     | `strong` | Architecture decisions require deep reasoning + trade-off analysis. |
| 3     | `strong` | Adversarial critique requires finding non-obvious flaws. |
| 4     | `fast`   | Translating design into steps. Design already did the thinking. |
| 5     | `fast`   | Mechanical comparison: requirement → plan step mapping. |
| 6     | `fast`   | Applying BEFORE/AFTER diffs. Following instructions exactly. |
| 7     | `fast`   | Pattern matching: find console.logs, debugger statements. |
| 8     | `fast`   | Running type checker + linter commands. Checking output. |
| 9     | `fast`   | Running build + test commands. Checking output.        |
| 10    | `fast`   | Checking for doc comment presence. Mechanical.         |
| 11    | `fast`   | Pattern-based security scanning. Grep-style checks.   |

**Result: 10 fast phases, 2 strong phases.**

### 11.3 Why This Works

The pipeline's validation gates are the safety net, not model intelligence. If a fast model produces a bad plan, drift detection (Phase 5) catches it. If a fast model misses a security pattern, the grep-based validators catch it. Strong models are only needed where output **cannot be objectively validated** — creative architecture and critical analysis.

### 11.4 Cost Estimates

| Configuration | Strong Phases | Fast Phases | Est. Cost/Run |
|---------------|--------------|-------------|---------------|
| All strong    | 12           | 0           | ~$0.80-1.20   |
| Optimized     | 2            | 10          | ~$0.20-0.35   |
| Yolo + optimized | 2         | 4 (6 skipped) | ~$0.10-0.18 |

**~70% cost reduction** with model routing compared to using the strongest model for all phases.

### 11.5 Tool-Specific Model Mapping

| Tier     | Claude Code      | Cursor           | Copilot          | Aider                    |
|----------|------------------|------------------|------------------|--------------------------|
| `strong` | `sonnet` / `opus`| `inherit` (default) | `gpt-4o`      | `claude-sonnet-4-20250514` |
| `fast`   | `haiku`          | `fast`           | `gpt-4o-mini`    | `gpt-4o-mini`            |

Tools without per-agent model selection (Cline, Windsurf) can use the model routing table as guidance for which phases to run in Plan mode (strong) vs Act mode (fast).

---

## 12. Token Budgets

Recommended token limits per phase to prevent runaway costs:

| Phase   | Model  | Budget      | Strategy                                  |
|---------|--------|-------------|-------------------------------------------|
| 0       | fast   | 3,000       | Task + search results only                |
| 1       | fast   | 4,000       | Task + relevant file snippets             |
| 2       | strong | 6,000       | Brief summary + cached patterns           |
| 3       | strong | 4,000       | Design decisions list only                |
| 4       | fast   | 5,000       | Decisions + file paths + BEFORE code      |
| 5       | fast   | 3,000       | Requirements list + step titles only      |
| 6       | fast   | 2,000/step  | One step at a time (context isolation)    |
| 7-11    | fast   | 3,000 each  | Changed files only                        |

**Total estimated cost:**
- Full pipeline (standard, all strong): ~35-45k tokens, ~$0.80-1.20
- Full pipeline (standard, model routing): ~35-45k tokens, ~$0.20-0.35
- Yolo pipeline (model routing): ~15-20k tokens, ~$0.10-0.18
- With caching: 15-25% additional reduction on repeat runs

---

## 13. Implementing This Spec

This specification is tool-agnostic. To implement it for a specific AI coding tool:

1. **Map agent roles to the tool's agent/prompt system** — Each agent role becomes a system prompt, rules file, or agent definition in your tool's format.

2. **Map validation to the tool's capabilities** — Validators can be implemented as shell scripts, inline checks, or prompt instructions depending on tool support.

3. **Map the orchestrator to the tool's workflow system** — The execution loop can be a slash command, a master prompt, a script, or a built-in workflow depending on the tool.

4. **Map caching to the tool's storage** — Cache artifacts as files in a project directory, a database, or whatever the tool supports.

5. **Map gates to the tool's interaction model** — PAUSE becomes "ask the user", WARN becomes a logged message, AUTO is silent.

### Implementation Checklist

- [ ] Agent prompts for all 12 roles
- [ ] Orchestrator that runs phases in sequence
- [ ] Validator checks for each phase
- [ ] Gate logic with profile support
- [ ] Model routing (strong for phases 2,3; fast for all others)
- [ ] Artifact storage (session directories)
- [ ] Cache system (optional but recommended)
- [ ] Auto-recovery loops (Phase 3 ↔ 2, Phase 5 ↔ 4)
- [ ] Final report generation
- [ ] Parallel execution for phases 7-10 (optional optimization)
