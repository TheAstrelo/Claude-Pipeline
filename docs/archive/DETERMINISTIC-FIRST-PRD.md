> **Archived.** Historical record; superseded by `CLAUDE.md`, `PIPELINE-SPEC.md`, and `IMPLEMENTATION-PLAN-V2.md`.
> Paths and behaviors described here may no longer exist.

# Product Requirements Document: Deterministic-First Adaptive Development Pipeline

**Status:** Milestones 1–3 accepted; Milestone 4 controls complete offline; GA canary and security approval pending
**Audience:** Pipeline maintainers, provider-adapter owners, CI/platform owners, and security reviewers
**Target engine:** `run-pipeline.sh`
**Last updated:** 2026-07-24

**Current implementation slice:** Milestones 1–3 and the offline implementation portion of Milestone 4 are present in the working tree: recovery-before-escalation for Phases 3, 5, and 12; model-free green Phase 9; a frozen, digest-bound trusted verification policy; non-skippable final verification; fail-closed candidate and Git-control-state checks; exact security/reviewer attestations and publication; an append-only hash-linked ledger; hashed model and deterministic attempt envelopes; content-addressed artifact manifests; atomic checkpoints; strict compatible-state resume; derived run/history/operations views; stable prompt prefixes; correctness-independent cache telemetry; deterministic-first clean paths for Phases 7, 8, and 10; versioned profile-aware routing; non-waivable pre-Phase-11 protected-path/secret/dependency/symlink scanners; durable-output redaction; explicit terminal-run retention; and legacy/shadow/enforced rollout controls. All offline provider, failure-injection, resume, routing, security, redaction, retention, rollback, and SLO fixtures pass. A controlled real-provider `--no-commit` canary and authority-model security approval remain required before GA.

## 1. Executive Summary

The pipeline will become a deterministic control plane with bounded agentic execution inside explicitly authorized phases. Bash will own phase order, gates, retries, budgets, evidence invalidation, verification, and commit side effects. Model calls will be used only when judgment or code synthesis adds value; deterministic evidence will decide whether those calls are needed and whether their outputs are safe to accept.

The first milestone closes five reliability gaps in the current engine: recovery must run before a human halt, a green Phase 9 must make no model call, a final deterministic verification must run after Phase 10 and every heal, the exact reviewed diff must be verified before commit, and regression tests must prove each behavior without paid provider calls. Later milestones add an append-only run ledger, safe resume, cache telemetry, and eval-backed conditional escalation.

This direction preserves the current 13-phase provider-agnostic engine rather than replacing it. Anthropic recommends starting with the simplest composable pattern and distinguishes predefined workflows from dynamically directed agents; Microsoft similarly defines workflows as explicit execution graphs with deterministic control flow. Those principles fit this repository's existing single-engine architecture. Sources: [Anthropic, “Building Effective Agents”](https://www.anthropic.com/engineering/building-effective-agents), [Microsoft Agent Framework workflows](https://learn.microsoft.com/en-us/agent-framework/journey/workflows), and the current [`run-pipeline.sh`](./run-pipeline.sh).

## 2. Current Baseline and Problem

The current engine already provides a strong foundation:

- One Bash orchestrator runs phases 0–12 as isolated provider subprocesses.
- Profiles select phase skips and gate strictness.
- Hard, soft, and no-gate phases are mechanically classified.
- Phase 9 captures the actual project test exit code.
- Phases 3, 11, and 12 use typed verdicts on Codex and anchored verdict parsing on Claude.
- Phase 3 design revision, Phase 5 drift correction, and Phase 12 review-heal loops exist.
- Review input is persisted as `review.diff` with a companion Git object hash.
- Auto-commit requires an initially clean repository, creates a pipeline branch, and commits only after an `APPROVE` verdict.
- Provider smoke tests use fake adapters and temporary repositories, so they do not require paid calls.

These behaviors are established in [`run-pipeline.sh`](./run-pipeline.sh), [`tests/smoke-provider-adapters.sh`](./tests/smoke-provider-adapters.sh), and [`PIPELINE-AUDIT-2026-07.md`](./PIPELINE-AUDIT-2026-07.md).

Five defects prevent the pipeline from being reliably self-recovering and auditable:

1. `run_phase` applies a gate before the main loop dispatches Phase 3 and Phase 5 recovery. A headless hard pause can therefore exit before the existing recovery handler is reachable.
2. Phase 9 invokes a behavior-review model even when the independently captured test exit code is zero.
3. Phase 10 may mutate the worktree after Phase 9, but there is no final deterministic verification checkpoint afterward. Phase 12 heals likewise rerun tests but do not rerun the complete verification and security evidence chain.
4. The former commit path trusted a mutable real-index staging step after review. Milestone 1 replaces that boundary with exact diff/tree attestations, pre-publication recapture, a verified `git commit-tree` object, and an atomic compare-and-swap ref update.
5. The aggregate history record is insufficient to explain each deterministic check, model attempt, retry, invalidation, escalation, or resume decision.

The pipeline must retain the current facts that Phase 9's real process exit code is authoritative and that there is no Bash-owned per-step Phase 6 retry loop today. This PRD does not describe either behavior otherwise.

## 3. Goals

### G1. Deterministic orchestration

Bash owns all control-flow and irreversible decisions. A model may produce analysis, plans, patches, or verdicts, but it may not decide whether its own output bypasses a gate, consumes an unrecorded retry, or commits code.

### G2. Recovery before escalation to a human

Every recoverable outcome is dispatched to its bounded recovery handler before gate policy can halt the run. Human intervention occurs only for terminal outcomes, exhausted recovery budgets, unsafe state, or an explicitly interactive approval point.

### G3. Zero unnecessary model calls

Clean deterministic checks, beginning with green Phase 9, complete without a provider invocation. Model calls occur only for tasks requiring judgment, diagnosis, or mutation.

### G4. Evidence freshness

Any worktree mutation invalidates downstream evidence. Verification, security, diff capture, and review approval must apply to the current candidate state.

### G5. Reviewed-byte commit integrity

The exact binary-capable canonical diff and Git tree approved in Phase 12 must match the pre-publication candidate. The commit object must contain that exact tree with the immutable baseline as parent, and the branch ref must advance only through a compare-and-swap update. A mismatch blocks publication and invalidates approval; the real index is not a trust boundary.

### G6. Auditable and resumable runs

Each attempt, artifact, gate, recovery, model selection, budget consumption, state transition, and commit check is recorded in an append-only, hash-linked ledger. A later milestone uses that evidence to resume only from a compatible, verified state.

### G7. Provider neutrality

Policy is expressed in provider-independent capabilities and verdicts. Provider adapters translate policy into Claude or Codex flags without changing semantics.

### G8. Measurable quality and efficiency

Offline fixtures and production telemetry must show whether deterministic skips, routing, escalation, recovery, verification, and hash binding improve outcomes without raising escaped-defect rates.

