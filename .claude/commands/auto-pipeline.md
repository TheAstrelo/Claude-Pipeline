# Automated Pipeline

Run: `/auto-pipeline [--profile=yolo|standard|paranoid] [--gate=soft|mixed|hard] <task>`

$ARGUMENTS

---

## Config

```bash
PROFILE="${PROFILE:-standard}"
GATE_MODE="${GATE_MODE:-mixed}"
SESSION=".claude/artifacts/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SESSION"
```

Load settings from `lib/config.md` and `lib/validator.md`.

---

## Execution Loop

For each phase 0-11:

```
1. Check skip list → Skip if in profile.skip (except Phase 0)
2. Check cache → Use cached artifact if valid
3. Run phase → Execute with token budget
4. Validate output → Run validators from lib/validator.md
5. Decide:
   - All pass → AUTO (proceed)
   - SOFT fail only → WARN (proceed with log) or PAUSE (if paranoid)
   - HARD fail → PAUSE (human review required)
```

---

## Phase 0: Pre-Check (NEVER SKIP, HARD gate)

Agent: `pre-check` | Budget: 3000 tokens
Output: `pre-check.md`

**Validators:**
```
✓ codebase_searched    → grep "Codebase Matches" pre-check.md
✓ has_recommendation   → grep -E "EXTEND|USE_LIBRARY|BUILD_NEW"
✓ reasoning_present    → grep "Reasoning:"
```

**On EXTEND_EXISTING:** Load found file into Phase 2 context
**On USE_LIBRARY:** Add install to Phase 4 steps
**On BUILD_NEW:** Proceed normally

---

## Phase 1: Requirements (SOFT gate)

Agent: `requirements-slim` | Budget: 4000 tokens
Input: Task + pre-check context
Output: `brief.md`

**Validators:**
```
✓ has_problem       → grep "## Problem"
✓ has_criteria      → grep "## Success Criteria"
✓ no_ambiguity      → ! grep "NEEDS_INPUT" (HARD)
```

---

## Phase 2: Design (SOFT gate)

Agent: `architect-slim` | Budget: 6000 tokens
Input: `brief.md` summary
Output: `design.md`

**Validators:**
```
✓ has_decisions     → grep "## Decisions"
✓ has_sources       → grep -c "Source:" ≥ 1
✓ no_research_gap   → ! grep "NEEDS_RESEARCH" (HARD)
✓ paths_exist       → verify src/ paths with glob
```

---

## Phase 3: Adversarial (HARD gate)

Agent: `adversarial-slim` | Budget: 4000 tokens
Input: Design decisions list
Output: `critique.md`

**Validators:**
```
✓ has_verdict       → grep -E "APPROVED|REVISE"
✓ no_high_severity  → ! grep "| HIGH |" (HARD)
✓ few_medium        → grep -c "MEDIUM" < 3
✓ no_consensus      → ! grep -A5 "## Consensus" | grep "^[0-9]" (HARD)
```

**On REVISE_DESIGN:** Auto-retry with fixes (max 1), then pause if still failing

---

## Phase 4: Planning (SOFT gate)

Agent: `planner-slim` | Budget: 5000 tokens
Input: Design decisions + file paths
Output: `plan.md`

**Validators:**
```
✓ has_steps         → grep -c "### Step" ≥ 1 (HARD)
✓ has_before_after  → steps count = "**Before:**" count
✓ max_8_steps       → grep -c "### Step" ≤ 8
✓ paths_verified    → MODIFY files exist (HARD)
✓ no_detail_flag    → ! grep "NEEDS_DETAIL" (HARD)
```

---

## Phase 5: Drift (SOFT gate)

Agent: `drift-detector` | Budget: 3000 tokens
Input: Requirements list + step titles
Output: `drift-report.md`

**Validators:**
```
✓ has_verdict       → grep -E "ALIGNED|DRIFT" (HARD)
✓ coverage_ok       → coverage % ≥ 90
✓ no_drift          → ! grep "DRIFT_DETECTED"
```

**On DRIFT_DETECTED:** Auto-add missing steps (max 1 retry)

---

## Phase 6: Build (NONE gate, but HARD on blocked)

Agent: `builder-slim` | Budget: 2000 tokens/step
Input: One step at a time
Output: `build-report.md`

**Validators:**
```
✓ no_blocked        → ! grep "BLOCKED" (HARD)
✓ build_passes      → grep "Build:.*PASS"
✓ types_pass        → grep "Types:.*PASS"
```

**On step failure:** Auto-retry fix (max 2 per step)
**On BLOCKED:** Pause — plan needs update

---

## Phases 7-11: QA (NONE gate, auto-fix)

Run in parallel. Budget: 3000 tokens each.

| Phase | Agent | Validators |
|-------|-------|------------|
| 7 | denoiser | Auto-fix, no validation |
| 8 | quality-fit | Auto-fix lint/type errors |
| 9 | quality-behavior | Log test results |
| 10 | quality-docs | Log warnings |
| 11 | security-slim | HARD: no CRITICAL, no SQLi |

**Output:** Combined `qa-report.md`

---

## Phase 11: Security (HARD gate)

**Validators:**
```
✓ scan_complete     → grep "## Findings" (HARD)
✓ no_critical       → ! grep "CRITICAL" (HARD)
✓ no_sqli           → ! grep "SQLi" (HARD)
✓ auth_coverage     → ! grep "No middleware" (HARD)
✓ no_secrets        → ! grep "Hardcoded" (HARD)
```

**On CRITICAL:** Always pause, no override in yolo mode

---

## Final Output

```
Pipeline Complete [PROFILE: standard]

Task: {task}
Session: {session}
Tokens used: {count}

Phases:
0. Pre-Check     [AUTO]  → BUILD_NEW
1. Requirements  [AUTO]  validators: 3/3 ✓
2. Design        [WARN]  validators: 3/4 ✓ (paths_exist: 1 missing)
3. Adversarial   [AUTO]  validators: 4/4 ✓
4. Planning      [AUTO]  validators: 5/5 ✓
5. Drift         [AUTO]  validators: 3/3 ✓
6. Build         [AUTO]  validators: 3/3 ✓
7-10. QA         [AUTO]  auto-fixed: 2 issues
11. Security     [AUTO]  validators: 5/5 ✓

Validation: 29/30 passed (1 SOFT fail)
Files changed: {list}
Warnings: {any}
```

---

## Validation Summary

| Profile | HARD fail | SOFT fail | Result |
|---------|-----------|-----------|--------|
| yolo | PAUSE | AUTO | Only critical issues stop |
| standard | PAUSE | WARN | Log warnings, pause on critical |
| paranoid | PAUSE | PAUSE | Any issue stops |

---

## Profiles

| Profile | Skips | Gate Mode | Use Case |
|---------|-------|-----------|----------|
| yolo | 3,5,7-10 | soft | Prototypes |
| standard | none | mixed | Normal dev |
| paranoid | none | hard | Production |
