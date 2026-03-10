# Pipeline Configuration

Configuration reference for the auto-pipeline system.

## Profiles

### yolo
Fastest profile for prototyping.
- **Skips:** 3 (Adversarial), 5 (Drift), 7-10 (All QA)
- **Gate Mode:** soft (warnings only)
- **Use Case:** Quick prototypes, low-risk changes

### fast
Balanced speed - skips QA but keeps safety checks.
- **Skips:** 7-10 (All QA)
- **Gate Mode:** standard
- **Use Case:** Feature development, moderate-risk changes

### standard
Full pipeline with all phases.
- **Skips:** none
- **Gate Mode:** mixed
- **Use Case:** Normal development, important features

### paranoid
Maximum safety for critical code.
- **Skips:** none
- **Gate Mode:** hard (all gates require approval)
- **Extra:** Additional security scrutiny
- **Use Case:** Payment processing, authentication, sensitive data

## Gate Modes

| Mode | Behavior |
|------|----------|
| hard | All gates require explicit pass. Any failure pauses. |
| mixed | Critical gates hard, non-critical soft. |
| soft | All gates are warnings only. Never pauses. |
| none | No gates (--auto mode). Logs everything, stops for nothing. |

## Configuration Options

### settings.json Structure

```json
{
  "pipeline": {
    "defaultProfile": "standard",
    "profiles": { ... },
    "defaults": {
      "autoDetect": true,
      "notifications": true,
      "dryRun": false
    },
    "testCommand": null,
    "costEstimates": {
      "haiku": 0.001,
      "sonnet": 0.015,
      "opus": 0.075
    }
  }
}
```

### Environment Variables

- `PIPELINE_PROFILE` - Override default profile
- `PIPELINE_GATE_MODE` - Override gate mode
- `PIPELINE_DRY_RUN` - Enable dry-run mode

## Flag Interactions

| Flag Combination | Behavior |
|------------------|----------|
| `--dry-run --fast` | Preview with fast profile |
| `--branch --pr` | Create branch and PR |
| `--template --estimate` | Estimate template-based task |
| `--fix --test` | Auto-fix test failures |

## Phase Skip Rules

Certain phases can never be skipped:
- Phase 0 (Pre-check): Always runs
- Phase 11 (Security): Always runs

Profile skips are additive with flag skips.

## Cost Estimation

Estimates based on:
1. Profile (affects phase count)
2. Phase models (Haiku/Sonnet/Opus)
3. Task complexity
4. Historical data
5. Cache hit probability

## Project Detection

Auto-detection checks:
- `package.json` for Node.js frameworks
- `tsconfig.json` for TypeScript
- `pyproject.toml` for Python
- `go.mod` for Go
- `Cargo.toml` for Rust

Stores config in session artifacts.