## 4. Non-Goals

- Replacing `run-pipeline.sh` with an agent framework or long-lived service.
- Eliminating model-backed phases where semantic judgment is the product.
- Making probabilistic model output itself deterministic.
- Adding hidden subagents, persistent model memory, ambient MCP access, or provider-specific business logic.
- Implementing arbitrary resume after the task, baseline commit, engine policy, or relevant worktree inputs have changed.
- Adding a Bash-owned per-step Phase 6 retry loop in Milestone 1.
- Training, fine-tuning, or hosting models.
- Adding pull-request creation, remote pushes, deployment, or merge automation.
- Redesigning the existing profile names, phase numbering, or provider CLI contracts except where this PRD explicitly requires it.

## 5. Users and Use Cases

### 5.1 Primary users

| User | Need |
|---|---|
| Solo developer | Run a routine change cheaply and know that successful tests and review apply to the committed bytes. |
| Team maintainer or reviewer | Inspect why the pipeline advanced, retried, escalated, halted, or committed. |
| CI/platform owner | Operate reproducible headless runs with bounded cost, stable exit codes, and no unnecessary provider calls. |
| Security/compliance reviewer | Trace privileged actions and verify that post-heal code was revalidated and rescanned. |
| Provider-adapter maintainer | Change Claude or Codex invocation details without altering phase semantics. |

### 5.2 Core use cases

1. **Routine low-risk change:** deterministic checks pass, clean QA skips the model, and the run completes with fewer calls.
2. **Ambiguous change:** research, design, adversarial review, planning, and build use the configured model lanes while the engine retains control.
3. **Recoverable critique:** Phase 3 or Phase 5 invokes its bounded recovery before any headless halt.
4. **Failing tests:** Phase 9 records the real failure, optionally invokes bounded diagnosis/repair, and reruns the actual test command.
5. **Requested review changes:** Phase 12 performs a bounded heal, then rebuilds verification, security, diff, and review evidence.
6. **Interrupted execution:** a compatible run resumes from verified artifacts without repeating valid work.
7. **Audit:** an operator can reconstruct the exact inputs, attempts, outputs, hashes, gates, and commit decision.
8. **Provider degradation or budget pressure:** the engine retries transport failures, conditionally escalates only on objective triggers, and stops before exceeding configured budgets.

## 6. Product Principles

### P1. Deterministic shell outside; bounded agents inside

The orchestrator expresses the known workflow as code. Agentic behavior is confined to phases where the solution path is not fully knowable in advance. Anthropic's guidance says workflows use “predefined code paths,” while agents dynamically direct their process; Microsoft likewise recommends workflows when steps and transitions must be explicit. Sources: [Anthropic](https://www.anthropic.com/engineering/building-effective-agents) and [Microsoft](https://learn.microsoft.com/en-us/agent-framework/journey/workflows).

### P2. Evidence outranks model assertion

Process exit codes, hashes, validators, repository state, and budget counters are engine-owned facts. A model verdict is one input to a gate, never proof that tests passed or bytes remained unchanged. This extends the current Phase 9 design in [`run-pipeline.sh`](./run-pipeline.sh).

### P3. Recovery is a state transition, not a post-gate special case

A phase outcome is classified as `PASS`, `WARN`, `RECOVERABLE`, or `TERMINAL`. `RECOVERABLE` routes to a bounded handler first; only handler exhaustion yields `TERMINAL`. This prevents gate policy from making recovery code unreachable.

### P4. Mutation invalidates downstream evidence

Every mutation increments a candidate generation. Evidence records the generation and input hashes it covers. Evidence from an older generation cannot authorize a later generation.

### P5. Least privilege and explicit tool surfaces

