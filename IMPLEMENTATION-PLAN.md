# Implementation Plan — Best-of-Best Pipeline

Roadmap from the August 2026 audit (`PIPELINE-AUDIT-2026-08.md`: 56 confirmed
findings, research across Spec Kit, Aider, mini-SWE-agent, OpenHands, Copilot
coding agent, Codex cloud, Devin, Bugbot, Anthropic code/security review,
CodeRabbit, Greptile, Graphite) to a pipeline that is fast, cheap, hard to
break, and blocks only on things that would actually break the application.

**North star (industry consolidation, stated bluntly):** plan → build →
real-test evidence → human-reviewed PR. Model-judgment gates between those
points must earn their false-block rate or become warnings. The pipeline's
durable advantages — fresh context per phase, the un-fakeable test-exit-code
gate, deterministic-first QA, commit integrity — are kept and strengthened.

**Cadence:** one milestone per branch/PR. Definition of done for every
milestone: all smoke suites green, routing/SLO evals green, one live
end-to-end run on the demo project, and the metrics below moving the right
direction. Never stack unrelated milestones in one PR.

## Success metrics (measured every milestone)

| Metric | Baseline (post-M0) | Target |
|---|---|---|
| False-block rate on the routine-task benchmark (10 CRUD/UI tasks) | unmeasured | 0 hard halts |
| Live cloud run completes | yes (1 run) | yes, 5/5 repeat runs |
| Engine overhead per mocked run (non-model wall-clock) | 94s → ~55s (post-M2) | < 10s |
| `deterministic-first-smoke` wall-clock | > 200s (times out) | < 60s |
| Resume success after `kill -9` at each phase checkpoint | mostly fails | 13/13 phases |
| Model calls per `fast`-profile run | ~9 → 6 (post-M2: collapsed 1+2+4, auto-skipped 5) | ≤ 5 |
| User worktree ever dirtied by a run | yes (by design) | never |
| Runs killed mid-phase by a budget cap (money spent, nothing delivered) | possible | 0 — caps halt only at resumable checkpoints |
| Executors supported via the adapter contract | 2 (claude, codex); spec published (adapter contract in PIPELINE-SPEC.md §6) | ≥ 3 (+ opencode) once opencode can be validated |

## Milestone 0 — Stop the bleeding (DONE, commit 097b3d5)

Credential-aware isolation + auth preflight + provider timeout/retry/error
surfacing; BLOCKER-lane gate calibration with mechanical demotion; robust
verdict/attestation parsing; anchored flag tokens; Phase 6 verdict gate;
high-precision risk classifier + synced eval; `.pipeline` self-gitignore;
repo-root guard; baseline verification; CI=1 for trusted commands; branch
guidance. Validated by 4 smoke suites, 15/15 routing eval, and a live cloud
run (7 phases, 22/22 validators, $1.11).

## Milestone 1 — Runs can never hurt you (isolation & resume) — DONE

Landed: per-run worktree isolation (dirty user trees allowed; user checkout
provably untouched; committed runs auto-clean their worktree), checkpoint
candidate-tree pinning + mid-mutation restore on resume, per-invariant resume
hints, deterministic `detect-project.sh`, recorded scanner waivers
(placeholder/fixture/`.env.*.example`/`PIPELINE_ALLOW_REMOTE_DEPS`), and
`tests/resume-kill-matrix.sh` (interrupt-at-checkpoint × resume, plus a
damaged-worktree restore case).

1. **Per-run git worktree for Phases 6–12.** `git worktree add
   $PIPELINE_STATE_DIR/worktrees/<run> $BASE_HEAD`; point the frozen
   verification matrix, candidate capture, and commit machinery at it. The
   user's checkout is never touched; results land only as the published run
   branch. Kills the `--allow-dirty` candidate-contamination class outright,
   makes mid-run crashes zero-cleanup, and gives resume a stable base.
   Touch points: `prepare_build_branch`, `candidate_*`, `run_trusted_command`
   cwd, `commit_reviewed_tree`, cleanup in `notify_exit`.
   *Acceptance:* run with dirty user tree completes; user tree byte-identical
   after; worktree metric goes to "never".

