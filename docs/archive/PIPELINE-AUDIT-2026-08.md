> **Archived.** Historical record; superseded by `CLAUDE.md`, `PIPELINE-SPEC.md`, and `IMPLEMENTATION-PLAN-V2.md`.
> Paths and behaviors described here may no longer exist.

# Pipeline Audit — August 2026

Full-engine audit driven by real failures: nested provider spawns failing in
Claude Code cloud sessions, routine CRUD tasks being repeatedly blocked by
review gates, and general run fragility. Eight subsystem auditors read the
entire engine, every finding was independently re-verified against the code
by an adversarial verifier (56/56 confirmed, 0 refuted), and three research
passes surveyed 2026 best practice (GitHub Spec Kit, Aider, OpenHands,
mini-SWE-agent, Copilot coding agent, OpenAI Codex cloud, Devin, Cursor
Bugbot, Anthropic code/security review, CodeRabbit, Greptile, Graphite).

## Root causes found (and fixed in this change)

### 1. `CLAUDE_CODE_SIMPLE=1` broke auth for every OAuth user — the cloud failure

`run_claude()` set `CLAUDE_CODE_SIMPLE=1` (the `--bare` env) on every spawn.
Per the CLI docs, that mode reads auth **strictly** from `ANTHROPIC_API_KEY`
or an apiKeyHelper — OAuth and keychain are never read. Anyone authenticated
by claude.ai login (subscription users; every Claude Code cloud/web session)
got `Authentication error` / `terminal_reason: api_error` from every phase,
surfaced as the unrelated message "no artifact produced" after full startup.
Verified live by bisection in a cloud sandbox: identical isolation via the
explicit `CLAUDE_CODE_DISABLE_*` env set authenticates and completes.

**Fix:** credential-aware isolation (bare mode only with an API credential,
OAuth-compatible explicit-env isolation otherwise), a startup auth-preflight
probe that fails in seconds with the real error and remediation, real API
error text surfaced on any spawn failure, a provider wall-clock timeout
(`PIPELINE_PROVIDER_TIMEOUT_SECONDS`, default 2400s — previously a stalled
stream hung the run forever), and one retry on transient API errors.

### 2. Gates blocked routine work — the calibration failure

Confirmed drivers, each individually able to reject a normal CRUD change:

- Phase 3's prompt mandated `REVISE_DESIGN` on "any consensus" and "3+
  MEDIUM" with no severity rubric.
- Phase 12 required "ALL success criteria with no HIGH-severity findings",
  inviting scope-creep and taste findings with no evidence bar.
- The risk classifier flagged everyday words (`delete`, `role`, `token`,
  `admin`, `upload`, `webhook`) as HIGH risk, silently promoting phases to
  the strong model and a stricter bar — CRUD includes `delete` by name.
- Verdict parsing rejected common model markdown (bold token, emoji,
  next-line verdict) → unrecoverable exit-3 halts on HARD gates; it also
  prefix-matched tokens (`APPROVED` parsed as `APPROVE`) → fail-open.
- Attestation parsing demanded exactly one bare-heading digest line;
  backticks or restating the digest killed runs at Phase 11/12 as "STALE".
- Flag tokens (`NEEDS_INPUT`, `NEEDS_RESEARCH`, `NEEDS_DETAIL`,
  `DRIFT_DETECTED`, `BLOCKED`) were grepped as raw substrings anywhere in
  the artifact, so *prose mentioning them* halted runs.
- Phase 6's HARD gate never read the Builder verdict: a `FAILED` build
  passed if it avoided the word "BLOCKED" (fail-open), while "no steps were
  BLOCKED" halted a good build (false halt).

**Fix (grounded in Anthropic code/security review, OpenAI Codex review
rubric, Cursor Bugbot, Google eng-practices):** BLOCKER/WARN/PRE-EXISTING
severity lanes in Phases 3/11/12 — only BLOCKERs gate, and a blocking
verdict citing zero BLOCKER findings is mechanically demoted to
proceed-with-notes (ledger-recorded). BLOCKERs require a concrete trigger →
wrong-outcome scenario plus evidence citation; speculative might/could
findings are WARN at most; style/lint/docs are out of scope for gating
phases (7/8/10 own them); finding caps force ranking. Phase 11 gained
confidence bands (<0.7 unreported, 0.7–0.8 advisory, >0.8 with written
exploit path verdict-driving) and the Anthropic exclusion list. Phase 12
gained the Codex five-point flagging rubric, the introduced-in-this-diff
rule, and heal-loop convergence rules (re-reviews may only verify prior
BLOCKERs and flag new BLOCKERs on changed lines). The verdict parser
normalizes real markdown and requires token-final anchoring (fixing both
false halts and fail-open); attestation accepts formatting but requires all
stated digests to agree; every flag token is now verdict-line-anchored;
Phase 6 gates on its actual SUCCESS/PARTIAL/FAILED verdict. The risk
classifier keeps only high-precision domain signals (with the eval corpus
extended by CRUD-vocabulary regression cases; `tests/evaluate-routing-policy.js`
was also carrying a stale duplicate of the rules and is now synced).