Each phase receives only the sandbox, tools, files, and side-effect authority it needs. Google recommends least-privilege access for agents, and OpenAI recommends structured outputs and isolation around untrusted inputs. Sources: [Google Cloud security guidance](https://cloud.google.com/blog/products/identity-security/cloud-ciso-perspectives-how-google-secures-ai-agents/) and [OpenAI agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety#combine-techniques).

### P6. Structured boundaries

Machine decisions use schemas or strict anchored contracts. Provider prose remains an artifact, but the engine advances on validated fields. OpenAI's function-calling guidance recommends strict schemas and keeping the initially available function set small. Source: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling#best-practices-for-defining-functions).

### P7. Cache for performance, never correctness

Prompt caching may reduce latency and tokens, but a cache hit does not weaken validation or evidence freshness. Stable instructions and tool definitions precede variable run content because both Anthropic and OpenAI document exact-prefix matching behavior. Sources: [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) and [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

### P8. Evaluate traces, not only final answers

Regression fixtures assess control-flow decisions, call counts, attempts, artifacts, and side effects in addition to the final verdict. OpenAI recommends starting with trace grading while debugging agent behavior, and Google ADK evaluates both final response and execution trajectory. Sources: [OpenAI agent evals](https://developers.openai.com/api/docs/guides/agent-evals#start-with-traces-when-you-are-still-debugging-behavior) and [Google ADK evaluation](https://adk.dev/evaluate/).

## 7. Target Control Model

### 7.1 State machine

For every phase attempt, the engine must execute this order:

1. Materialize and hash the attempt inputs.
2. Record `attempt_started`.
3. Run the deterministic command or provider adapter.
4. Persist raw output, normalized artifact, process metadata, and hashes.
5. Run mechanical validation.
6. Classify the result as `PASS`, `WARN`, `RECOVERABLE`, or `TERMINAL`.
7. If `RECOVERABLE`, check recovery and budget limits and dispatch the handler.
8. Revalidate the handler result. Repeat only within the declared bound.
9. Apply profile gate policy to the final non-recoverable outcome.
10. Record the checkpoint and next state before entering the next phase.

A human pause is not a phase outcome; it is the gate action produced from a terminal or exhausted outcome. This ordering is the controlling requirement for Phase 3, Phase 5, and Phase 12 recovery.

### 7.2 Candidate generations and evidence

The engine maintains monotonically increasing `candidateGeneration` values:

- Read-only attempts do not change the generation.
- Any phase or recovery that may write to the repository captures `worktreeBefore` and `worktreeAfter`.
- If the fingerprints differ, the engine increments the generation even if the model claimed no change.
- Verification, security, review-diff, and approval artifacts record the generation they cover.
- Advancing to commit requires all required evidence to reference the current generation.

### 7.3 Final verification checkpoint

“Final verification” is an engine-owned checkpoint, not a new numbered phase. It runs:

- after Phase 10, before Phase 11;
- after every Phase 12 heal or any later mutation, before security and re-review;
- immediately before final diff capture if the last recorded verification generation differs from the current generation.

The checkpoint executes the project commands detected and recorded at run start:

1. tests;
2. build, typecheck, and lint when configured and available;
3. deterministic documentation checks configured by the project;
4. repository-state sanity checks, including protected paths and candidate scope.

All commands, argv, exit codes, output hashes, and durations are recorded. A required command failure is a hard precondition failure. Commands must be represented as trusted argv arrays or selected from repository-owned configuration; the target implementation must not `eval` untrusted task or model text.

### 7.4 Evidence rebuild after a heal

A Phase 12 `REQUEST_CHANGES` response may trigger a bounded heal. If the heal changes the worktree, the prior final verification, Phase 11 security result, review diff, and approval become stale. The required order is:

`heal -> final verification -> Phase 11 security -> canonical diff capture -> Phase 12 re-review -> pre-commit hash checks`

The engine may reuse earlier read-only artifacts only when their declared inputs and generation remain unchanged.

## 8. Phase Policy, 0–12

This table defines the target default. Existing profiles may skip phases exactly as they do today until a later profile review; a skipped phase must still produce a ledger event explaining the policy decision.

| Phase | Purpose | Default executor and lane | Deterministic-first policy | Gate and recovery policy |
|---:|---|---|---|---|
| 0 | Pre-check | Model, fast/high, research-enabled | Engine inventories repository and known commands first; model researches only unresolved reuse questions. | Hard. No automatic semantic recovery; transport/schema retry is bounded. |
| 1 | Requirements | Model, fast/low | Reuse a supplied valid brief when its task/input hashes match; otherwise extract testable criteria. | Soft. Invalid structure receives one same-lane correction before gate evaluation. |
| 2 | Design | Strong model/high with research | Reuse only when brief, code-context, and documentation-source hashes match. | Soft. One schema/format repair; substantive revision is driven by Phase 3. |
| 3 | Adversarial review | Strong model/high | Mechanical validation parses severity and typed verdict. | Hard. `REVISE_DESIGN` is recoverable: revise Phase 2 and re-review before possible human halt, bounded by `MAX_RETRIES`. |
| 4 | Planning | Model, fast/medium | Deterministic coverage checks compare criteria, design decisions, files, and steps. | Soft. One same-lane format correction; substantive gaps flow to Phase 5 recovery. |
| 5 | Drift detection | Model, fast/medium, plus deterministic coverage | Skip the model only when deterministic coverage rules can prove complete alignment; otherwise inspect drift. | Soft under normal profiles, effectively hard in paranoid. `DRIFT_DETECTED` revises the plan and rechecks before possible halt. |
| 6 | Build | Model, fast/medium, workspace-write | Engine applies budgets, protected-path rules, worktree fingerprints, and plan-step tracking. | Hard. No new Bash-owned per-step retry in Milestone 1. Existing phase-level failure semantics remain. |
| 7 | Denoise | Deterministic scanners first; model repair only on findings | A clean scanner result writes a deterministic artifact and makes zero model calls. | No gate. Repairs increment candidate generation and are rechecked. |
| 8 | Quality fit | Deterministic formatter/type/lint commands first; model repair only on actionable failures | A clean result makes zero model calls. Failed checks may invoke a bounded repair, then rerun the exact commands. | No gate, but unresolved required checks prevent final verification. |
| 9 | Quality behavior | Deterministic project test command | Exit code 0 produces the Phase 9 artifact and makes zero model calls. Nonzero may invoke bounded diagnosis/repair, followed by the real tests. | Soft by profile, but the real test exit code remains authoritative. |
| 10 | Quality docs | Deterministic docs/spec checks first; model repair only on findings | A clean result makes zero model calls. Any repair increments candidate generation. | No gate. Final verification runs after completion. |
| 11 | Security | Deterministic scanners plus security-review model; current provider-specific strong/high policy may remain | Scanner evidence and current-generation diff are explicit inputs. No model may waive a scanner failure. | Hard. Must rerun after any later heal or mutation. |
| 12 | Commit code review | Strong model/high or xhigh according to provider policy | Reviewer receives canonical diff hash and current evidence manifest and must echo the hash in typed output. | Hard. `REQUEST_CHANGES` heals before halt within `MAX_CODE_REVIEW_HEALS`; approval is generation- and hash-scoped. |

The base lane is a policy input, not a model preference. Higher reasoning effort is reserved for tasks whose evals show material benefit; OpenAI's deployment guidance recommends evaluating reasoning settings rather than defaulting every task to maximum effort. Source: [OpenAI deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist#set-up-reasoningeffort).

## 9. Functional Requirements

Priority meanings are **P0** release-blocking for the named milestone, **P1** required for the next milestone, and **P2** hardening.

### 9.1 Control flow and recovery

| ID | Priority | Requirement |
|---|---|---|
| FR-001 | P0 | The engine shall separate attempt execution, validation, outcome classification, recovery dispatch, and gate action into explicit operations. |
| FR-002 | P0 | The engine shall dispatch a recoverable outcome before `pause_for_human` or a headless exit can run. |
| FR-003 | P0 | Phase 3 `REVISE_DESIGN` shall invoke the existing design-revision handler and re-review up to the configured bound; only exhaustion or a terminal result may halt. |
| FR-004 | P0 | Phase 5 `DRIFT_DETECTED` shall invoke plan correction and recheck before gate evaluation, including paranoid mode. |
| FR-005 | P0 | Phase 12 `REQUEST_CHANGES` shall invoke the bounded heal path before gate evaluation; only exhaustion or a terminal review failure may halt. |
| FR-006 | P0 | Each handler shall record its trigger, parent attempt, attempt count, budget decision, result, and terminal reason in machine-readable artifacts. |
| FR-007 | P1 | Transport or provider-protocol retries shall be distinct from semantic recovery and shall not silently consume semantic retry limits. |
| FR-008 | P1 | Recovery loops shall enforce both an attempt bound and the existing per-phase and whole-run budget bounds. |

### 9.2 Deterministic QA and final verification

| ID | Priority | Requirement |
|---|---|---|
| FR-009 | P0 | Phase 9 shall run the actual detected test command before any optional behavior model. |
| FR-010 | P0 | When the test exit code is zero, Phase 9 shall invoke no provider process and shall write a normalized QA artifact containing command identity, exit code, output hash, duration, and `verdict: PASS`. |
| FR-011 | P0 | When tests fail, any model diagnosis or repair shall be bounded and the actual test command shall run again; model text cannot overwrite the captured exit code. |
| FR-012 | P0 | The engine shall run final verification after Phase 10 and after every heal or subsequent mutation. |
| FR-013 | P0 | Final verification shall include tests plus configured build, typecheck, lint, and deterministic docs checks; absence of an optional command shall be `NOT_CONFIGURED`, while a configured but unavailable command shall be `UNAVAILABLE` and fail. |
| FR-014 | P0 | Failed required final verification shall prevent Phase 11, Phase 12 approval, and commit until recovery succeeds or the run halts. |
| FR-014A | P0 | Verification argv, package-manager identity, selected script bodies, timeout policy, and executable identity shall be frozen and digest-bound at startup. Policy drift or any candidate/Git-control-state mutation by a verifier shall halt in every profile. |
| FR-014B | P0 | Auto-commit provider calls shall require a mechanically detected isolation capability: Claude `--bare` or Codex `--ignore-user-config`. The engine shall suppress mutable project/user instruction layers and supported plugin, memory, MCP, background, and subagent discovery; an older CLI may run only in explicit review-only mode. |
| FR-015 | P0 | A Phase 12 heal that changes the worktree shall invalidate and rerun final verification and Phase 11 security before re-review. |
| FR-016 | P1 | Phases 7, 8, and 10 shall use deterministic checks first and skip their model calls when clean. |

### 9.3 Review and commit integrity

| ID | Priority | Requirement |
|---|---|---|
| FR-017 | P0 | The engine shall build the review candidate in a temporary Git index initialized from the baseline `HEAD`, without modifying the user's real index. |
| FR-018 | P0 | The temporary index shall materialize exactly the allowed candidate paths using narrow engine-owned artifact exclusions; ordinary application suffixes shall never be excluded globally. |
| FR-018A | P0 | A relative state directory shall be a hidden engine-owned path. An absolute state directory shall canonicalize outside the repository; an absolute in-repository or symlink-resolved in-repository path shall be rejected before any provider call. |
| FR-019 | P0 | The canonical review input shall be `git diff --cached --binary --full-index HEAD` from that temporary index and shall have a SHA-256 content digest. |
| FR-020 | P0 | Phase 11 and Phase 12 inputs shall include the exact candidate diff digest and tree OID, and valid typed verdicts shall attest identical values. |
| FR-021 | P0 | Immediately before commit, the engine shall regenerate the temporary-index candidate diff and digest. A mismatch shall invalidate approval and block commit. |
| FR-022 | P0 | The engine shall create a commit object directly from the reviewed tree with the immutable baseline commit as its sole parent, without relying on a mutable real-index staging step. |
| FR-023 | P0 | Before publication, the engine shall mechanically verify the new commit object's tree and parent, then update only the run branch with a compare-and-swap `git update-ref` whose expected old value is the immutable baseline. |
| FR-024 | P0 | `--no-commit` shall perform candidate verification without mutating the real index. `--allow-dirty` shall continue to disable auto-commit. |
| FR-025 | P1 | The commit message or run record shall retain the run ID and reviewed digest for later audit without adding generated pipeline artifacts to the commit. |

Git documents that `git diff --cached` shows temporary-index content relative to `HEAD`, `--binary` emits binary-applicable changes, `git commit-tree` creates a commit from an exact tree, and `git update-ref <ref> <new> <old>` safely verifies the old ref value before updating it. Sources: [git-diff](https://git-scm.com/docs/git-diff), [git-read-tree](https://git-scm.com/docs/git-read-tree), [git-commit-tree](https://git-scm.com/docs/git-commit-tree), and [git-update-ref](https://git-scm.com/docs/git-update-ref).

### 9.4 Ledger, artifacts, and compatibility

| ID | Priority | Requirement |
|---|---|---|
| FR-026 | P1 | Each run shall have an append-only `ledger.jsonl` as the source of truth and an optional derived `run.json` summary. |
| FR-027 | P1 | Every deterministic check and every model call shall be a distinct attempt with stable identifiers and hashed inputs/outputs. |
| FR-028 | P1 | Ledger events shall include `prevEventHash` and `eventHash`; the engine shall verify the chain before resume and commit. |
| FR-029 | P1 | The engine shall write state transitions atomically and never edit a prior ledger line in place. |
| FR-030 | P1 | Schema versions shall be explicit. Readers shall reject unsupported major versions and tolerate documented additive minor fields. |
| FR-031 | P1 | Existing human-readable reports shall remain available and shall be derived from or referenced by machine-readable attempt records. |
| FR-032 | P0 | Existing provider-adapter semantics, profile phase selection, budget enforcement, branch safety, dirty-tree handling, and typed verdict behavior shall remain regression-covered. |

### 9.5 Resume and caching

| ID | Priority | Requirement |
|---|---|---|
| FR-033 | P1 | Resume shall verify run ID, schema, engine/config compatibility, baseline commit, branch, task hash, ledger chain, artifact hashes, and current worktree fingerprint before executing. |
| FR-034 | P1 | Resume shall refuse unsafe state rather than guessing. Changed inputs shall invalidate the affected checkpoint and all dependent downstream evidence. |
| FR-035 | P1 | A model verdict shall never be reused when any declared input hash, candidate generation, model policy, or validator version has changed. |
| FR-036 | P1 | Checkpoints shall be written only after artifacts and their ledger events are durably persisted. |
| FR-037 | P1 | Provider prompts shall place stable instructions, schemas, and tool definitions before variable task and artifact content to support exact-prefix caching. |
| FR-038 | P1 | Cache keys and telemetry shall be provider- and model-scoped and shall include the stable-prefix hash; cache behavior shall never affect validation or gating. |
| FR-039 | P2 | The engine may skip a previously completed deterministic attempt only when command identity, relevant files, environment fingerprint, and validator version still match. |

Microsoft's durable-agent patterns explicitly use checkpointing and replay to resume after interruption. This PRD adopts that durability concept while requiring repository-specific compatibility checks before reuse. Source: [Microsoft durable agent patterns](https://learn.microsoft.com/en-us/azure/durable-task/sdks/durable-agents-patterns).

## 10. Run Ledger and Attempt Schema

### 10.1 Storage model

Each session directory shall contain:

```text
.pipeline/artifacts/<run-id>/
├── ledger.jsonl          # Append-only source of truth
├── run.json              # Regenerable summary/index
├── checkpoints/          # Atomic checkpoint manifests
├── attempts/<attempt-id>/
│   ├── input-manifest.json
│   ├── raw-output.*
│   ├── artifact.md
│   ├── result.json
│   └── stderr.log
├── verification/
├── security/
└── review/
```

Large raw artifacts remain separate files; the ledger stores relative paths, byte counts, media types, and SHA-256 digests. Secrets must be redacted before persistence. Artifact absence is explicit rather than inferred from a missing path.

### 10.2 Run summary schema

The exact JSON Schema will be versioned in implementation. The required logical shape is:

```json
{
  "schemaVersion": "1.0",
  "runId": "20260724T120000Z-task-slug",
  "task": {
    "text": "task text",
    "sha256": "sha256:..."
  },
  "status": "RUNNING|HALTED|FAILED|COMPLETED",
  "createdAt": "RFC3339",
  "updatedAt": "RFC3339",
  "repository": {
    "root": "/absolute/path",
    "baselineHead": "git-object-id",
    "baselineBranch": "branch",
    "baselineDirty": false,
    "worktreeFingerprint": "sha256:..."
  },
  "engine": {
    "version": "version-or-commit",
    "configSha256": "sha256:...",
    "provider": "codex|claude",
    "profile": "yolo|fast|standard|paranoid",
    "mode": "auto|dev"
  },
  "budgets": {
    "phaseUsd": 0,
    "runUsd": 0,
    "maxRetries": 1,
    "maxReviewHeals": 2
  },
  "candidateGeneration": 0,
  "phases": {},
  "checkpoints": {},
  "totals": {
    "attempts": 0,
    "modelCalls": 0,
    "inputTokens": 0,
    "outputTokens": 0,
    "cachedTokens": 0,
    "estimatedCostUsd": 0,
    "durationMs": 0
  },
  "commit": {
    "reviewedDiffSha256": null,
    "reviewerEchoSha256": null,
    "precommitCandidateSha256": null,
    "reviewedTreeOid": null,
    "commitTreeOid": null,
    "baseParentOid": null,
    "commitSha": null
  }
}
```

`run.json` is a convenience view. If it conflicts with `ledger.jsonl`, the verified ledger wins.

### 10.3 Attempt schema

Every model call, deterministic command bundle, recovery, and verification checkpoint uses the same attempt envelope:

```json
{
  "schemaVersion": "1.0",
  "runId": "run-id",
  "attemptId": "p09-primary-001",
  "phase": 9,
  "sequence": 1,
  "purpose": "PRIMARY|RECOVERY|ESCALATION|HEAL|FINAL_VERIFICATION",
  "parentAttemptId": null,
  "trigger": {
    "kind": "PHASE_ENTRY|VALIDATION_FAILURE|TEST_FAILURE|REVIEW_CHANGES|TRANSPORT_ERROR",
    "sourceAttemptId": null,
    "evidenceSha256": "sha256:..."
  },
  "startedAt": "RFC3339",
  "finishedAt": "RFC3339",
  "status": "STARTED|SUCCEEDED|FAILED|CANCELLED",
  "executor": {
    "kind": "DETERMINISTIC|MODEL",
    "provider": null,
    "model": null,
    "reasoningEffort": null,
    "sandbox": "read-only|workspace-write",
    "tools": [],
    "promptSha256": null,
    "stablePrefixSha256": null,
    "cacheKey": null
  },
  "inputs": [
    {
      "path": "relative/path",
      "sha256": "sha256:...",
      "candidateGeneration": 0
    }
  ],
  "outputs": [
    {
      "path": "attempts/p09-primary-001/result.json",
      "sha256": "sha256:...",
      "mediaType": "application/json",
      "bytes": 0
    }
  ],
  "process": {
    "argvFingerprint": "sha256:...",
    "exitCode": 0,
    "signal": null,
    "modelStopReason": null
  },
  "verdict": {
    "type": "PASS|WARN|RECOVERABLE|TERMINAL",
    "code": "TESTS_PASSED",
    "details": {}
  },
  "validators": [
    {
      "name": "phase-9-real-exit-code",
      "version": "1",
      "status": "PASS",
      "evidenceSha256": "sha256:..."
    }
  ],
  "gateDecision": "ADVANCE|WARN_AND_ADVANCE|RECOVER|PAUSE|FAIL",
  "worktree": {
    "beforeSha256": "sha256:...",
    "afterSha256": "sha256:...",
    "candidateGenerationBefore": 0,
    "candidateGenerationAfter": 0
  },
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "cachedTokens": 0,
    "estimatedCostUsd": 0,
    "durationMs": 0
  }
}
```

### 10.4 Ledger event types

Required event types are:

- `run_started`
- `phase_skipped`
- `attempt_started`
- `attempt_finished`
- `validation_finished`
- `gate_evaluated`
- `recovery_dispatched`
- `candidate_generation_changed`
- `evidence_invalidated`
- `checkpoint_written`
- `run_halted`
- `run_resumed`
- `commit_verified`
- `run_completed`

Each line includes `eventId`, `sequence`, `timestamp`, `runId`, `type`, `payload`, `prevEventHash`, and `eventHash`. Hash linking is tamper-evident, not a substitute for operating-system access control or signatures.

## 11. Conditional Model Escalation

### 11.1 Policy

The engine shall select a base lane from phase policy, then evaluate objective triggers before the call. A model's self-reported confidence alone is never an escalation trigger.

| Trigger | Action |
|---|---|
| Provider timeout, rate limit, or transport failure | Retry the same lane within transport bounds; use provider backoff guidance when available. |
| Invalid structured output with otherwise successful response | One same-lane schema-correction attempt; then escalate only if the phase requires semantic judgment and budget remains. |
| Recoverable mechanical validation failure | Invoke the declared phase recovery; use a stronger lane only when the recovery policy or eval results prescribe it. |
| Preclassified high-risk domain such as auth, payments, secrets, destructive migrations, or commit review | Select the configured strong lane before the first semantic call. |
| High ambiguity measured from missing acceptance criteria, conflicting constraints, or unresolved architecture dependencies | Route requirements/design to the strong lane according to a versioned rule. |
| Clean deterministic result | Make no model call for phases whose policy supports a deterministic artifact. |
| Budget exhausted or unsafe state | Halt; do not downgrade validation or silently choose an unapproved provider. |

### 11.2 Decision requirements

- The escalation decision, rule version, evidence, selected model, effort, and projected budget impact must be recorded before invocation.
- Escalation is bounded to one step unless a phase explicitly defines another bound.
- De-escalation is allowed only before a call, never by substituting a weaker result after a stronger review failed.
- Routing rules must be evaluated against labeled fixtures before becoming defaults.
- Provider adapters may map capability lanes to different model names, but the mapping must be versioned in the run configuration.

## 12. Caching and Resume

### 12.1 Prompt caching

Prompts shall be ordered as:

1. stable system/phase instructions;
2. stable structured-output schema;
3. stable tool definitions and repository conventions;
4. relatively stable codebase context;
5. variable task, artifact paths, evidence, and latest retry feedback.

The engine records stable-prefix hashes, cache-read tokens, cache-write tokens where exposed, latency, and cost. A cache miss is normal. Correctness must not depend on cache availability, and cached content remains subject to the provider's retention and data-handling policy.

### 12.2 Deterministic result reuse

Result reuse is stricter than prompt caching. A completed deterministic attempt may be reused only when all of these match:

- command argv fingerprint;
- command/validator version;
- relevant input file hashes;
- baseline commit and candidate generation;
- declared environment inputs;
- repository-owned configuration hash.

If any field is unknown, rerun the check.

### 12.3 Safe resume

Resume is fail-closed:

1. Locate the requested run by opaque run ID.
2. Verify ledger sequence and hash chain.
3. Verify every referenced artifact hash.
4. Verify compatible schema, engine major version, configuration, provider policy, task hash, baseline `HEAD`, and branch.
5. Compare current worktree fingerprint to the latest valid checkpoint.
6. Compute the first invalid or incomplete dependency.
7. Invalidate that node and all downstream evidence.
8. Append `run_resumed`; never rewrite the original history.
9. Continue from the first required attempt.

Resume must refuse a changed baseline, unexplained worktree mutation, missing artifact, unsupported schema, or broken ledger. The error must identify the first failed invariant and a safe new-run command.

## 13. Security and Compliance Requirements

### 13.1 Authority boundaries

- Only the engine may advance phases, authorize retries, alter budgets, materialize candidate trees, create commit objects, or publish refs.
- Model subprocesses receive the narrowest sandbox and tool list defined by phase policy.
- Research phases are read-only; mutation phases are workspace-scoped.
- No model or artifact may directly invoke a privileged command through untrusted free-form interpolation.
- The target command runner uses trusted argv arrays or repository-owned allowlisted commands, not `eval` over task/model content.

### 13.2 Repository safety

- Auto-commit requires the existing clean-baseline invariant.
- `--allow-dirty` continues to disable commit.
- Candidate path allowlists and exclusions are identical for temporary-index review, verification binding, and the exact published commit tree.
- Pipeline artifacts, secrets, environment files, and protected control files remain excluded unless explicitly in task scope and policy permits them.
- Symlink, submodule, path traversal, unusual filename, binary file, rename, deletion, and file-mode cases must be included in commit-integrity tests.

### 13.3 Untrusted data

- Web content, issue text, repository content, model output, and provider error text are untrusted inputs.
- Untrusted text is data inside structured fields; it cannot add tools, alter phase policy, inject command flags, or declare evidence valid.
- Provider tools and schemas are fixed by the engine. Anthropic recommends clear tool boundaries and descriptions; OpenAI recommends structured isolation between untrusted input and tool execution. Sources: [Anthropic tool guidance](https://www.anthropic.com/engineering/writing-tools-for-agents) and [OpenAI agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety#combine-techniques).

### 13.4 Secrets, logs, and ledger

- Provider stdout/stderr and test output pass through configurable secret redaction before durable persistence.
- Raw unredacted output, if temporarily necessary for a local command, is not uploaded or retained by default.
- Ledger and artifacts use least-privilege filesystem permissions and a documented retention policy.
- Environment variable values, tokens, credentials, and full environment dumps are forbidden in ledger payloads.
- Hash chains provide tamper evidence; a future signed-run feature may add authenticity but is not required for Milestone 1.

### 13.5 Post-heal security

Security approval is generation-scoped. Any mutation after Phase 11 invalidates it. The engine must rerun Phase 11 after a Phase 12 heal and before the healed diff returns to review.

## 14. Observability, Metrics, and Evaluations

### 14.1 Reliability metrics

| Metric | Definition | Initial target |
|---|---|---:|
| Recovery reachability | Recoverable fixtures that enter their handler before halt | 100% |
| Final verification coverage | Commit-eligible runs with current-generation final verification | 100% |
| Post-heal security coverage | Mutating heals followed by current-generation security rerun | 100% |
| Reviewed-diff integrity | Commits whose four required digests agree | 100% |
| Prevented integrity mismatch | Deliberate post-approval mutations blocked before commit | 100% in fixtures |
| Hard-gate escape | Runs advancing after terminal hard-gate failure | 0 |
| Escaped pipeline defect | Accepted commits failing the same verification in an immediate clean replay | Baseline, then decreasing |

### 14.2 Efficiency metrics

- Model calls per run and per phase.
- Green Phase 9 zero-call rate; target 100%.
- Deterministic-clean skip rate for phases 7, 8, and 10 after Milestone 3.
- Input, output, and cached tokens per successful run.
- Estimated provider cost and wall-clock duration per profile.
- Transport retry, semantic recovery, heal, and escalation rates.
- Cache hit rate by stable-prefix hash.
- Repeated-work avoided by safe resume.

### 14.3 Quality and routing metrics

- Phase-specific `pass^k` and failure-category distribution on frozen fixtures.
- False-halt rate: a bounded recovery fixture halts despite an available valid repair.
- False-recovery rate: a terminal or unsafe fixture enters mutation instead of halting.
- Escalation precision: escalated fixtures that materially improve validated outcome.
- Escalation recall: fixtures labeled as requiring the strong lane that were routed there.
- Review sensitivity to seeded security, correctness, scope, and documentation defects.
- Schema-conformance and anchored-verdict parsing rates by provider.

### 14.4 Evaluation suites

1. **Control-flow unit fixtures:** no providers; assert transitions, retry counts, invalidation, and gate ordering.
2. **Adapter smoke fixtures:** fake Claude and Codex executables; assert argv, effort, schema, append semantics, and call counts.
3. **Git integrity fixtures:** temporary repositories covering tracked, untracked, binary, rename, deletion, executable bit, nested path, and post-approval mutation cases.
4. **Phase regression fixtures:** canned artifacts and verdicts for every phase/profile combination.
5. **Recovery fixtures:** Phase 3, Phase 5, failed Phase 9, and Phase 12 heal success/exhaustion.
6. **Resume corruption fixtures:** changed baseline, broken hash chain, missing artifact, changed config, and compatible interruption.
7. **Offline semantic evals:** versioned task corpus comparing lane quality, cost, and recovery success; no production routing change without a recorded eval result.

Anthropic recommends task-specific evals with balanced positive and negative cases and grading the outcome rather than prescribing one exact path. Source: [Anthropic, “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

## 15. Rollout Milestones

### Milestone 1: Reliability Spine

**Objective:** Close the known control-flow and commit-integrity gaps without changing the 13-phase product shape.

Required scope:

1. **Recovery handlers reachable before human halt**
   - Refactor attempt result handling so Phase 3, Phase 5, and Phase 12 recoverable verdicts reach their bounded handlers before `pause_for_human`.
   - Preserve current profile semantics after recovery is exhausted.
   - Keep Phase 6 behavior unchanged; do not claim or add a Bash-owned per-step retry loop as part of this milestone.

2. **Green Phase 9 makes no model call**
   - Run the real test command.
   - On exit code zero, generate the normalized Phase 9 artifact and advance through the existing gate semantics with zero provider invocations.
   - On nonzero, retain bounded model-assisted diagnosis/repair and rerun the real tests.

3. **Final verification after Phase 10 and heals**
   - Add the final deterministic verification checkpoint after Phase 10.
   - Run it after every Phase 12 heal or later mutation.
   - After a mutating heal, rerun Phase 11 security before Phase 12 re-review.
   - Block review/commit when required checks fail or evidence is stale.

4. **Exact reviewed tree published atomically**
   - Produce a canonical binary-capable diff from a temporary index.
   - Require Phase 11 and Phase 12 typed verdicts to attest its SHA-256 digest and candidate tree OID.
   - Regenerate and compare the candidate immediately before publication.
   - Create and verify a commit object from the exact reviewed tree and immutable baseline parent.
   - Publish only through a compare-and-swap ref update; invalidate approval and block on any mismatch or race.

5. **Regression tests**
   - Extend fake-provider smoke tests and add focused fixtures with no paid calls.
   - Prove Phase 3 recovery precedes halt.
   - Prove Phase 5 recovery precedes halt in paranoid mode.
   - Prove Phase 12 heal precedes halt and remains bounded.
   - Prove green Phase 9 invokes no provider and writes a machine-readable pass artifact.
   - Prove a Phase 10 mutation triggers final verification and a seeded failure is caught.
   - Prove a mutating heal triggers final verification and security before re-review.
   - Prove a post-approval diff or tree mutation blocks commit.
   - Prove an unchanged approved tree produces an exact-tree, exact-parent commit.
   - Prove verification-command mutation and verification-policy mutation halt in every profile.
   - Prove an in-repository absolute state path is rejected before providers.
   - Prove no-Git execution becomes review-only without applying an untested-commit waiver.
   - Prove an older Codex CLI cannot auto-commit and a mutable project Codex config is rejected.
   - Preserve tests for both adapters, profiles, budgets, typed verdicts, dirty-tree handling, pipeline branch creation, and no-call smoke behavior.

**Exit criteria:** Every P0 requirement passes in local and CI fixtures; no fixture uses a paid provider; documentation accurately describes the new behavior; existing adapter smoke tests remain green.

### Milestone 2: Durable Evidence and Safe Resume

- Introduce `ledger.jsonl`, attempt envelopes, artifact manifests, candidate generations, and hash-linked events.
- Generate the aggregate run summary from the ledger.
- Add atomic checkpoints and fail-closed resume.
- Add prompt-cache telemetry and stable-prefix fingerprints without changing correctness.
- Migrate existing history readers with a documented schema-version strategy.

**Exit criteria:** Compatible interrupted fixtures resume without repeating valid attempts; corrupt or changed-state fixtures refuse resume with a precise invariant failure.

### Milestone 3: Deterministic Clean Paths and Adaptive Routing

- Make phases 7, 8, and 10 deterministic-first with zero model calls on clean results.
- Add objective, versioned escalation/de-escalation rules.
- Add offline routing corpus and compare quality, cost, latency, and recovery against the fixed-lane baseline.
- Enable adaptive routing by profile only after it meets release thresholds.

**Exit criteria:** Clean fixtures show the expected call reduction with no decrease in required-check pass rates; escalation meets agreed precision/recall thresholds.

**Implementation status:** Complete offline. Routing policy `1.0` records its
rule, objective evidence, selected model/effort, and projected cap before each
call. `tests/milestone-3-smoke.sh` proves clean Phase 7/8/10 skips and
finding-triggered remediation. The frozen 12-case corpus reports precision
`1.00`, recall `1.00`, clean-QA call reduction `1.00`, and required-check pass
delta `+0.3333` against the labeled fixed-lane baseline. Cost and latency are
relative policy units, and this corpus does not substitute for the Milestone 4
live-provider canary.

### Milestone 4: Security Hardening and General Availability

- Replace remaining unsafe command interpolation with trusted command descriptors.
- Add scanner adapters, secret-redaction tests, protected-path tests, and ledger retention controls.
- Add operational dashboards and release SLOs.
- Run a staged shadow/canary rollout, then make deterministic-first behavior the default.

**Exit criteria:** Security review approves the authority model; canary reliability meets targets; rollback to the prior policy is tested.

**Implementation status:** Offline controls complete; GA acceptance pending.
Security policy `1.0` blocks protected-path, high-confidence secret,
unbounded/remote dependency, and escaping-symlink findings before `review.diff`
or a Phase 11 model call. Redaction policy `1.0` processes provider and trusted
command output before durable use. Retention is explicit, disabled by default,
terminal-run-only, and ledger-recorded. `shadow` is review-only, `legacy` is the
tested rollback, and `enforced` is the default. The frozen 12-case release-SLO
corpus passes every offline threshold and deliberately records
`liveProviderCanary: false` and `gaEligible: false`.

## 16. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Control-flow refactor changes existing gate semantics | Unexpected advances or halts | Separate recovery dispatch from gate action, retain a truth-table test for every profile/outcome pair, and ship Milestone 1 behind a compatibility test suite. |
| Final verification adds latency | Longer successful runs | Run only configured commands, reuse exact deterministic results when inputs match, and report per-command duration before optimizing. Correctness remains the priority. |
| Candidate exclusions omit legitimate application files | Reviewed bytes differ from committed bytes | Exclude only exact engine-owned artifact directories, use one candidate-tree function throughout, and fixture suffixes such as `*.schema.json`. |
| Branch or commit state races after review | Wrong tree or parent is published | Create the exact commit object first, verify tree/parent, and publish the run ref only with an expected-old-value compare-and-swap. |
| SHA-256 diff digest is confused with Git object IDs | Incorrect comparison | Label the field `*_sha256`, hash raw canonical diff bytes consistently, and keep Git object IDs in separately named fields. |
| Model echoes the wrong hash or omits it | Review cannot authorize commit | Treat it as invalid structured output; one bounded correction is allowed, then halt. Never infer the intended hash. |
| A heal introduces a security flaw | Unsafe accepted code | Invalidate security evidence on mutation and rerun Phase 11 before re-review. |
| Ledger writes are interrupted | Ambiguous resume state | Append atomically where supported, checkpoint only after artifact persistence, verify the hash chain, and resume from the last complete event. |
| Hash-linked ledger is mistaken for authenticated audit | False trust | Document it as tamper-evident only; rely on filesystem controls now and consider signatures separately. |
| Cache or result reuse serves stale context | Incorrect decision | Key all reusable evidence to explicit input/config/version hashes; cache is never a gate signal. |
| Adaptive escalation increases cost unpredictably | Budget overrun | Decide and record escalation before the call, enforce phase/run budgets, cap escalation, and measure cost by rule. |
| Provider feature mismatch | Divergent semantics | Keep provider-neutral attempt/verdict contracts and test both fake adapters for every release-blocking behavior. |
| Command detection executes untrusted text | Command injection | Use trusted argv descriptors from engine logic or repository-owned configuration; never construct executable commands from model output. |
| Resume across a changed repository corrupts evidence | Invalid reuse or wrong commit | Fail closed on baseline, branch, worktree, task, config, or artifact mismatch and instruct the user to start a new run. |

## 17. Acceptance Criteria

Milestone 1 is accepted when all statements below are true:

1. Given a Phase 3 `REVISE_DESIGN` fixture with one successful revision available, the engine records and executes the recovery attempt before any pause; the run proceeds when re-review passes.
2. Given the same fixture with exhausted retries, the engine halts exactly once after the last recovery attempt and reports the exhaustion reason.
3. Given paranoid mode and a Phase 5 `DRIFT_DETECTED` fixture, the engine revises and rechecks the plan before applying the hard pause policy.
4. Given a Phase 12 `REQUEST_CHANGES` fixture, the engine heals before possible halt, never exceeds `MAX_CODE_REVIEW_HEALS`, and halts only on exhaustion or terminal failure.
5. Given a test command that exits zero, Phase 9 records exit code zero and a machine-readable `PASS`, and the fake-provider invocation counter does not increase.
6. Given a test command that exits nonzero, Phase 9 cannot report a passing gate merely because a model says tests pass.
7. Given a Phase 10 mutation that makes a required test fail, final verification catches the failure before Phase 11, Phase 12, or commit.
8. Given a Phase 12 heal that changes code, the event/order evidence shows final verification, then Phase 11 security, then diff recapture, then Phase 12 re-review.
9. Given unchanged candidate bytes, the canonical reviewed digest/tree, provider attestation, and regenerated pre-publication candidate are identical; the created commit has exactly that tree and the immutable baseline parent.
10. Given any candidate mutation after approval, the pre-commit comparison fails, approval is invalidated, and no commit is created.
11. Given a competing run-branch ref update, compare-and-swap publication fails without overwriting the competing ref.
12. Given `--no-commit`, temporary-index verification completes without changing the user's real index.
13. Given `--allow-dirty`, the engine never auto-commits.
14. Both Claude and Codex fake adapters retain their expected invocation, schema/verdict, artifact, and append behavior.
15. Existing profile selection, budget limits, clean-branch creation, dirty-tree safeguards, and commit smoke tests remain green.
16. The complete Milestone 1 regression suite runs offline and makes no paid model or network call.
17. Given an absolute state path that canonicalizes inside the repository, the engine rejects it before any provider call.
18. Given no Git repository and no test command, the engine records a review-only `UNTESTED` result without applying a commit waiver.
19. Given a Codex CLI without `--ignore-user-config`, auto-commit is rejected before any model call while `--no-commit` remains available with an isolation warning.
20. Given a production Codex run with `.codex/config.toml`, the engine rejects the mutable provider configuration before any model call.

Milestone 2 is accepted when a compatible interrupted run resumes from its last
valid checkpoint without repeating completed phase attempts and every seeded
ledger, artifact, baseline, config, engine, task, schema, or worktree mismatch
is rejected with a precise invariant failure. The offline
`tests/milestone-2-smoke.sh` fixture proves this matrix. Milestone 3 is accepted:
`tests/milestone-3-smoke.sh` proves the deterministic call boundaries and
`tests/evaluate-routing-policy.js` verifies the frozen corpus meets every
release threshold. Milestone 4's offline controls and rollback fixtures pass;
the milestone is accepted for GA only after authority-model security review and
controlled provider canary targets pass.

## 18. Dependencies and Constraints

- Bash remains the production orchestrator.
- Git must support temporary index operations and canonical cached diffs used by the integrity contract.
- `jq` or the existing equivalent is required for typed machine records.
- Provider CLIs remain external subprocess adapters.
- Tests must run on the repository's supported Bash environments and use temporary Git repositories.
- The existing artifact directory remains excluded from candidate commits.
- This PRD defines behavior; implementation planning must identify exact functions and before/after edits without broad unrelated refactoring.

## 19. Documentation and Evidence Sources

| Source | Design evidence |
|---|---|
| [`run-pipeline.sh`](./run-pipeline.sh) | Current phase order, profiles, gates, routing, recovery handlers, test capture, review diff, budgets, and commit behavior. |
| [`tests/smoke-provider-adapters.sh`](./tests/smoke-provider-adapters.sh) | Existing no-paid-call provider and commit-safety test patterns. |
| [`PIPELINE-AUDIT-2026-07.md`](./PIPELINE-AUDIT-2026-07.md) | Verified limitations, including the absence of a Bash-owned per-step Phase 6 retry. |
| [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | Prefer simple composable patterns; distinguish fixed workflows from dynamic agents. |
| [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Clear, bounded tool interfaces and agent-appropriate context. |
| [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Curate relevant context and avoid unnecessary context growth. |
| [Claude Code: CLI reference](https://code.claude.com/docs/en/cli-usage) | `--bare`, strict scripted tool surfaces, and non-interactive isolation behavior. |
| [Claude Code: Environment variables](https://code.claude.com/docs/en/env-vars) | Disable CLAUDE.md, auto-memory, background work, cron, and nonessential traffic in subprocesses. |
| [Anthropic: Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Task-specific, balanced evaluations focused on outcomes. |
| [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | Exact-prefix caching and stable-prefix prompt organization. |
| [OpenAI: Function calling](https://developers.openai.com/api/docs/guides/function-calling#best-practices-for-defining-functions) | Strict structured contracts and constrained tool surfaces. |
| [OpenAI: Agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety#combine-techniques) | Structured isolation, tool safeguards, and handling of untrusted input. |
| [OpenAI: Agent evals](https://developers.openai.com/api/docs/guides/agent-evals#start-with-traces-when-you-are-still-debugging-behavior) | Trace-level evaluation while debugging agent behavior. |
| [OpenAI: Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) | Exact-prefix caching and cache telemetry. |
| [OpenAI: Deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist#set-up-reasoningeffort) | Evaluate reasoning effort as a quality/cost/latency control. |
| [OpenAI Codex: `exec` implementation](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs) | `--ignore-user-config`, ephemeral execution, config-layer isolation, sandbox selection, and structured-output plumbing. |
| [Google Cloud: Agentic AI design patterns](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) | Select orchestration patterns according to coordination and determinism needs. |
| [Google ADK: Evaluate agents](https://adk.dev/evaluate/) | Evaluate both final outputs and execution trajectories. |
| [Google Cloud: Securing AI agents](https://cloud.google.com/blog/products/identity-security/cloud-ciso-perspectives-how-google-secures-ai-agents/) | Least privilege, identity, monitoring, and bounded authority. |
| [Microsoft Agent Framework: Workflows](https://learn.microsoft.com/en-us/agent-framework/journey/workflows) | Explicit, deterministic orchestration for multi-step execution. |
| [Microsoft: Durable agent patterns](https://learn.microsoft.com/en-us/azure/durable-task/sdks/durable-agents-patterns) | Checkpoint, replay, and resume patterns for durable execution. |
| [Git: git-diff](https://git-scm.com/docs/git-diff) | Canonical staged-versus-`HEAD` diff behavior and binary/full-index options. |
| [Git: git-read-tree](https://git-scm.com/docs/git-read-tree) | Populate and operate on a temporary index without updating worktree files. |
| [Git: git-hash-object](https://git-scm.com/docs/git-hash-object) | Content-derived object identifiers; informs explicit content-hash handling. |
