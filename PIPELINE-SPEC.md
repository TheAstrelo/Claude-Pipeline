# PIPELINE-SPEC — The Portable Verification Harness

Version 1.0 (spec). Reference implementation: `run-pipeline.sh`.

This document defines the pipeline independently of any model vendor or
agent runtime. The design premise: **the executor is untrusted labor**. Any
model, via any agentic runtime, may produce requirements, designs, plans,
code, and reviews — but nothing an executor *says* gates the run. Only
evidence the **orchestrator** captures itself may open the commit gate: real
exit codes, hashed diffs and trees, deterministic scans, reviews bound to
those hashes by the orchestrator,
and a compare-and-swap ref publish. A conforming implementation can swap
Claude for Codex, opencode-driven local models, Cursor's agent CLI, or a
human at a keyboard without changing a single gate.

## 1. Roles

- **Orchestrator** — the trusted process. Owns phase order, budgets, gates,
  retries, artifact persistence, candidate capture, verification commands,
  the ledger, and Git publication. Never delegates any of these.
- **Executor** — an adapter-wrapped agentic runtime that receives one
  prompt per phase in a fresh context, may use scoped tools, and returns a
  markdown report. Executors are interchangeable and unprivileged.
- **Human** — the terminal authority. Receives halts that survive bounded
  recovery, reviews published branches/PRs, and records finding
  dispositions that calibrate future runs.

## 2. Workspace contract

Every run executes in an **engine-owned git worktree** created from the
immutable baseline commit (`BASE_HEAD`), with the run branch
(`pipeline/<run-id>`) born alongside it. Consequences a conforming
implementation must preserve:

- The user's checkout never changes branch, index, or files. Uncommitted
  user changes are not part of the run.
- Results reach shared state only as the published run branch (atomic
  compare-and-swap ref update whose parent must equal `BASE_HEAD`).
- A committed run removes its worktree; halted and review-only runs keep it
  for inspection and resume.
- Checkpoints pin the exact candidate tree as a real git object behind a
  per-run ref; a resumed run RESTORES an interrupted workspace to the last
  checkpointed candidate tree before verification (the worktree is
  engine-owned, so restoration can never destroy user work).

## 3. Phases and artifacts

| Phase | Name | Gate | Artifact | Executor tools |
|---|---|---|---|---|
| 0 | Pre-Check | HARD | pre-check.md | read + web |
| 1 | Requirements | SOFT | brief.md | read |
| 2 | Design | SOFT | design.md | read + web |
| 3 | Adversarial Review | HARD | critique.md | read + scoped exec |
| 4 | Planning | SOFT | plan.md | read |
| 5 | Drift Detection | SOFT | drift-report.md | read |
| 6 | Build | HARD | build-report.md | read + write + exec |
| 7 | Denoise | NONE | qa-report.md (append) | read + write + exec |
| 8 | Quality Fit | NONE | qa-report.md (append) | read + write + exec |
| 9 | Quality Behavior | SOFT | qa-report.md (append) | read |
| 10 | Quality Docs | NONE | qa-report.md (append) | read + write + exec |
| 11 | Security | HARD | qa-report.md (append) | read + scoped exec |
| 12 | Commit Review | HARD | code-review.md | read + scoped exec |

Profiles may skip SOFT/NONE phases and may **collapse** phases 1+2+4 into
one strong-executor call whose output is split into the three standard
artifacts (drift detection auto-skips when plan and design share an origin
and the design was never revised). Phases 0, 11, 12 and the deterministic
skeleton are never skipped.

Artifacts are orchestrator-persisted (executors return reports; they never
write their own artifacts), content-addressed into an object store, and
listed in per-checkpoint manifests.

## 4. Gate semantics

- **HARD** — must pass or the run halts for a human (exit 3 headless),
  after bounded auto-recovery where defined.
- **SOFT** — warn and proceed in mixed/soft gate mode; pause in hard mode.
- **NONE** — always proceed; issues are auto-fixed in place.

**BLOCKER-lane calibration.** Review phases tag findings
BLOCKER / WARN / PRE-EXISTING. Only BLOCKERs may gate: a defect introduced
by this change that produces wrong behavior, data loss, a crash, or a
security breach, with a concrete trigger and evidence citation. Blocking
verdicts citing zero BLOCKERs are mechanically demoted to
proceed-with-notes. Style, lint, and docs never gate (the NONE phases own
them). Speculative findings (might/could/potentially) are WARN at most.

**Evidence-grounded gating.** Before a BLOCKER gates:
1. Its citation is verified mechanically (Phase 3: non-empty evidence cell;
   Phase 12: cites a file present in the reviewed diff). Uncited findings
   are stripped and recorded. Malformed rows fail CLOSED and still gate.