### 3. The engine's own state dir sabotaged runs — the `.pipeline` paradox

With `.pipeline/` gitignored (this repo's own documented setup), the
`:(exclude)` pathspec made `git add -A` exit 1 → **every run failed at
startup** with "Could not initialize or resume the durable run ledger".
Without it gitignored, the engine's own `history.json`/`operations.json`
were swept into candidate trees → committed into user repos, poisoned the
worktree fingerprint (resume permanently failed), and tripped the
clean-tree check (every second run refused to start).

**Fix:** the state dir now writes its own `*` gitignore at session setup —
one mechanism that keeps engine scratch out of status, candidate trees,
review diffs, fingerprints, and commits in every repo configuration; the
fatal exclude-pathspec is gone (the `.claude/artifacts` exclusion is applied
only when not already ignored); the clean-tree check filters legacy engine
scratch; a repo-root guard stops subdirectory runs from silently scoping
review/commit to the subdirectory.

### 4. Pre-existing red checks nuked whole runs

Strict release verification exited 3 — in every profile, even `--no-commit`
audits — when any frozen check failed, including lint/typecheck failures
that predate the run and have nothing to do with the task. Knowably doomed
runs (baseline tests red, no waiver) still burned the full model budget
before halting.

**Fix:** baseline verification — the frozen matrix runs once against the
untouched tree at startup (`PIPELINE_BASELINE_CHECKS=0` skips). Checks
already failing at baseline are labeled `FAIL_PREEXISTING` and never gate;
red baseline tests switch the run to review-only immediately (commit still
requires green tests or the explicit `--allow-untested-commit` waiver);
regressions the run introduces gate exactly as before. A baseline command
that dirties the tree fails at startup with the exact paths instead of a
mid-run opaque `UNSTABLE` halt. Trusted commands now run with
`CI=1`/`NO_COLOR=1`, so watch-mode test runners no longer burn the full
timeout.

## Also fixed

- Phase 1 resolves ambiguity with recorded assumptions instead of halting
  headless runs (Spec Kit clarify-with-assumptions pattern).
- Phase 3 recovery prompt restates the Phase 2 format contract it is
  re-gated against, and recovery only dispatches on BLOCKER-bearing verdicts.
- The interactive gate menu no longer advertises a `[r] revise` option that
  was a no-op.
- Run completion prints run-branch / merge / return guidance instead of
  stranding the user on `pipeline/<session>`.
- Doc drift: README slash-command count, `--bare` claims, AGENTS.md
  `.Codex/rules/` path.

## Confirmed but deliberately not addressed in this change

Tracked for follow-up, in rough priority order:

1. **Deterministic scanner false-positive allowlists** (fixture/test keys,
   `.env.local.example`, git/https dependency specifiers hard-BLOCK with no
   waiver) — needs careful security review before loosening anything.
2. **Per-run git worktree isolation for Phases 6–12** (the industry-standard
   "runs can never dirty the user's tree" guarantee; also obsoletes
   `--allow-dirty` sweeping user files into candidates).
3. **Resume ergonomics** — no workspace snapshot exists to restore after a
   mid-mutation halt; `detect-project.sh` timestamps break the manifest
   check on resume.
4. **Ledger overhead** (50–90s of hashing/checkpoint ceremony per mocked
   run; dozens of full-tree `git add -A` passes) and `deterministic-first-smoke`
   not finishing in 200s.
5. **Dead surface**: `/pipeline-undo` reads files no component writes; the
   demo's advertised red acceptance test doesn't exist (demo `npm test`
   runs 0 tests); `.claude/settings.json` `pipeline` section is unread;
   11/15 agents reference a nonexistent artifacts directory; RDO-specific
   rules ship in `.claude/rules/` as if generic.
6. **Profile phase-collapse** — 2026 consolidation is plan → act →
   verify(tests) → human PR; for `yolo`/`fast`, merging Phases 1+2+4 into
   one strong-model plan call would cut cost/latency/false-halt surface
   while keeping the deterministic skeleton (Phase 0, test gate, scanners,
   commit integrity) — the parts the industry kept.
7. **`--pr` draft-PR terminal gate** and cross-provider review
   decorrelation under `--provider=auto`.
