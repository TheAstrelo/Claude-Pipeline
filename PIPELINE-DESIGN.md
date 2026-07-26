# Claude-Pipeline — Design Document

> **Historical design record.** This document predates the Codex provider
> adapter and contains superseded implementation/roadmap claims. Use
> [PIPELINE-AUDIT-2026-07.md](PIPELINE-AUDIT-2026-07.md) and
> `run-pipeline.sh` for the current behavior.

**Date:** 2026-07-16 · **Status:** the bash engine is shipped and has run end-to-end; this doc is the target architecture and the routing/capability matrix behind it. Every claim here was verified against `run-pipeline.sh` as it exists, and the cost figures are grounded in the first real end-to-end run (against `demo/starter-project`), not estimates.

## Current state (one paragraph)

There is exactly **one engine**: `run-pipeline.sh`, a real executable bash script that owns the phase loop, gating, routing, budget accounting, and history. `/auto-pipeline` is a ~75-line **thin wrapper** that launches it; the old ~2,400-line bash-in-markdown `auto-pipeline` and `dev-pipeline.md` are deleted. Each phase runs as its own `claude -p` subprocess with per-phase model + effort, a per-phase budget cap, and JSON cost capture. It has run 0→3 for real (Sonnet on Pre-Check/Requirements, Opus on Design/Adversarial, genuine artifacts, working validators/gates, real cost tracking, and an honest halt when a phase hit its budget cap). What does **not** exist yet: the Phase 12 commit + code-review gate, `--json-schema` typed verdicts, a real test-exit-code signal, memory, MCP web tools, and rules-as-skills. The migration section sequences those.

---

## Per-Phase Agent / Tool / Effort Matrix

Balanced profile, as wired in `phase_routing()`. Opus = `claude-opus-4-8`, Sonnet = `claude-sonnet-5`. **Never Haiku, never `max`.** "Allowed tools" is the minimal built-in set that becomes `--tools` scoping (bash engine) or per-tool `configs[].enabled` + `permission_policy` (CMA). "Thinking" = `thinking:{type:"adaptive"}` leaned into vs. suppressed for mechanical passes. "Memory" = access to the (planned) cross-run learning store.

| Phase | Role | Gate | Model | Effort | Allowed tools | Thinking | Memory |
|---|---|---|---|---|---|---|---|
| 0 | Pre-Check (find existing code/libs) | HARD | Sonnet | xhigh | Read, Grep, Glob, WebSearch, WebFetch | on | read |
| 1 | Requirements (testable criteria) | SOFT | Sonnet | low | Read, Grep, Glob | off | — |
| 2 | Design (architecture + citations) | SOFT | **Opus** | high | Read, Grep, Glob, WebSearch, WebFetch | on | read |
| 3 | Adversarial Review (critique the design) | HARD | **Opus** | high | Read, Grep, Glob, WebSearch | on | — |
| 4 | Planning (BEFORE/AFTER per change) | SOFT | Sonnet | medium | Read, Grep, Glob | on | read |
| 5 | Drift Detection (plan vs design) | SOFT | Sonnet | medium | Read, Grep, Glob | on | — |
| 6 | Build (execute the plan) | NONE | Sonnet | medium | Read, Edit, Write, Bash | on | — |
| 7 | Denoise (strip debug artifacts) | NONE | Sonnet | low | Read, Grep, Edit | off | — |
| 8 | Quality-Fit (types, lint, conventions) | NONE | Sonnet | low | Read, Grep, Bash, Edit | off | — |
| 9 | Quality-Behavior (tests, output match) | NONE | Sonnet | medium | Read, Bash, Edit | on | — |
| 10 | Quality-Docs (Swagger/JSDoc) | NONE | Sonnet | low | Read, Grep, Edit | off | — |
| 11 | Security (OWASP, auth, secrets) | HARD | Sonnet | xhigh | Read, Grep, Glob | on | — |
| 12 | Commit Code-Review *(not yet wired)* | HARD | **Opus** | **xhigh** | Read, Grep, Glob, Bash | on | read + write |

**Notes.** The executed engine runs Phase 3 as a **single Opus/high subprocess** (one critique pass covering all three angles) — the routing table above matches that. The CMA target (below) can instead fan Phase 3 into parallel critic subagents, which a single-process bash script can't. Phase 12 exists in `phase_routing()` (Opus/xhigh) but no `run_phase 12` calls it yet — it is the top migration item. On the currently-installed CLI, `xhigh` auto-clamps to `high` via a runtime probe; a newer CLI lifts it with no code change. `.claude/history.json` records **per-run** `costUSD` + `summary.totalCost` (not per-phase).

### Why this routing