2. **Resume that actually works.** With the worktree as the checkpointed
   state: snapshot nothing extra, but (a) stop `detect-project.sh` re-runs
   from breaking the artifact-manifest check (make its output deterministic —
   drop the embedded timestamp), (b) enumerate and relax the fail-closed
   comparisons that today compare engine-mutated state against itself, and
   (c) on resume-refusal, print WHICH invariant failed and what the user can
   do, never just "mismatch".
   *Acceptance:* `kill -9` at each of the 13 checkpoints, then `--resume`
   succeeds 13/13 with no manual repair.

3. **Deterministic scanner allowlists (carefully).** Non-waivable BLOCK stays
   for real secrets/protected paths, but: test-fixture/placeholder patterns
   (`EXAMPLE`, `test_`, `.env.example`, `.env.local.example`, documented
   dummy keys), lockfile-only dependency changes, and monorepo workspace
   manifests get explicit, recorded handling. Every allowlist hit is written
   to the ledger as a waiver event with the matched rule.
   *Acceptance:* a task adding a test fixture with a fake API key completes;
   a task adding a real-shaped live secret still hard-blocks.

## Milestone 2 — Fast and cheap by default (the consolidation move) — DONE

Landed: collapsed planning for yolo/fast (one strong call → brief+design+plan
split into the standard artifacts; drift auto-skips when nothing was revised;
yolo model calls 7→5), verify-inside-build (frozen test/typecheck immediately
after Phase 6 with bounded fix attempts seeded by real output), elastic
budgets (--budget=elastic default: capped phases retry with doubled caps
inside the hard run cap, ledger-recorded; budgets removed from the resume
identity so a run-cap halt resumes with a higher cap), intent-level planning
with a deterministic plan lint + one bounded re-plan, and the overhead diet
(incremental O(1) ledger appends replacing full-chain re-verification per
event, native sha256/timestamps replacing ~450 node spawns: mocked-run
overhead 94s → ~55s; full <10s target continues in later passes).

