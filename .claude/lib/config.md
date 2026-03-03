# Pipeline Configuration

## Profiles

```yaml
profiles:
  yolo:
    description: "Fast prototyping, minimal checks"
    skip: [3, 5, 7, 8, 9, 10]  # Keep: pre-check, requirements, design, plan, build, security
    gate_mode: soft  # Only HARD fails pause
    max_retries: 1

  standard:
    description: "Balanced automation with safety"
    skip: []
    gate_mode: mixed  # HARD phases pause, others warn
    max_retries: 2

  paranoid:
    description: "Full human oversight"
    skip: []
    gate_mode: hard  # Any fail pauses
    max_retries: 3
```

## Output-Based Validation

**Self-reported confidence is unreliable.** We validate outputs objectively.

See `lib/validator.md` for full validator definitions.

### Gate Types

| Type | Behavior | Phases |
|------|----------|--------|
| HARD | Any fail → pause for human | 0 (pre-check), 3 (adversarial), 11 (security) |
| SOFT | Fail → warn and proceed | 1, 2, 4, 5 |
| NONE | Always proceed, auto-fix | 6, 7, 8, 9, 10 |

### Decision Matrix

| HARD Fails | SOFT Fails | Profile: yolo | Profile: standard | Profile: paranoid |
|------------|------------|---------------|-------------------|-------------------|
| 0 | 0 | AUTO | AUTO | AUTO |
| 0 | 1+ | AUTO | WARN | PAUSE |
| 1+ | any | PAUSE | PAUSE | PAUSE |

### Validation Summary

| Phase | Critical Validators (HARD) |
|-------|---------------------------|
| 0 | Has recommendation, searched codebase |
| 1 | No NEEDS_INPUT flag |
| 2 | No NEEDS_RESEARCH flag, paths exist |
| 3 | No HIGH severity, no consensus issues |
| 4 | No NEEDS_DETAIL flag, paths verified |
| 5 | Coverage ≥ 90% |
| 6 | No BLOCKED steps |
| 11 | No CRITICAL, no SQLi, auth coverage |

## Token Budget

| Phase | Max Tokens | Strategy |
|-------|------------|----------|
| 0 | 3000 | Task + grep/glob results |
| 1 | 4000 | Task + file snippets |
| 2 | 6000 | Brief summary + patterns |
| 3 | 4000 | Design decisions only |
| 4 | 5000 | Decisions + file paths |
| 5 | 3000 | Requirements + step list |
| 6 | 2000/step | One step at a time |
| 7-11 | 3000 | Changed files only |

## Model Allocation

Strategic model selection by phase complexity:

| Phase | Agent | Model | Rationale |
|-------|-------|-------|-----------|
| 0 | pre-check | haiku | Search + grep operations, simple recommendation |
| 1 | requirements-slim | sonnet | Needs reasoning but structured output |
| 2 | architect-slim | **opus** | Architectural decisions, trade-off analysis |
| 3 | adversarial-slim | **opus** | Multi-perspective critique, finding subtle flaws |
| 4 | planner-slim | sonnet | BEFORE/AFTER code generation |
| 5 | drift-detector | haiku | Document comparison, deterministic |
| 6 | builder-slim | sonnet | Step execution, follows plan exactly |
| 7 | denoiser | haiku | Pattern matching (find/remove) |
| 8 | quality-fit | haiku | Lint/type checks, convention matching |
| 9 | quality-behavior | sonnet | Test analysis, behavior verification |
| 10 | quality-docs | haiku | JSDoc presence checks |
| 11 | security-slim | **opus** | Detecting subtle vulnerabilities |

### Model Cost Comparison

```
Haiku:  $0.25 / 1M tokens  (60x cheaper than Opus)
Sonnet: $3.00 / 1M tokens  (5x cheaper than Opus)
Opus:   $15.00 / 1M tokens (most capable)
```

### Estimated Cost Per Run

```
All Sonnet:          ~$0.23/run
Optimized allocation: ~$0.20/run (with higher quality on critical phases)

Breakdown:
  Haiku phases:  ~8k tokens  = $0.002
  Sonnet phases: ~15k tokens = $0.045
  Opus phases:   ~10k tokens = $0.15
```

### When to Override

Use `model: opus` override for:
- Security-sensitive features (payments, auth)
- Complex architectural decisions
- High-stakes production code

Use `model: haiku` override for:
- Simple search/validation tasks
- High-volume batch operations
- Cost-sensitive prototyping

## Usage

```bash
# Fast prototyping (only HARD fails pause)
/auto-pipeline --profile=yolo "add login button"

# Balanced (HARD pauses, SOFT warns)
/auto-pipeline --profile=standard "refactor auth"

# Full oversight (any fail pauses)
/auto-pipeline --profile=paranoid "payment integration"

# Override gate mode
/auto-pipeline --gate=hard "critical feature"
```