- **Open-ended vs. verification is the split.** Opus is reserved for the phases that *generate or destroy* the solution space under ambiguity — Design (2) invents architecture, the critique (3) must imagine failure modes nobody wrote down, and Code-Review (12) is the final judgment on real built code. Everything else is *verification against a fixed target* (does the plan match the design, do tests pass, is there an OWASP pattern) — bounded work Sonnet does well and far cheaper.
- **Code-review gets the deepest effort (`xhigh`).** It's the last HARD gate on code that will actually be committed and PR'd, and it reasons over the *entire real diff plus surrounding code* — the largest, highest-stakes context in the run. So it earns both the strongest model and the highest effort. (This is your call, and it's the right one.)
- **Pre-Check and Security are Sonnet-`xhigh`, not Opus.** They're exhaustive *pattern hunts* (does this already exist / does this match a vuln class), not open-ended synthesis — effort matters more than model, and Sonnet-xhigh buys the thoroughness at Sonnet's `$2/$10`-per-MTok pricing instead of Opus's `$5/$25`.
- **Never Haiku.** Haiku 4.5 has **no `effort` param, no adaptive thinking, no server-side compaction, and only 200K context** — it structurally cannot participate in an effort-tiered, adaptive-thinking, long-context pipeline whose whole design is dialing reasoning depth per phase. The ~50% token saving is worthless if the control plane it needs doesn't exist on the model.
- **Never `max`.** It over-thinks structured, schema-constrained output (artifacts, verdict lines, BEFORE/AFTER blocks), inflating cost and latency without improving the deterministic shapes these phases emit. `xhigh` is the ceiling.

### $/run — grounded in the first real run

The first live run measured real per-phase cost (profile `standard`, against the Express demo):

| Phase | Model / effort | Measured cost |
|---|---|---|
| 0 Pre-Check | Sonnet / high | **$0.25** |
| 1 Requirements | Sonnet / low | **$0.18** |
| 2 Design | Opus / high | **$0.94** |
| 3 Adversarial | Opus / high | **$1.07** (hit the $1 cap) |

So the real unit costs are **~$0.95–1.07 per Opus-high phase** and **~$0.18–0.25 per Sonnet phase** — and the cheap Sonnet phases are *almost entirely* the measured ~41K-token Claude Code harness bootstrap paid fresh on every subprocess (zero cross-process cache reuse). Extrapolating:

- **Standard run (12 phases, 2 Opus + 10 Sonnet): ~$4–5.**
- **With the Phase 12 Opus-`xhigh` code-review added (13 phases): ~$5–6.**
- **100 runs/month ≈ $400–600.**

**Levers:** (1) QA phases 7–10 are non-gating (NONE) and latency-tolerant → route them through the **Batch API at 50% off** (~$25–40/month saved). (2) The ~1/3 of the bill that is pure per-subprocess bootstrap is only recoverable by collapsing subprocess-per-phase (Stage B/C below) — the strongest quantitative case for the CMA move.

---

## Architecture & Migration Path

### Where we are now

There is exactly **one engine**: `run-pipeline.sh`, a real executable bash script that owns the phase loop, gating, routing, budget accounting, and history. `/auto-pipeline` is no longer a program — it is a ~75-line **thin wrapper** that resolves flags and launches the engine. The old ~2,400-line "bash-in-markdown" `auto-pipeline` and `dev-pipeline.md` are **deleted**. This collapses two divergent implementations into a single source of truth.

**What each phase actually does now.** The engine shells each phase out as its own `claude -p` subprocess:

```
env -u CLAUDECODE claude -p \
  --model <M> --effort <E> \
  --output-format json \
  --max-budget-usd <phase-cap> \
  --dangerously-skip-permissions
```

`phase_routing()` returns a `MODEL|EFFORT` pair per phase and threads it into `run_claude`. Real per-phase cost is parsed from each subprocess's JSON envelope and summed into `TOTAL_COST`; `.claude/history.json` records one **per-run** record (`costUSD` = run total) plus `summary.totalCost` across runs. Budget is enforced at two levels: `--max-budget-usd` (per-phase cap) and `--max-run-budget-usd` (whole-run cap).

**Step-1 correctness fixes already landed (all verified in-repo):**

- **`set -e` removed.** It was aborting the process on the first non-zero exit, which killed the retry/revise loops before they could run. Loops now actually loop.
- **No `.raw → artifact` fabrication.** A phase that writes no artifact now *fails* instead of having the harness silently synthesize one from stdout. Empty work can no longer pass a gate.
- **Validators write to stderr and their counters work.** Findings are no longer swallowed on stdout or miscounted.
- **Phase 11 gates on the model's own typed verdict line** (`## Verdict: PASS|FAIL|CRITICAL`), and **`FAIL` is now a HARD fail.** This closed the previous fail-open where an XSS/auth-bypass finding could slide through.
- **`protect-files.sh` fails CLOSED without `jq`** — a missing dependency denies the mutation rather than allowing it.
- **Effort auto-clamps `xhigh → high`** whenever a startup runtime probe finds the installed CLI rejects `xhigh` (the currently-installed CLI does); a newer CLI lifts the clamp automatically, no code change.
- **Non-interactive safety:** `PIPELINE_NONINTERACTIVE=1` (or no TTY) makes a HARD-gate PAUSE **halt with exit 3** so the wrapper surfaces it, instead of a `read` hitting EOF and silently continuing past the gate.

**Routing/budget just added (balanced tiers):**

| Tier | Phases | Effort |
|---|---|---|
| Opus (`claude-opus-4-8`) | 2 Design, 3 Adversarial critics | `high` |
| Opus (`claude-opus-4-8`) | 12 Code-review (deepest — last line of defense) | `xhigh` |
| Sonnet (`claude-sonnet-5`) | 0 Pre-Check, 11 Security | `xhigh` |
| Sonnet (`claude-sonnet-5`) | 4 Planning, 5 Drift, 6 Build, 9 Behavior, 3 Aggregator | `medium` |
| Sonnet (`claude-sonnet-5`) | 1 Requirements, 7 Denoise, 8 Fit, 10 Docs | `low` |

Haiku is **never** used (no effort param, no adaptive thinking, no compaction, older cutoff). `max` is never used (it overthinks structured output).

**What still does not exist:**

- **Phase 12 (Commit + Code-Review).** No git branch → `code-reviewer` on the real diff → gate → commit → optional `gh pr` flow yet. This is the single biggest hole: built code is never reviewed against the actual diff before it lands.
- **`--json-schema` typed verdicts.** Gates still grep the model's prose for a verdict line. The CLI supports `--json-schema '<schema>'`; we don't use it, so the whole FORMAT-vs-grep-validator failure class is still live.
- **A real test-exit-code signal.** Phase 9 (Behavior) currently trusts the model's narrative that "tests pass." Nothing captures a real exit code and gates on it.
- **Memory** (no CMA memory store / persistent cross-run context).
- **MCP** (no `web_search`/`web_fetch` server tools wired into Design's research).
- **Skills conversion** (`.claude/rules/*.md` are still passive convention docs, not invokable skills).

### The agentic loop, closed

Every finding/verify phase must be a *closed loop*, not a one-shot: **prompt → gather context → act → VERIFY (objective) → on fail, loop back with the failure itself as NEW context.** The failure output is the highest-signal context the next iteration can get, and today most of it is thrown away.

| Phase | Prompt | Gather context | Act | VERIFY (objective) | On fail |
|---|---|---|---|---|---|
| **3 Adversarial** | 3 critics stress-test the design | Read `design.md` + brief.md criteria | Emit findings; aggregator ranks | Aggregator verdict `PASS` / `REVISE_DESIGN` via **typed schema** | `REVISE_DESIGN` → re-run Phase 2 with the critique as input (max 1) |
| **9 Behavior** | "verify built code behaves per design" | Read design + **`$TEST_COMMAND`** | Run the test suite | **Real captured exit code == 0** — un-fakeable | Non-zero → re-enter Build with the failing test output as new context |
| **11 Security** | OWASP / auth / secrets scan | Read the diff | Emit findings | Typed verdict `PASS\|FAIL\|CRITICAL`; `FAIL`/`CRITICAL` = HARD fail | Loop to targeted fix, re-scan |
| **12 Code-review** | Review the real diff | `git diff` on the working branch | `code-reviewer` produces ranked findings | Typed verdict gate before commit | Findings → fix loop, re-review, *then* commit |

**The one un-fakeable signal.** `detect-project.sh` already computes `$TEST_COMMAND` for the project. Wire that into Phase 9: run it, **capture the actual exit code**, and gate on it. A model can rationalize its way past a subjective review, but it cannot talk past a process that returned `1`. This turns Phase 9 from "the model says tests pass" into "the tests passed." Everything else in the QA band is soft; this one becomes the spine.

**Typed verdicts kill the grep class.** Replace every "grep the prose for `## Verdict: …`" gate with `--json-schema` so the model returns a *typed* object (`{ "verdict": "PASS"|"FAIL"|"CRITICAL", "findings": [...] }`). The gate then reads a field, not a regex over free text. This eliminates the entire class of bugs where a correctly-reasoned FAIL is missed because the model phrased the verdict line differently — the same class that previously caused the security fail-open.

### EPCC end to end

The pipeline maps cleanly onto **Explore → Plan → Code → Commit**, which is the frame worth optimizing against:

- **Explore** — Phase 0 Pre-Check (find existing code/libraries; HARD gate) **+ web research**. Design (Phase 2) should pull live docs via `web_search_20260209` / `web_fetch_20260209` server tools so architecture decisions cite current reality instead of training-cutoff memory.
- **Plan** — Requirements (Phase 1) writes **measurable success criteria into `brief.md`**; Planning (Phase 4) turns them into exact BEFORE/AFTER changes; Drift (Phase 5) checks the plan against the design.
- **Code** — Build (Phase 6) executes the plan **with the test suite in the loop** (the Phase 9 exit-code gate above), so "built" means "built and green."
- **Commit** — Phase 12 runs the `code-reviewer` on the **real diff, before the commit**. Reviewing the diff rather than the model's own narrative of what it did is what makes the review *unbiased* — the reviewer sees what actually changed, not what the builder claims changed.

**The current gap, named precisely:** `brief.md`'s success criteria are written at Phase 1 and fed **only into Phase 2** — after that they vanish. Phases 3–11 never receive `brief.md`, so the built code is never checked back against the criteria that justified building it. The pipeline verifies internal consistency (plan matches design, tests are green, no OWASP hits) but never closes the loop on *"did we build what the brief asked for?"* **Fix:** thread `brief.md`'s criteria into Phase 9 (behavior — assert the criteria are satisfied by observed behavior) and Phase 12 (code-review — the reviewer grades the diff against the original acceptance criteria). This makes success criteria a gate at the end, not just a prompt at the start.

### Sequenced migration

**Stage A — Finish the bash engine (shippable now).** No new infrastructure; extends `run-pipeline.sh` as it exists.

1. **Phase 12 commit + code-review** *(medium)* — `git branch` → `code-reviewer` on `git diff` → typed-verdict gate → commit → optional `gh pr`. *Keep:* the HARD-gate + retry machinery already in the engine. *Delete:* nothing — this is net-new and it's the highest-value gap.
2. **Test-exit-code gate on Phase 9** *(small)* — consume `$TEST_COMMAND` from `detect-project.sh`, capture the exit code, gate on it. *Delete:* the model's self-reported "tests pass" narrative as a gate input.
3. **`--json-schema` typed verdicts** *(small)* — swap grep-for-verdict gates (Phases 3, 11, 12) for schema-typed returns. *Delete:* the prose-parsing validators and their whole failure class.
4. **Thread `brief.md` criteria into Phases 9 and 12** *(small)* — pass the criteria file forward past Phase 6. *Delete:* nothing; closes the EPCC gap above.
5. **MCP web tools on Design** *(small)* — declare `web_search`/`web_fetch` on Phase 2. *Delete:* nothing.
6. **`rules/*.md` → skills** *(medium)* — convert `api.md`/`database.md`/`react.md` from passive convention docs into invokable skills so Build/QA actually load them on demand. *Keep* the rule content; change how it's delivered.
7. **Memory** *(medium)* — persist cross-run context (prior findings, project facts) so later runs don't re-derive them. Do it as a plain file store now; it becomes a CMA memory store in Stage C with no rewrite of intent.

Stage A leaves the architecture unchanged — still subprocess-per-phase — and is the honest recommendation to ship first.

**Stage B — Evaluate native subagents to kill the re-bootstrap** *(medium, evaluation-gated).* The dominant cost is measured, not theoretical: every `claude -p` subprocess pays **~41K tokens of Claude Code harness bootstrap, cache-written fresh with zero cross-process reuse** (~$0.05 Sonnet to ~$0.26 Opus of pure overhead) **× ~12–15 phases per run.** Collapsing subprocess-per-phase is the single biggest cost lever. Prototype the phase loop as one session using `--agents '<json>'` / `Task` so phases run as context-isolated subagents inside one harness boot instead of N cold boots. *Keep:* the gate/route/budget logic — it moves, it doesn't disappear. *Delete (if it validates):* the per-phase `claude -p` fork and its 41K× re-bootstrap. Gate the cutover on measured cost + gate-integrity parity against Stage A, since context isolation semantics differ from process isolation.

**Stage C — CMA as the hosted destination** *(large).* Move the whole thing onto Claude Managed Agents: create the pipeline **Agent once** (model/system/tools/mcp_servers/skills live on the agent, versioned), then **start a Session per run** referencing it, with the repo mounted as a `github_repository` resource and a `memory_store` for persistence. Anthropic hosts the agent loop *and* the per-session container where tools execute; server-side compaction (`compact_20260112`) replaces the crude per-phase artifact hand-off, and `user.define_outcome` with a rubric can drive the iterate→grade→revise loop natively. *Keep:* the phase decomposition, the gate philosophy (objective checks, typed verdicts, the test-exit-code spine), and the routing tiers — all portable. *Delete:* the local subprocess orchestration, the manual budget-summing, and the JIT artifact plumbing, which the platform now provides. This is the destination, not the next step — it's large, and Stages A and B deliver most of the correctness and cost wins without it.
---

## Capabilities: Tools, Skills, Memory, Context, Thinking

### 1. Server tools

The pipeline's two research-hungry phases are **Phase 0 Pre-Check** ("find existing code/libraries") and **Phase 2 Design** ("architecture decisions with citations") — and Design today produces citations it can't actually ground because it has no live-fetch capability. Wire the server tools onto exactly these two:

- **Phase 0 (Sonnet, `xhigh`)** and **Phase 2 (Opus, `high`)** declare `web_search_20260209` + `web_fetch_20260209`. Pre-Check uses search to confirm whether a library/pattern already exists before we build; Design uses fetch to pull the exact doc/API page it cites, so a citation resolves to a real URL+content instead of a hallucinated reference. This is the single highest-leverage capability add for the "SOFT gate, STRONG model, citations" contract on Design.
- `code_execution_20260521` (server sandbox) is useful where a phase must *run* something to decide, not just reason: Phase 5 Drift Detection (diff plan vs design programmatically), and optionally Phase 8/9 QA for scratch computation. Build/Denoise stay on client tools (they edit the real repo, see §2).
- **Dynamic filtering caveat:** the `_20260209` web variants have search/fetch built in with dynamic filtering — do **not** also declare `code_execution` on the same phase as a shim for fetching. Declare `code_execution_20260521` only where genuine sandbox execution is needed; declaring it alongside the `_20260209` web tools is redundant and muddies tool selection.

### 2. Client tools

The whole point of this pipeline is code edits, so tools must be scoped per phase — a read-only phase that can write is a gate-bypass waiting to happen.

- **Build (6, Sonnet `medium`), Denoise (7, `low`), Quality-Fit (8, `low`)** need `bash` + `text-editor` (read-write): they mutate the working tree.
- **Security (11, Sonnet `xhigh`)** is a HARD audit gate and must be **read-only** — `bash` for grep/scan, `text-editor` read-only, no write. A Security phase that can edit could "fix" its own findings and silently pass itself.
- **Phase 12 Commit Code-Review (Opus `xhigh`)** gets git-capable `bash` but the commit/PR side-effects go through the side-effectful commands in §3, not free-form.

Enforce this two ways depending on engine:
- **Bash engine (`run-pipeline.sh`):** pass `--tools "Bash,Read"` for read-only phases, `--tools "Bash,Edit,Read,Write"` for build phases.
- **CMA path:** put it on the Agent's `tools` as `{type:"agent_toolset_20260401"}` with `default_config:{enabled:false}` plus explicit `configs:[{name,enabled,permission_policy}]` — enable `edit`/`write` only on build-family agents, and set `permission_policy:{type:"always_ask"}` on destructive ops (write/bash-that-deletes) so the harness raises a `user.tool_confirmation` gate rather than proceeding unattended.

### 3. Skills

**Decision rule (use consistently across the pipeline):**
- **Slash-command** = *you* (the operator/orchestrator) trigger it deterministically — the phase steps in `run-pipeline.sh`.
- **Skill** = the *model discovers and loads it on demand* when the task matches — project conventions.
- **Subagent** = isolated context + its own tools — the Phase 3 critics and the Phase 12 code-reviewer.

**Convert `.claude/rules/*` into path-scoped skills** instead of keyword-injecting `api.md`/`database.md`/`react.md` into three phases' prompts. Make `api`, `db`, `react` skills that the model loads only when it touches matching paths (e.g. `src/pages/api/**`, `src/infrastructure/database/**`, `src/features/**/*.tsx`). This kills the "inject all three rule files into every relevant phase" token tax and lets Build/Planning pull only the rule set the current file actually needs.

**Lock the gates:** add `disable-model-invocation: true` frontmatter to every side-effectful command (`/build`, `/security-review`, the Phase 12 commit command, etc.). Post-2.1.3 slash commands *are* skills and the model can self-invoke them — without this flag a phase could invoke `/build` and skip the HARD gates in front of it.

**Skill set to build:**
- `new-migration`, `scaffold-api` — **exist**; re-point them at the *detected* project (correct next migration ID, correct API route conventions) instead of hardcoded assumptions.
- `run-tests` — Phase 9 Quality-Behavior loads it to execute the project's test command.
- `security-scan` — Phase 11 loads it for the OWASP sweep.
- `commit-and-pr` — Phase 12 loads it to branch → commit → optional `gh pr`; keep it `disable-model-invocation: true`.

### 4. Memory

Add a real memory layer. (The old `auto-pipeline.md` mutated `.claude/AGENTS.md` in place with `sed`, but that path is now deleted, and the shipped `run-pipeline.sh` engine has **no** memory at all — so this is net-new, not a replacement.)

- **Bash engine:** attach the client memory tool `memory_20250818`. The engine reads/writes known project facts (highest migration ID = 240, duplicate IDs 116/133/134/151/152/233/234/235, MUI Grid v2 `size` syntax, prior phase failures) as memory entries.
- **CMA path:** attach a **memory store** as a session `resource` (`{type:"memory_store", memory_store_id, access:"read_write", instructions}`). It mounts into the container as a filesystem dir the agent reads/writes with normal file tools; every mutation is an immutable memory version (audit + rollback).

**Auto-inject a system note:** "check memory for prior patterns/failures before Phase 0 and Phase 2." This is the actual token-saver — Pre-Check and Design stop re-deriving facts the project already knows (schema, migration IDs, conventions, past adversarial-review failures) and instead read them once.

**Hard rule: NEVER store secrets in memory.** Credentials belong in a Vault attached via `vault_ids` at session-create (env-var substitution at egress; the sandbox sees only a placeholder), never in a memory store or `AGENTS.md`.

### 5. The four context patterns applied here

- **(a) Prompt caching:** mark each phase's stable prefix — system prompt + tool declarations + any long rule/skill docs — with `cache_control`. The cache key is **model-scoped**, so today's per-phase model switching (Opus↔Sonnet) fragments the cache prefix; fewer models in play = more reuse — another point for the balanced routing. (Caching does *not* help the ~41K-token harness bootstrap, which is cache-written fresh per subprocess — that's the case for collapsing subprocess-per-phase entirely.)
- **(b) JIT context — pass paths, not bodies:** the shipped engine hands each phase the *full* upstream artifact by value (`design=$(cat design.md)`). Switch to passing artifact **paths** and letting each phase `Read` on demand. (Do **not** resurrect the grep-based "compression" scheme from the old `lib/framework.md` design docs — that isn't compression, it's data destruction: a golden 30-line `design.md` collapses to 7 lines, silently dropping content later phases depend on. Path-based JIT gets the token savings without the corruption.)
- **(c) Server-side compaction:** for long-running phases — chiefly **Phase 6 Build** and the multi-critic **Phase 3** — enable `compact_20260112` to summarize old turns into a single block as the loop grows. Available on **Sonnet/Opus, not Haiku** (another reason Haiku is excluded). This is the principled version of the pipeline's current crude manual per-phase artifact handoff.
- **(d) Context editing:** inside the **Phase 6 Build loop** (retry-with-error-context, max 2/step), prune stale tool results with `clear_tool_uses_20250919` and old reasoning with `clear_thinking_20251015` so a step's third attempt isn't dragging two dead tool-output dumps behind it.

### 6. Extended / adaptive thinking

Use `thinking:{type:"adaptive"}` on every phase and let **`output_config.effort` be the depth dial** — the effort level already assigned by routing directly controls how much the model thinks, so no separate thinking budget is needed.

**Thinking-heavy (reasoning / debugging / tradeoffs) — deep:**
- **0 Pre-Check** — reason about whether existing code/libs already solve the task.
- **2 Design** (Opus `high`) — architecture tradeoffs across cited sources.
- **3 Adversarial Review** (Opus `high`) — critics stress-testing the design for failure modes.
- **4 Planning** (`medium`) — deriving exact BEFORE/AFTER changes.
- **5 Drift Detection** (`medium`) — reconciling plan against design.
- **9 Quality-Behavior** (`medium`) — reasoning about whether tests actually prove the required behavior.
- **11 Security** (`xhigh`) — adversarial OWASP reasoning, auth bypass, injection paths.
- **12 Commit Code-Review** (Opus `xhigh`) — last line of defense; deepest reasoning over the real diff.

**Thinking-light (mechanical) — shallow:**
- **1 Requirements** (`low`) — extract testable criteria.
- **7 Denoise** (`low`) — strip debug artifacts.
- **8 Quality-Fit** (`low`) — types/lint/convention pattern-matching.
- **10 Quality-Docs** (`low`) — Swagger/JSDoc presence checks.

The aggregator portion of Phase 3 stays Sonnet `medium` — it's synthesizing three critics' output, not generating novel adversarial reasoning, so it doesn't need Opus-depth thinking. Never use `max` on any phase: it overthinks structured/gated output and hurts the deterministic artifact contract.
---

## Running the Pipeline as Claude Managed Agents (CMA)

### Architecture

The natural CMA shape for the 12-phase pipeline is **one coordinator Agent that delegates each phase to a dedicated per-phase subagent Agent, all driven inside a single Session**. The coordinator's `multiagent` roster names each phase Agent by id; when it delegates, each subagent runs in its own **context-isolated thread** (Phase 2's design research never pollutes Phase 6's build context, and vice-versa) while every thread shares the **same Session container filesystem**. That shared filesystem is what makes the JIT context pattern free: Phase 2 writes `design.md` to disk, and Phase 3 reads it from disk — artifacts pass *by file path, not by value*. No phase has to be handed the full text of a prior artifact; it Reads what it needs on demand. One Session means one mounted `github_repository`, one `environment`, one set of `vault_ids` — set up once, reused by all twelve phases.

The alternative is **N sequential Sessions** — one Session per phase, each terminating before the next starts. This also works and gives maximum isolation, but it forfeits the shared container: every Session re-mounts the repo, re-installs `npm` dependencies, and has to be handed prior artifacts as `file` resources or re-cloned state, reintroducing exactly the by-value handoff and cold-start tax we are trying to delete. **Recommend the coordinator + subagents shape**: per-phase context isolation, a single shared FS for artifact handoff, and a single environment/mount/vault lifecycle. (Note the one-level-of-delegation rule: the coordinator delegates to phase agents, but those phase agents cannot sub-delegate. Phase 3's "3 critics + aggregator" is therefore either flattened into the coordinator's own roster as four subagents, or run as three sequential critic passes inside one adversarial Agent's thread — see below.)

### YAML sketches (version-controlled, applied with `ant`)

**`environment.yaml`** — one cloud environment shared by every phase. The demo (`demo/starter-project/`) runs `npm install`, so package managers must be allowed.

```yaml
# environment.yaml
name: claude-pipeline-cloud
config:
  type: cloud
  networking:
    type: limited
    allow_package_managers: true      # demo needs `npm install`
    allow_mcp_servers: true           # Phase 12 talks to the GitHub MCP
    allowed_hosts:
      - github.com
      - api.github.com
      - registry.npmjs.org
    # If the build shells out to arbitrary hosts, swap the block for:
    #   networking: { type: unrestricted }
```

**`agent-architect.yaml`** — Phase 2 Design, the STRONG model, read-only + web research.

```yaml
# agent-architect.yaml — Phase 2 (Design, SOFT gate)
name: pipeline-architect
model: claude-opus-4-8
description: Phase 2 — architecture decisions with citations; writes design.md.
system: |
  You are the Design phase of a 12-phase pipeline. Read the requirements
  artifact from disk, research current docs, and write an architecture with
  cited sources to design.md. You do NOT modify the repo — read and research only.
tools:
  - type: agent_toolset_20260401
    default_config:
      enabled: false                  # deny-by-default: design never mutates the repo
    configs:
      - name: read
        enabled: true
        permission_policy: { type: always_allow }
      - name: grep
        enabled: true
        permission_policy: { type: always_allow }
      - name: web_search
        enabled: true
        permission_policy: { type: always_allow }
      - name: web_fetch
        enabled: true
        permission_policy: { type: always_allow }
skills: []
metadata: { phase: "2" }
```

**`agent-builder.yaml`** — Phase 6 Build, fast model, full toolset (the repo is mounted on the Session, not the Agent).

```yaml
# agent-builder.yaml — Phase 6 (Build, NONE gate)
name: pipeline-builder
model: claude-sonnet-5
description: Phase 6 — executes the plan step by step against the mounted repo.
system: |
  You are the Build phase. Read plan.md from disk and apply each BEFORE/AFTER
  change to the repository mounted at the Session's github_repository mount_path.
  Run the build/tests via bash. On step failure, retry with error context.
tools:
  - type: agent_toolset_20260401
    default_config:
      enabled: true                   # full built-ins: bash/read/write/edit/glob/grep
    configs:
      - name: bash
        enabled: true
        permission_policy: { type: always_allow }
      - name: edit
        enabled: true
        permission_policy: { type: always_allow }
      - name: write
        enabled: true
        permission_policy: { type: always_allow }
metadata: { phase: "6" }
```

**`agent-security-auditor.yaml`** — Phase 11 Security, HARD gate, read/grep/glob only (an auditor that cannot edit or execute code).

```yaml
# agent-security-auditor.yaml — Phase 11 (Security, HARD gate, never skipped)
name: pipeline-security-auditor
model: claude-sonnet-5
description: Phase 11 — OWASP scan; emits a single "## Verdict:" line.
system: |
  You audit the built diff for OWASP issues, auth bypass, and secrets exposure.
  You are read-only: no edit, write, or bash. End your report with EXACTLY one
  line — "## Verdict: PASS", "## Verdict: FAIL", or "## Verdict: CRITICAL".
tools:
  - type: agent_toolset_20260401
    default_config:
      enabled: false                  # read-only auditor: cannot mutate or run code
    configs:
      - name: read
        enabled: true
        permission_policy: { type: always_allow }
      - name: grep
        enabled: true
        permission_policy: { type: always_allow }
      - name: glob
        enabled: true
        permission_policy: { type: always_allow }
metadata: { phase: "11" }
```

**`coordinator.yaml`** — rosters the phase Agents and describes the gate sequence. The Phase 12 code-review/commit Agent carries the GitHub MCP so the coordinator can commit and open a PR through it.

```yaml
# coordinator.yaml — the pipeline conductor
name: pipeline-coordinator
model: claude-sonnet-5
description: Runs the 12-phase gate sequence, delegating each phase to a subagent.
system: |
  You are the pipeline coordinator. Run phases 0..12 in order, delegating each
  to its subagent. After each phase, READ that subagent's returned message and
  apply the gate:
    - HARD gates  (0 Pre-Check, 3 Adversarial, 11 Security, 12 Code-Review):
      must pass, else HALT the run and report the failing phase.
    - SOFT gates  (1, 2, 4, 5): warn and proceed.
    - NONE gates  (6 Build, 7-10 QA): proceed, auto-fix.
  Recovery: Phase 3 REVISE_DESIGN -> re-run Phase 2 (max 1); Phase 5 DRIFT ->
  re-run Phase 4 adding missing steps (max 1); Phase 6 step failure -> retry
  with error context (max 2/step). Phase 11 is NEVER skipped. Phase 12: create
  a branch, have the code-reviewer inspect the real git diff, gate on its
  Verdict, then commit and (optionally) open a PR via the GitHub MCP.
multiagent:
  type: coordinator
  agents:
    - agent_precheck            # Phase 0
    - agent_requirements        # Phase 1
    - { type: agent, id: agent_architect, version: 3 }   # Phase 2 (pinned version)
    # Phase 3: critics flattened into the roster (one level of delegation)
    - agent_critic_1
    - agent_critic_2
    - agent_critic_3
    - agent_adversarial_aggregator
    - agent_planner             # Phase 4
    - agent_drift               # Phase 5
    - agent_builder             # Phase 6
    - agent_qa_denoise          # Phase 7
    - agent_qa_fit              # Phase 8
    - agent_qa_behavior         # Phase 9
    - agent_qa_docs             # Phase 10
    - agent_security            # Phase 11
    - agent_codereview          # Phase 12 (see mcp_servers below)
metadata: { pipeline: "12-phase", profile: "standard" }
```

The Phase 12 Agent (`agent-codereview.yaml`, `model: claude-opus-4-8`) additionally declares the GitHub MCP so it can commit and open the PR. (Note: effort is a Messages-API `output_config` parameter, not a CMA agent-object field — the `xhigh` depth for code-review is set on the request the coordinator makes, not on the agent YAML.)

```yaml
mcp_servers:
  - type: url
    name: github
    url: https://mcp.example.com/github
tools:
  - type: agent_toolset_20260401       # read/grep/glob to inspect the diff
    default_config: { enabled: false }
    configs:
      - { name: read, enabled: true, permission_policy: { type: always_allow } }
      - { name: grep, enabled: true, permission_policy: { type: always_allow } }
      - { name: glob, enabled: true, permission_policy: { type: always_allow } }
  - type: mcp_toolset
    mcp_server_name: github            # commit + open PR through the MCP
```

### `ant` apply + run flow

```bash
# 1) Environment (once).
ant beta:environments create < environment.yaml            # -> env_abc123

# 2) Phase agents (once each; capture the returned ids).
ant beta:agents create < agent-precheck.yaml               # -> agent_precheck
ant beta:agents create < agent-requirements.yaml           # -> agent_requirements
ant beta:agents create < agent-architect.yaml              # -> agent_architect (v3)
ant beta:agents create < agent-critic-1.yaml               # -> agent_critic_1
# ... critics 2/3, aggregator, planner, drift, builder, QA 7-10 ...
ant beta:agents create < agent-security-auditor.yaml       # -> agent_security
ant beta:agents create < agent-codereview.yaml             # -> agent_codereview

# 3) Coordinator — its multiagent.agents references the ids captured above.
ant beta:agents create < coordinator.yaml                  # -> agent_coordinator

# 4) Session per run — references coordinator + environment, mounts the repo,
#    attaches a memory store and a vault. (body piped as session.yaml)
ant beta:sessions create \
  --agent agent_coordinator \
  --environment-id env_abc123 < session.yaml               # -> sess_run789
```

```yaml
# session.yaml
agent: agent_coordinator
environment_id: env_abc123
title: "pipeline run — add GET /health endpoint"
resources:
  - type: github_repository
    url: https://github.com/acme/claude-pipeline
    authorization_token: ${GITHUB_TOKEN}
    mount_path: /workspace/repo
    checkout:
      type: branch
      name: pipeline/add-health-endpoint
  - type: memory_store
    memory_store_id: mem_pipeline_learnings
    access: read_write
    instructions: >
      Cross-run pipeline learnings: recurring lint fixes, flaky tests,
      prior design decisions. Never store secrets here.
vault_ids:
  - vault_github_and_npm          # GitHub MCP OAuth + npm creds, substituted at egress
metadata: { profile: "standard" }
```

Kick off the run with **either** an outcome (harness-run iterate → grade → revise loop) **or** a plain message:

```json
// user.define_outcome — the coordinator iterates until the rubric passes
{
  "type": "user.define_outcome",
  "description": "Ship the task through all 12 phases; every HARD gate must pass.",
  "rubric": {
    "type": "text",
    "content": "PASS only if: Phase 0 found no duplicate implementation; Phase 3 aggregator = APPROVE (no REVISE_DESIGN); Phase 11 Verdict = PASS (FAIL or CRITICAL => fail); Phase 12 code-review Verdict = PASS AND a commit exists on the branch. Otherwise FAIL and name the failing phase."
  },
  "max_iterations": 3
}
```

```json
// ...or user.message to kick it off directly
{ "type": "user.message",
  "content": [{ "type": "text",
    "text": "Run the standard-profile pipeline for: add a GET /health endpoint returning {status:'ok'}." }] }
```

Then stream events:

```bash
ant beta:sessions:events stream --session-id sess_run789
```

**How gates map onto the stream.** Delegation surfaces as coordinator `agent.tool_use` / `agent.tool_result` pairs; each subagent's return is an `agent.message` ending in its verdict line (`## Verdict: PASS|FAIL|CRITICAL`, `APPROVE|REVISE_DESIGN`, `DRIFT_DETECTED`, …). The coordinator reads that message and applies the gate in-process — the same verdict-line gating the bash engine does by parsing subprocess JSON, but now a thread read instead of a `claude -p` exit. `session.status_idle` carries a `stop_reason` (natural finish vs. a HARD-gate halt), and `span.model_request_end` carries `model_usage` token counts — that is where per-phase cost accounting comes from, replacing the JSON-cost summing in `run-pipeline.sh`. Phase 12's commit and PR go out through the GitHub MCP acting on the mounted `github_repository`, with credentials supplied by the attached `vault_ids` (the sandbox only ever sees a placeholder).

### Why CMA vs. the bash engine

- **No per-phase re-bootstrap.** The bash engine pays ~41K tokens of Claude Code harness bootstrap on *every* `claude -p` child (~$0.05–$0.26 each, cache-written fresh with zero cross-process reuse, ×12–15 phases) — the dominant cost today. A CMA Session's container **persists across all phases**: the repo is mounted once, `npm install` runs once, and there is no cold start per phase. This is the single strongest reason to move.
- **Native per-agent tool scoping + permission policies.** Read-only auditor, web-only architect, full-toolset builder are expressed declaratively via `agent_toolset_20260401` `default_config` / `configs` + `permission_policy`, enforced by the platform — instead of hoping a prompt keeps a phase in its lane.
- **Anthropic-hosted agent loop with real context isolation.** Each phase runs in its own context-isolated thread sharing the container FS, so artifacts pass by file (the JIT pattern) — this deletes the grep-based context-compression layer and its data-destruction risk entirely.
- **Memory stores for cross-run learning.** A workspace-scoped `memory_store` resource lets the pipeline accumulate recurring lint fixes, flaky-test notes, and prior design decisions across runs, with every mutation versioned for audit/rollback — something the stateless bash engine has no home for.
- **Structured event stream + outcomes/rubrics.** `span.model_request_end` gives exact per-phase `model_usage` for cost, `session.status_idle` `stop_reason` gives clean gate-halt semantics, and `user.define_outcome` moves the whole gate loop into a graded iterate→revise harness rather than hand-rolled retry counters.

**Honest caveat.** CMA is **beta** (`managed-agents-2026-04-01`), requires **API authentication** (not the CLI subscription the bash engine runs on today), and is a **materially bigger lift** — new environment/agent/session objects, vaults, and MCP wiring versus a single executable `run-pipeline.sh`. Position CMA as the **destination architecture**, with the already-shipped bash engine (one engine, wired routing, budget caps, HARD/SOFT gates, non-interactive halt) as the **shippable-now step** that de-risks the phase prompts and gate logic before they are lifted onto CMA.