4. **Profile phase-collapse.** For `yolo`/`fast`: one strong-model PLAN call
   produces a combined requirements+design+plan artifact (sections mirror
   today's brief/design/plan contracts so validators and Phase 3 reuse them);
   Phase 3 reviews the combined artifact; Phases 1/2/4/5 run as today only in
   `standard`/`paranoid`. Deterministic skeleton (Phase 0, test gate,
   scanners, commit integrity) unchanged in all profiles.
   *Acceptance:* `fast` run ≤ 5 model calls; benchmark quality unchanged
   (same tasks pass Phase 9/12).

5. **Verify-inside-build.** Immediately after Phase 6 (and each heal), run
   the frozen test+typecheck commands; on failure, ONE fix call seeded with
   the captured output, then re-run. Bounded iterate-until-green (2 attempts)
   in Phase 9 before any halt. This is the Aider/Devin loop: failures cost
   one cheap call at build time instead of a heal cycle + mandatory security
   re-run later.
   Touch points: after `run_phase 6`, `run_quality_behavior_phase`.
   *Acceptance:* a seeded one-line build bug self-heals without reaching
   Phase 12; halts only after bounded retries.

6. **Engine overhead diet.** Profile a mocked run; cache
   `populate_candidate_index`/`candidate_tree_oid` per candidate generation
   (they run dozens of full-tree passes today), batch ledger writes per
   phase, and skip redundant `git status --untracked-files=all` sweeps.
   *Acceptance:* overhead metric < 10s; `deterministic-first-smoke` < 60s and
   re-enabled in CI.

7. **Elastic budgets — runaway protection, not pacing.** Fact-check result:
   phase prompts never mention money, so caps don't make the model rush —
   but a cap firing mid-phase kills the run (exit 4) after the money is
   spent, converting "needs more" into "you get nothing". Redesign:
   `--budget=strict|elastic` (default elastic). Elastic = the per-phase cap
   auto-extends within the run cap, each extension a loud ledger event
   ("Phase 6 hit $4, extended to $8 within the $15 run cap"); the RUN cap
   remains hard but halts at the next resumable checkpoint, never mid-phase.
   Strict = today's behavior. Interactive runs may prompt instead of
   auto-extending. Note for output-depth complaints: the real lever is
   effort/model routing (most phases run balanced-lane at medium/low
   effort), not USD caps — tune routing, don't remove the safety net.
   *Acceptance:* a seeded over-budget phase completes via recorded
   extensions; exhausting the run cap resumes cleanly with `--resume`;
   "killed mid-phase" metric reads 0.

8. **Intent-level planning (fix "the plan is set up wrong").** Phase 4's
   exact BEFORE/AFTER paste-ready blocks are the most brittle contract left:
   any drift between plan-time reading and disk reality breaks Phase 6,
   which is forbidden to improvise. Adopt the architect/editor split: plan
   steps carry file + anchor + intent + acceptance criteria (and, per M3
   item 12, the failing test that proves the step) — never exact replacement
   code. The Builder makes edits against LIVE files; correctness comes from
   verify-inside-build (item 5), not from textual plan fidelity. Add a
   deterministic plan lint: every MODIFY path must exist, every anchor must
   grep-match on disk at plan time.
   *Acceptance:* a task whose target file shifts between plan and build (a
   seeded formatting change) still builds green; plan-lint rejects plans
   citing nonexistent anchors before Phase 6 spends anything.

## Milestone 3 — Verdicts you can trust (evidence-grounded review) — DONE

Landed: mechanical citation verification feeding every gate decision (Phase 3
blockers need real Evidence cells; Phase 12 blockers must cite files present
in review.diff; malformed rows fail closed; refuted/stripped rows recorded),
refute-before-block in standard/paranoid (one cheap fast-lane refuter per
surviving BLOCKER, capped at 3, ledger-recorded, zero cost on clean runs),
the repo-local precedents loop (.claude/rules/review-precedents.md injected
into review prompts + interactive [f] disposition capture), and
spec-to-failing-tests (acceptance-first planning prompts when a test command
exists, the demo's red acceptance test shipped, and the TDD baseline policy:
red-at-baseline tests keep commit armed and the decision lands on the final
test state — green commits, still-red completes review-only).

9. **Mechanically verified citations.** Validators for Phases 3/11/12 grep
   each BLOCKER's quoted evidence (file:line or diff-hunk text) against the
   actual artifact/diff; findings whose citations don't exist are stripped
   before the gate (ledger-recorded). Uncited BLOCKERs cannot halt a run —
   the Codex-cloud citation rule.
10. **Refute-before-block.** In `standard`/`paranoid`, each surviving BLOCKER
    gets one cheap balanced-lane refuter call ("attempt to refute; CONFIRMED
    requires the trigger input"); only CONFIRMED findings feed the HARD gate.
    This is the same adversarial-verify method the audit itself used.
11. **Precedents feedback loop.** On every human halt/override, record a
    one-token disposition (CONFIRMED_BUG / FALSE_POSITIVE) in the ledger; a
    small script folds FALSE_POSITIVEs into `.claude/rules/review-precedents.md`,
    which `build_prompt()` appends to Phases 3/11/12. Prompt calibration
    plateaus without this (Greptile's published negative result).
12. **Spec-to-failing-tests.** Phase 4's first plan steps author failing
    acceptance tests from Phase 1's success criteria; Phase 6 makes them
    green. Phase 9 then certifies "the task is done", not merely "nothing
    regressed". Ship the demo's missing red acceptance test as the reference.
    *Acceptance (M3 overall):* false-block benchmark at 0; a seeded
    real-bug task is still caught (no fail-open drift).

## Milestone 4 — Any model, one trust architecture (portability & delivery) — PARTIAL

Landed: PIPELINE-SPEC.md (the portable, vendor-independent spec + executor
adapter contract with capability/trust matrix and reviewer floor — the
centerpiece), build-phase protect-files hook injection (runtime-generated
--settings, absolute path, verified on build spawns only), --push / --pr
terminal delivery (publishes the committed run branch to the remote with
retry + PR guidance; smoke-tested against a bare remote), and the
/auto-pipeline in-session cloud fallback.

Deferred as untestable in this environment (kept honest per the standing "no
untested speculative code" rule): the concrete `run_opencode()` adapter
(opencode not installed here) and cross-adapter review routing (needs two
live provider CLIs). Both are fully specified in PIPELINE-SPEC.md §6 and are
mechanical to add where the tools exist.

The identity shift: the pipeline is a **provider-neutral verification
harness** — structured distrust of any AI executor. The model is untrusted
labor; only orchestrator-verified evidence (real exit codes, attested
diffs/trees, deterministic scans, CAS publication) earns a commit. The spec
is the product; the bash engine is its reference implementation.

13. **`PIPELINE-SPEC.md` — the portable spec as a first-class deliverable.**
    Define, executor-independently: the 13 phases and their artifact
    contracts, gate semantics (HARD/SOFT/NONE + BLOCKER-lane calibration),
    the evidence contract (what must be orchestrator-captured vs
    model-claimed), resume/ledger invariants, and the adapter contract
    below. This is the document a Cursor/Grok/local-model team consumes.
14. **Executor adapter contract + capability matrix.** Formalize the seam
    that already exists at `run_model()`: an adapter takes (prompt, model,
    effort, tool scope, sandbox level) and returns (final report, usage
    JSON, exit semantics). Each adapter declares capabilities — isolation,
    per-tool allowlist, sandboxing, cost reporting, structured verdicts —
    and the engine gates trust on them exactly as it already does for old
    CLIs: full auto-commit only with isolation + attestation support;
    weaker adapters run audit-only (`--no-commit`). Profiles may require a
    minimum reviewer tier (`paranoid` demands a strong-lane reviewer — a 7B
    local model doesn't get to approve payment code).
15. **`opencode` adapter — "bring your own model" nearly free.** One new
    `run_opencode()` against the open-source agentic CLI unlocks Grok,
    Ollama/local models, OpenRouter, and most hosted providers in a single
    integration. Cursor's agent CLI is the second candidate integration.
    *Acceptance:* the demo task completes end-to-end on an opencode-driven
    model with claude/codex absent from PATH; executor metric ≥ 3.
16. **Cross-ADAPTER review decorrelation.** Generalize one-writes-one-
    reviews: under `--provider=auto`, Phases 3/12 route to a different
    adapter than the one that built, subject to the reviewer-tier floor
    (Amp Oracle pattern, now provider-neutral).
17. **`--pr` draft-PR terminal gate.** After commit, publish the run branch
    and open a draft PR whose body carries the ledger-derived summary, test
    evidence, security verdict, and review attestation. With a human PR as
    the terminal gate, headless SOFT gates warn-and-proceed by default.
18. **In-flight protection hooks.** Build-phase Claude calls get a minimal
    `--settings` file containing only the protect-files PreToolUse hook, so
    a protected-path edit is blocked at attempt time and self-corrected,
    instead of surfacing three phases later as a non-waivable scanner BLOCK.
19. **Cloud-native mode.** When the auth preflight fails (true no-subprocess
    sandboxes), `/auto-pipeline` falls back to in-session orchestration — a
    saved workflow/subagent path mirroring phase order, tool scoping, and the
    real-test gate, with the bash engine remaining the reference
    implementation for local/CI.

## Milestone 5 — Truth & hygiene — DONE

Landed: /pipeline-undo rewritten to the real worktree/branch model (was
reading files nothing writes and proposing a destructive checkout reset);
dead `pipeline` section removed from .claude/settings.json (it contradicted
the engine); auto-format.sh de-jq'd and gated on the project actually using
Prettier (--no-install); RDO-specific rules relocated to
`examples/reference-project-rules/` with a README (copying `.claude/` no
longer injects another project's schema; only engine-read
review-precedents.md stays in `.claude/rules/`); 12 agents' stale
`.claude/artifacts/` paths corrected to `.pipeline/artifacts/`;
code-scanner.md given proper frontmatter; an agents/README documenting that
they are interactive helpers carrying reference-project examples; and a
flag/docs truth pass (CLAUDE.md/AGENTS.md/README corrected — --pr was
documented as unimplemented after M4 shipped it; settings.json no longer
described as holding profiles).

20. Implement or delete `/pipeline-undo` (it reads files nothing writes).
21. Prune the RDO-specific rules/agents/templates into `examples/` so
    copying `.claude/` doesn't inject another project's conventions; fix the
    11 agents referencing the nonexistent artifacts dir.
22. Delete or wire the dead `pipeline` section of `.claude/settings.json`
    (its gate map contradicts the engine).
23. `auto-format.sh`: drop the hard jq dependency and the unconditional
    `npx prettier` on every JS/TS edit.
24. Docs truth pass: every documented flag/behavior exists; every flag is
    documented; keep the README's phase table generated from the engine.

## Standing rules while executing this plan

- Every gate change ships with a regression case (like the CRUD-vocabulary
  routing cases) so calibration can only be tightened deliberately.
- Silent caps and silent demotions are forbidden: anything dropped, waived,
  or demoted is a ledger event.
- No new model-judgment gates. New checks must be deterministic or
  evidence-grounded.
- Prompt scaffolding shrinks over time; when a phase misbehaves, prefer
  better evidence in the prompt or a deterministic check outside the model
  (mini-SWE-agent lesson).
