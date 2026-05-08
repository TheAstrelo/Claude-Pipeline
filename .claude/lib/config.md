# Pipeline Configuration

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
