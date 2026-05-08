# Pipeline Validator

Validation logic for pipeline gates and checks.

## Gate Types

### HARD Gate
- Must pass to continue
- Failure pauses pipeline
- Requires user intervention (unless `--auto`)

### SOFT Gate
- Logs warning and continues
- Records issues for summary
- No user intervention required

### NONE Gate
- Activated with `--auto` flag
- No gates whatsoever
- Logs everything, stops for nothing
- Output: "⚠ AUTO MODE: X issues logged"

## Gate Configuration by Profile

| Profile | HARD Gates | SOFT Gates | NONE Gates |
|---------|------------|------------|------------|
| yolo | Security only | All others | - |
| standard | 0, 3, 11 | 1, 2, 4, 5 | 6-10 |
| paranoid | All | None | None |

## Validation Phases

### Phase 0: Pre-Check (HARD)
- `codebase_searched` - Found existing implementations
- `has_recommendation` - EXTEND/USE_LIBRARY/BUILD_NEW verdict
- `reasoning_present` - Rationale provided (SOFT)

### Phase 1: Requirements (SOFT)
- `has_problem` - Problem statement present
- `has_criteria` - Success criteria defined
- `no_ambiguity` - Not NEEDS_INPUT (HARD)

### Phase 2: Design (SOFT)
- `has_decisions` - Design decisions documented
- `has_sources` - Citations for decisions
- `no_research_gap` - Not NEEDS_RESEARCH (HARD)

### Phase 3: Adversarial (HARD)
- `has_verdict` - APPROVED or REVISE_DESIGN
- `no_high_severity` - No HIGH issues (HARD)
- `few_medium` - Less than 3 MEDIUM issues

### Phase 4: Planning (SOFT)
- `has_steps` - At least 1 step (HARD)
- `max_8_steps` - Not too many steps
- `no_detail_flag` - Not NEEDS_DETAIL (HARD)

### Phase 5: Drift (SOFT)
- `has_verdict` - ALIGNED or DRIFT_DETECTED (HARD)
- `no_drift` - Not DRIFT_DETECTED

### Phase 6: Build (NONE, HARD on blocked)
- `no_blocked` - No BLOCKED steps (HARD)
- `build_passes` - Build succeeded
- `types_pass` - Type check passed

### Phase 11: Security (HARD, NEVER SKIP)
- `scan_complete` - Findings section present (HARD)
- `no_critical` - No CRITICAL findings (HARD)
- `no_sqli` - No SQL injection (HARD)
- `auth_coverage` - Auth middleware present (HARD)
- `no_secrets` - No hardcoded secrets (HARD)

## Auto Mode Behavior

When `--auto` or `--yolo` flag is set:
1. All gates become SOFT
2. Issues are logged but don't pause
3. Summary shows: "⚠ AUTO MODE: X issues logged"
4. Exception: CRITICAL security issues always pause

## Fix Mode Behavior

When `--fix` flag is set:
1. On adversarial REVISE: auto-retry (max 3)
2. On test failure: attempt fix (max 3)
3. On QA issues: apply suggestions
4. Continue if resolved

## Issue Logging

All issues logged to session artifacts:
```json
{
  "issues": [
    {
      "phase": 11,
      "type": "security",
      "severity": "HIGH",
      "message": "Potential SQL injection",
      "file": "src/api/users.ts",
      "line": 42,
      "suggestion": "Use parameterized query"
    }
  ]
}
```

## Summary Report

Pipeline completion report:
```
Phases completed: 10/12
Issues found: 3
  - HIGH: 1 (security)
  - MEDIUM: 2 (qa)

Skipped phases: 7, 8 (--fast profile)
AUTO MODE: 3 issues logged (not blocking)
```