2. In the adaptive profiles, each survivor faces one cheap refuter call;
   only CONFIRMED findings gate. Refutations are durable evidence.
3. Repo-local precedents (findings a human recorded as FALSE_POSITIVE) are
   injected into review prompts so they are not re-raised.

**Un-fakeable behavior gate.** Phase 9 gates on the real exit code of the
project's frozen test command, run by the orchestrator. An executor cannot
talk past exit 1.

**Baseline relativity.** The frozen verification matrix
(test/build/typecheck/lint/docs) runs once against the untouched baseline at
startup. Checks already failing at baseline never gate the run
(`FAIL_PREEXISTING`); regressions gate. Red baseline tests support TDD: the
run continues, and commit requires the FINAL test state green (or an
explicit recorded waiver) — still-red completes review-only.

## 5. The evidence contract

Orchestrator-captured (trusted): baseline head/tree, candidate tree OIDs,
review diff + SHA-256, real command exit codes and outputs, deterministic
scanner results, checkpoint manifests, the hash-chained ledger.

Executor-claimed (untrusted): every report, verdict, and finding. Verdicts
are typed where the runtime supports structured output (`{artifact,
verdict[, findings]}`) and otherwise parsed from an anchored heading with
token-final matching; an unparseable verdict fails closed. The orchestrator
binds each review to the exact diff SHA-256 and candidate tree OID it
captured and re-verifies the tree after the review; executors never attest
digests themselves. "Scoped exec" is a permission allowlist of read-only git
subcommands, the frozen verification commands, and dependency audits — never
a general shell. A heal or any candidate mutation invalidates all downstream
approvals and re-runs verification and security.

The append-only ledger (`ledger.jsonl`) hash-chains every event; full-chain
verification runs at every checkpoint, at completion, and on resume. Resume
is fail-closed on engine/config/task/baseline/artifact mismatch, with
per-invariant actionable messages; budgets are excluded from the resume
identity so a run halted at its spend cap can resume with a higher one.

## 6. Executor adapter contract

An adapter is a function the orchestrator calls once per phase:

**Inputs**: prompt text (stdin); model id; effort level; tool scope
(read / read+web / read+write+exec); sandbox level (read-only /
workspace-write); per-call budget cap; working directory (the run worktree).

**Outputs**: the final markdown report (the phase artifact body); usage
telemetry (tokens, and cost where the runtime reports it); a process exit
code. Structured verdicts are optional; the anchored-markdown fallback is
always accepted.

**Behavioral requirements**:
- Fresh context per invocation — no session persistence, no memory, no
  ambient user config, no repo-controlled instruction files.
- Tool scope and sandbox honored (read-only phases must not write).
- The report is returned, not written into the repository.
- Wall-clock bounded by the orchestrator; transient failures retriable.

**Capability declaration** gates trust, mirroring the reference engine's
capability preflights:

| Capability | If absent |
|---|---|
| context isolation (no user config/memory) | audit-only (`--no-commit`) |
| per-tool scoping or sandbox | audit-only |
| cost reporting | budget caps become advisory; run loudly notes it |
| structured verdicts | anchored-markdown parsing (always supported) |
| authenticated spawn probe passes | engine refuses to start (fail fast) |

Profiles may set a **reviewer floor**: in `paranoid`, Phases 3/11/12 require
a strong-tier executor; a small local model may build, but not approve,
payment code. Where two or more adapters are available, review phases SHOULD
run on a different adapter than the one that built (decorrelated review).

## 7. Recovery loops (all bounded, all ledger-recorded)

- Phase 3 REVISE_DESIGN → design revision → re-review (bounded), only for
  confirmed BLOCKERs.
- Phase 4 plan lint → MODIFY paths must exist, anchors must literally occur
  in their files → one re-plan seeded with the exact lint findings.
- Phase 6 verify-inside-build → frozen test/typecheck immediately after the
  build; bounded fix attempts seeded with real failing output (advisory).
- Phase 12 REQUEST_CHANGES → heal → re-verify → re-scan → re-review
  (bounded), with convergence rules (re-reviews may only verify prior
  BLOCKERs and flag new ones on changed lines).
- Elastic budgets: a phase hitting its cap retries with a doubled cap while
  projected spend fits the hard run cap; every extension is a ledger event.

## 8. Conformance

An implementation conforms if: (a) every gate decision derives only from
orchestrator-captured evidence or mechanically verified executor claims;
(b) the workspace contract of §2 holds; (c) the commit path publishes only
a verified candidate tree via compare-and-swap with the immutable
baseline as parent; (d) every waiver, demotion, refutation, extension, and
skip is durable, attributable evidence — nothing is silently dropped.
