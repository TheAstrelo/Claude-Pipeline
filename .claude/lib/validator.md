# Output-Based Validation

Self-reported confidence is unreliable. Validate outputs objectively.

## Validation Model

```
Phase completes → Output artifact
                      ↓
              Run validators (objective checks)
                      ↓
              Compute pass/fail ratio
                      ↓
         ┌────────────┴────────────┐
         │                         │
    All pass → AUTO           Any fail → Check severity
                                   │
                          ┌────────┴────────┐
                          │                 │
                    HARD fail → PAUSE    SOFT fail → WARN + proceed
```

## Gate Types

| Type | Behavior | Used For |
|------|----------|----------|
| HARD | Must pass or pause for human | Security, pre-check, adversarial |
| SOFT | Warn and proceed if fails | Design, planning, docs |
| NONE | Always proceed | QA auto-fix phases |

## Phase Validators

### Phase 0: Pre-Check (HARD)

```yaml
validators:
  - name: codebase_searched
    check: grep "Codebase Matches" pre-check.md
    fail: HARD

  - name: has_recommendation
    check: grep -E "EXTEND_EXISTING|USE_LIBRARY|BUILD_NEW" pre-check.md
    fail: HARD

  - name: reasoning_present
    check: grep "Reasoning:" pre-check.md
    fail: SOFT
```

### Phase 1: Requirements (SOFT)

```yaml
validators:
  - name: has_problem
    check: grep "## Problem" brief.md
    fail: SOFT

  - name: has_criteria
    check: grep "## Success Criteria" brief.md
    fail: SOFT

  - name: criteria_testable
    check: grep -c "^[0-9]" brief.md | [ $(cat) -ge 2 ]
    fail: SOFT

  - name: no_ambiguity_flag
    check: ! grep "NEEDS_INPUT" brief.md
    fail: HARD
```

### Phase 2: Design (SOFT)

```yaml
validators:
  - name: has_decisions
    check: grep "## Decisions" design.md
    fail: SOFT

  - name: decisions_have_sources
    check: grep -c "Source:" design.md | [ $(cat) -ge 1 ]
    fail: SOFT

  - name: components_defined
    check: grep "## Components" design.md
    fail: SOFT

  - name: no_research_flag
    check: ! grep "NEEDS_RESEARCH" design.md
    fail: HARD

  - name: paths_exist
    check: |
      for path in $(grep -oE "src/[a-zA-Z0-9/_.-]+" design.md); do
        [ -e "$path" ] || exit 1
      done
    fail: SOFT
```

### Phase 3: Adversarial (HARD)

```yaml
validators:
  - name: has_verdict
    check: grep -E "Verdict:.*(APPROVED|REVISE)" critique.md
    fail: HARD

  - name: no_high_severity
    check: ! grep -E "\| HIGH \|" critique.md
    fail: HARD

  - name: few_medium
    check: grep -c "MEDIUM" critique.md | [ $(cat) -lt 3 ]
    fail: SOFT

  - name: no_consensus_issues
    check: ! grep -A5 "## Consensus" critique.md | grep -E "^[0-9]"
    fail: HARD
```

### Phase 4: Planning (SOFT)

```yaml
validators:
  - name: has_steps
    check: grep -c "### Step" plan.md | [ $(cat) -ge 1 ]
    fail: HARD

  - name: steps_have_before_after
    check: |
      steps=$(grep -c "### Step" plan.md)
      befores=$(grep -c "**Before:**" plan.md)
      [ "$steps" -eq "$befores" ]
    fail: SOFT

  - name: max_8_steps
    check: grep -c "### Step" plan.md | [ $(cat) -le 8 ]
    fail: SOFT

  - name: paths_verified
    check: |
      for path in $(grep -E "^\*\*File:\*\*" plan.md | grep -oE "src/[^ ]+"); do
        action=$(grep -A1 "$path" plan.md | grep -oE "MODIFY|CREATE")
        [ "$action" = "CREATE" ] || [ -e "$path" ] || exit 1
      done
    fail: HARD

  - name: no_detail_flag
    check: ! grep "NEEDS_DETAIL" plan.md
    fail: HARD
```

### Phase 5: Drift (SOFT)

```yaml
validators:
  - name: has_verdict
    check: grep -E "Verdict:.*(ALIGNED|DRIFT)" drift-report.md
    fail: HARD

  - name: coverage_check
    check: |
      # Extract coverage percentage
      coverage=$(grep -oE "[0-9]+%" drift-report.md | head -1 | tr -d '%')
      [ "$coverage" -ge 90 ]
    fail: SOFT

  - name: no_drift
    check: ! grep "DRIFT_DETECTED" drift-report.md
    fail: SOFT
```

### Phase 6: Build (HARD on blocked, SOFT on partial)

```yaml
validators:
  - name: no_blocked_steps
    check: ! grep "BLOCKED" build-report.md
    fail: HARD

  - name: build_passes
    check: grep "Build:.*PASS" build-report.md
    fail: SOFT

  - name: types_pass
    check: grep "Types:.*PASS" build-report.md
    fail: SOFT

  - name: success_verdict
    check: grep "Verdict:.*SUCCESS" build-report.md
    fail: SOFT
```

### Phase 11: Security (HARD)

```yaml
validators:
  - name: scan_complete
    check: grep "## Findings" qa-report.md
    fail: HARD

  - name: no_critical
    check: ! grep -E "CRITICAL" qa-report.md
    fail: HARD

  - name: no_sqli
    check: ! grep -E "SQLi.*CRITICAL" qa-report.md
    fail: HARD

  - name: auth_coverage
    check: |
      # All API routes have auth
      ! grep "No middleware" qa-report.md
    fail: HARD

  - name: no_secrets
    check: ! grep -E "Hardcoded|secrets.*FOUND" qa-report.md
    fail: HARD
```

## Validation Runner

```bash
#!/bin/bash
# .claude/lib/validate.sh

PHASE=$1
ARTIFACT=$2
SESSION=$3

HARD_FAILS=0
SOFT_FAILS=0

run_check() {
  name=$1
  check=$2
  fail_type=$3

  if eval "$check" > /dev/null 2>&1; then
    echo "✓ $name"
  else
    echo "✗ $name"
    [ "$fail_type" = "HARD" ] && ((HARD_FAILS++))
    [ "$fail_type" = "SOFT" ] && ((SOFT_FAILS++))
  fi
}

# Load phase-specific validators and run
# ... (phase switch logic)

# Output result
if [ $HARD_FAILS -gt 0 ]; then
  echo "RESULT: PAUSE"
  exit 1
elif [ $SOFT_FAILS -gt 0 ]; then
  echo "RESULT: WARN"
  exit 0
else
  echo "RESULT: AUTO"
  exit 0
fi
```

## Decision Matrix

| HARD Fails | SOFT Fails | Result |
|------------|------------|--------|
| 0 | 0 | AUTO — proceed |
| 0 | 1+ | WARN — proceed with logged warnings |
| 1+ | any | PAUSE — human review required |

## Benefits Over Self-Reported Confidence

1. **Objective** — Grep patterns don't lie
2. **Auditable** — Clear pass/fail per check
3. **Ungameable** — Agent can't inflate scores
4. **Specific** — Failures point to exact problems
5. **Tunable** — Add/remove checks without changing agents
