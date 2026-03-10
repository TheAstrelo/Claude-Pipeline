# Pipeline Estimate Command

Preview estimated cost before running the pipeline.

## Arguments

- `$ARGUMENTS` - Task description and profile flags

## Instructions

### 1. Parse Arguments

Extract from `$ARGUMENTS`:
- Task description
- Profile flag (`--profile=X` or `--yolo`, `--fast`, etc.)
- Template flag (`--template=X`)
- Skip flags that affect phases

### 2. Determine Phases to Run

Based on profile, calculate which phases will execute:

**yolo profile:**
- Phases: 0, 1, 2, 4, 6, 11
- Skip: 3, 5, 7, 8, 9, 10

**fast profile:**
- Phases: 0, 1, 2, 3, 4, 5, 6, 11
- Skip: 7, 8, 9, 10

**standard profile:**
- Phases: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
- Skip: none

**paranoid profile:**
- Phases: all + extra checks
- Skip: none

If `--template` flag: subtract Phase 1

### 3. Calculate Token Estimates

Base estimates per phase (adjust based on task complexity):

| Phase | Model | Base Tokens | Cost/1K |
|-------|-------|-------------|---------|
| 0 | Haiku | 500 | $0.001 |
| 1 | Sonnet | 2000 | $0.015 |
| 2 | Opus | 5000 | $0.075 |
| 3 | Opus | 3000 | $0.075 |
| 4 | Sonnet | 2000 | $0.015 |
| 5 | Haiku | 500 | $0.001 |
| 6 | Sonnet | 8000 | $0.015 |
| 7-10 | Mixed | 4000 | $0.020 |
| 11 | Opus | 3000 | $0.075 |

### 4. Check Cache

Look for similar recent tasks in history:
- If found, use actual costs as reference
- Adjust estimate based on cache hit likelihood

### 5. Calculate Range

Provide min/max range:
- Min: all cache hits, minimal iterations
- Max: no cache, max retries (3x adversarial, etc.)

### 6. Output Estimate

```
Pipeline Cost Estimate
═══════════════════════

Task: {task description}
Profile: {profile}
Phases: {phase list}

Estimated Cost:
  ├─ Minimum: $0.15 (best case)
  ├─ Expected: $0.22 (typical)
  └─ Maximum: $0.45 (worst case)

Estimated Tokens:
  ├─ Input: ~12,000
  └─ Output: ~8,000

Estimated Duration: 2-4 minutes

Cost Breakdown by Phase:
  Phase 0 (Pre-check):    $0.01
  Phase 1 (Requirements): $0.03
  Phase 2 (Architecture): $0.08
  Phase 4 (Planning):     $0.03
  Phase 6 (Build):        $0.12
  Phase 11 (Security):    $0.05

Similar past tasks:
  • "add auth flow" - $0.24 (3m 12s)
  • "create login page" - $0.18 (2m 45s)

Proceed with pipeline? [y/n]
```

### 7. Handle Response

If user confirms:
- Pass task to `/auto-pipeline` command

If user declines:
- Exit without running

## Notes

- Estimates are approximate and may vary
- Complex tasks requiring multiple iterations will cost more
- First-time tasks without cache will be at higher end of range
