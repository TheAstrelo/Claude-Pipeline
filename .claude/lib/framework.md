# Pipeline Framework: 4 Ds + 4 Core Properties

> Human reference only. Not included in subprocess prompts.

This document maps Anthropic's two AI frameworks to the pipeline's mechanics.

## The 4 Ds (Human Competencies)

| Principle | Definition | Pipeline Mapping | Phases |
|-----------|-----------|-----------------|--------|
| **Delegation** | Deciding whether, when, and how to engage AI | Phase 0 Task Triage assesses complexity/risk and recommends a profile. `--profile` and `--skip-*` flags let the human override. PAUSE gates return control to the human. | 0 (triage), all (gates) |
| **Description** | Crafting precise prompts that convey task intent without ambiguity | All prompts follow CONSTRAINTS→CONTEXT→TASK→FORMAT→VERIFY structure. brief.md serves as the requirements PRD. Output schemas constrain response shape. | All phases |
| **Discernment** | Evaluating AI outputs — testing, comparing, identifying reasoning breakdowns | Validators use objective grep checks (not self-reported confidence). Cross-phase validators check critique→build and requirements→build traceability. PAUSE gates force human review. | 3 (adversarial), 6 (traceability), 11 (security) |
| **Diligence** | Maintaining quality standards — documenting, tracking, auditing | Security phase never skips. Build-report includes traceability matrix. All artifacts persisted in session directory. qa-report creates audit trail. | 6 (traceability), 11 (security), all (artifacts) |

## The 4 Core Properties (Machine Behaviors)

| Property | Definition | Pipeline Mapping | Implementation |
|----------|-----------|-----------------|----------------|
| **Next Token Prediction** | Model generates tokens sequentially; early tokens influence later ones | CONSTRAINTS placed first in every prompt (model commits to limits before generating). VERIFY block at end anchors expected output patterns. Role assignments steer persona. | Prompt structure order |
| **Knowledge** | What the model knows from training; may be stale or incomplete | Phase 0 searches codebase + web. Phase 2 cites live docs for every decision. Cache patterns provide pre-verified knowledge. [UNCERTAIN] markers flag knowledge gaps. | Phases 0, 2 (research) |
| **Working Memory** | Context window is finite; more tokens can reduce accuracy | Subprocess isolation gives each phase fresh context. Shell extractions pass compressed artifacts (grep/sed/head), not full dumps. Token budgets enforced per phase. | All context passing |
| **Steerability** | How well instructions guide model behavior | CONSTRAINTS block precedes all data. Explicit output schemas constrain shape. Anti-pattern examples prevent common failures. Stop conditions tell agents when they're done. | Prompt design |

## Prompt Structure Pattern

All 12 phase prompts follow this order:

```
## CONSTRAINTS (Steerability + Next Token Prediction)
- Role assignment, rules, limits, anti-patterns
- Read first → model commits to constraints before seeing data

## CONTEXT (Working Memory + Knowledge)
- Compressed upstream artifacts (shell extractions, not full dumps)
- Most critical info first, supporting context second

## TASK (Description)
- Specific, measurable deliverable
- Knowledge boundaries: flag [UNCERTAIN] when unsure

## FORMAT (Steerability)
- Exact output structure with section headers
- Constrains response shape

## VERIFY (Discernment + Diligence)
- Self-check items the agent runs before submitting
- Anchors output quality at the end of the prompt
```

**Why this order:** Anthropic docs confirm "queries at the end can improve response quality by up to 30%." Constraints first exploits Next Token Prediction — the model reads sequentially and commits to limits before generating. VERIFY at the end exploits the same property — verification criteria are the last tokens before output, making them the strongest influence.

## Context Extraction Map

| Phase | Source Artifact | Extraction | What It Gets |
|-------|----------------|------------|-------------|
| 1 Requirements | pre-check.md | `grep -iA2 "Recommendation" + grep -iA20 "Codebase"` | Recommendation + matches |
| 2 Design | brief.md | Full brief (already concise) | Problem + criteria + scope |
| 3 Adversarial | design.md | `sed -n '/Decisions/I,/Risks/Ip'` | Decisions + components |
| 4 Planning | design.md | Same as Phase 3 | Decisions + components |
| 5 Drift | brief.md + plan.md | `grep -A50 "Success Criteria" + grep -A100 "## Steps"` | Criteria + step table |
| 6 Build | plan.md | Full plan (exception — needs paste-ready code) | All steps with BEFORE/AFTER |
| 7-10 QA | build-report.md | `grep -A20 "Files Changed" + grep "Verdict"` | Changed files + verdict |
| 11 Security | build-report.md | `grep -A20 "Files Changed"` | Changed files only |

## Cross-Phase Validators

| Validator | Type | Checks | Principle |
|-----------|------|--------|-----------|
| `critique_addressed` | SOFT | Build traceability covers all HIGH/MEDIUM critique issues | Discernment |
| `requirements_covered` | SOFT | Build traceability covers all success criteria from brief | Discernment + Diligence |
| `uncertainty_resolved` | SOFT | No unresolved NEEDS_RESEARCH/NEEDS_DETAIL flags in final artifacts | Knowledge |

## Gate Types

| Gate | Behavior | Phases | Principle |
|------|----------|--------|-----------|
| HARD | Any fail → PAUSE for human review | 0, 3, 11 | Delegation (human decides) |
| SOFT | Fail → WARN and proceed | 1, 2, 4, 5 | Discernment (flag, don't block) |
| NONE | Always proceed, auto-fix | 6, 7-10 | Diligence (fix and document) |

## Sources

- [Anthropic AI Fluency Framework](https://aifluencyframework.org/) — 4 Ds definitions
- [AI Capabilities and Limitations](https://anthropic.skilljar.com/ai-capabilities-and-limitations) — 4 Core Properties
- [Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Working Memory optimization
- [Claude Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — Prompt structure research
