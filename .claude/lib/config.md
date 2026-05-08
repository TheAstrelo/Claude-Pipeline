# Pipeline Configuration

Configuration reference for the auto-pipeline system.

## Framework Principles

The pipeline is structured around two frameworks from Anthropic's AI courses:

- **The 4 Ds** (human competencies): Delegation, Description, Discernment, Diligence
- **The 4 Core Properties** (machine behaviors): Next Token Prediction, Knowledge, Working Memory, Steerability

See `lib/framework.md` for the full mapping of principles to pipeline mechanics.

### Prompt Structure (all phases)

Every phase prompt follows the order: **CONSTRAINTS → CONTEXT → TASK → FORMAT → VERIFY**

This exploits Next Token Prediction (constraints first, verify last) and Steerability (instructions before data). Per Anthropic prompting docs, "queries at the end can improve response quality by up to 30%."

### Context Budget Strategy (Working Memory)

Each phase receives compressed shell extractions instead of full artifact dumps. Patterns use case-insensitive matching with cat fallback:

| Phase | Source | Extraction | Rationale |
|-------|--------|-----------|-----------|
| 1 | pre-check.md | `grep -iA2 Recommendation` + `grep -iA20 Codebase` | Recommendation + match table only |
| 2 | brief.md | Full brief (already concise) | Architect needs complete requirements |
| 3 | design.md | `sed -n '/[Dd]ecisions/,/[Rr]isks/p'` | Decisions + components only |
| 4 | design.md | Same as Phase 3 | Planner needs design decisions |
| 5 | brief.md + plan.md | Success Criteria section + step list | Compare requirements to plan |
| 6 | plan.md | Full plan (exception — needs paste-ready code) | Builder must apply BEFORE/AFTER exactly |
| 7-10 | build-report.md | `grep -A20 "Files Changed"` + verdict | QA acts on changed files only |
| 11 | build-report.md | Files Changed list only | Security scans changed code |

### Delegation Triage (Phase 0)

Phase 0 outputs an advisory Task Triage section: Complexity (LOW/MEDIUM/HIGH), Risk (LOW/MEDIUM/HIGH), Recommended Profile, Human Review (list of phase numbers or "None"). The orchestrator logs a warning if the recommended profile differs from `--profile`, but never auto-overrides — the human decides (Delegation principle).

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
