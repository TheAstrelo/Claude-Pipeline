# Pipeline Audit — Claude Code and Codex

**Audit date:** 2026-07-24
**Scope:** `run-pipeline.sh`, provider execution, model routing, context isolation,
tool/MCP boundaries, memory, gates, budget accounting, review, and commit safety.

## Executive conclusion

The architecture is portable. The valuable unit is not Claude-specific:

1. launch a fresh process per phase;
2. hand off only durable artifacts;
3. validate the artifact mechanically;
4. apply an orchestrator-owned gate;
5. run tests outside the model;
6. review an orchestrator-captured diff before commit.

The old engine coupled that architecture to `claude -p`. The engine now has a
provider adapter for both Claude Code and Codex while remaining one Bash
executable—no agent framework, SDK, or orchestration dependency.

Milestone 2 adds a provider-neutral durable control plane around those calls.
Every model call and release-relevant deterministic check has a hashed attempt
envelope; each run has an append-only hash-linked ledger, content-addressed
artifact snapshots, and atomic checkpoints. `--resume=RUN_ID` accepts only the
original task and an exact engine/config/Git/worktree/policy/evidence match.
`run.json` and schema-2 history are derived views. Stable prompt-prefix and
provider/model cache telemetry are observational only and never affect gates.

Milestone 3 compiles repeatable QA reasoning into deterministic checks. Phases
7, 8, and 10 now skip the provider on clean evidence and use one bounded
balanced-lane remediation only for findings or unavailable checks. Versioned,
profile-aware routing uses explicit task risk/ambiguity signals, writes the
decision to the ledger before invocation, and is release-gated by a frozen
offline corpus. The policy fixtures pass; live-provider canary evidence is still
pending.

Milestone 4 adds deterministic security and operational controls without adding
an orchestration framework. Before Phase 11, security policy `1.0` checks the
current candidate for protected files, high-confidence secret signatures,
unbounded/remote dependency sources, and escaping symlinks. A `BLOCK` prevents
the model call and is not waivable. Provider and trusted-command output is
redacted before durable use; task-derived durable labels are redacted too.
Retention is explicit and terminal-run-only. `legacy`, review-only `shadow`, and
`enforced` modes provide rollout comparison and rollback. `operations.json` and
the frozen release-SLO evaluation expose that offline controls pass while GA
remains blocked on a controlled provider canary and security approval.

“ChatGPT” is not used as a shell subprocess here. Codex CLI is the OpenAI
coding-agent surface that fits this local repository workflow. A direct
Responses API provider would be a third adapter with different authentication,
tool execution, and billing semantics; it is not required for Codex support.

## What changed

| Area | Claude Code | Codex |
|---|---|---|
| Invocation | `claude -p` | `codex exec` |
| Fresh brain | separate process + `--no-session-persistence` | separate process + `--ephemeral` |
| Strong model | `claude-opus-4-8` | `gpt-5.6-sol` |
| Balanced model | `claude-sonnet-5` | `gpt-5.6-terra` |
| Reasoning | low/medium/high | low/medium/high/xhigh |
| Read-only phases | tool allowlist without Edit/Write | `--sandbox read-only` |
| Mutating phases | scoped Edit/Write/Bash allowlist | `--sandbox workspace-write` |
| Web research | WebSearch/WebFetch only on 0 and 2 | cached web search only on 0 and 2 |
| Ambient MCP | `--strict-mcp-config` | `--ignore-user-config` when supported; warning otherwise |
| Cross-run memory | session persistence off; CLAUDE.md hierarchy may still load | memories explicitly disabled |
| Typed verdict | anchored markdown fallback | JSON Schema `{artifact, verdict}` |
| Usage | CLI-reported USD and tokens | JSONL token usage |
| Per-call cap | native hard USD cap | post-call API-price-equivalent estimate |

The engine also now:

- passes artifact paths instead of embedding full artifact bodies in later prompts;
- stores run state under the provider-neutral, ignored `.pipeline/` directory;
- captures tracked and untracked files in `review.diff` without staging;
- requires a clean baseline unless `--allow-dirty` is explicit;
- creates and verifies the run branch before Phase 6;
- refuses to fall back to committing on the caller’s branch;
- supports `--no-commit`;
- rejects unknown flags instead of silently adding them to the task;
- records provider, models, token use, and cost semantics in history;
- includes deterministic adapter smoke tests that make no model/API calls.

## Model routing

### Codex

OpenAI currently recommends GPT-5.6 Sol for complex reasoning/coding and Terra
for a balance of capability and cost. Model tier and reasoning effort are
independent, so the routing uses Sol only where the cost of a miss is highest.
The fixed phase baseline is:

| Phases | Model | Effort |
|---|---|---|
| 11 Security, 12 final review | `gpt-5.6-sol` | xhigh |
| 2 Design, 3 Adversarial | `gpt-5.6-sol` | high |
| 0 Pre-Check | `gpt-5.6-terra` | high |
| 4, 5, 6, 9 | `gpt-5.6-terra` | medium |
| 1, 7, 8, 10 | `gpt-5.6-terra` | low |

This follows the current guidance to start with the same effort and test one
level lower on representative work, rather than assuming the highest effort is
always best. See [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
and the [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Routing policy `1.0` then applies profile-aware promotions from objective,
pre-call task evidence. `fast` promotes high-risk Build and Security;
`standard` also promotes high-risk Requirements/Planning and ambiguous
Requirements/Planning; `paranoid` promotes Requirements, Planning, Drift
Detection, Build, and Security. `yolo` retains the fixed route except for
non-skippable high-risk Security. Design, Adversarial Review, and final review
remain strong in every profile.

### Claude

The behavior-preserving Claude route remains Opus 4.8 for design, adversarial
review, and final code review, with Sonnet 5 for the remaining phases. Anthropic
now also offers Fable 5 as its highest-capability generally available model, but
changing the strong lane to Fable should be eval-gated rather than assumed.
The IDs used here are fixed release IDs, not evergreen aliases. See
[Claude model IDs](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
and [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview).

## Gate integrity

The previous phrase “objective gates” overstated what was guaranteed.

There are three different strengths of evidence:

1. **Independent runtime evidence:** the orchestrator executes the project test
   command and gates on the real exit code. A model cannot rewrite that signal.
2. **Mechanical contract checks:** file existence, required headings, counts,
   typed enums, and exact verdict parsing. These prevent malformed handoffs and
   fail-open parsing.
3. **Model judgments:** architecture quality, security findings, and final code
   approval. A typed verdict makes the decision parseable; it does not make the
   judgment objectively correct.

The accurate claim is therefore: **gates are mechanically enforced and Phase 9
uses independent runtime evidence.**

Phase 6 is now displayed as a HARD gate because a blocked build should not flow
into QA. The old documentation called it NONE even though the implementation
already validated and could halt it.

## Context, sessions, and memory

The fresh-process pattern is sound, but “no memory” needs a precise definition.

- Conversation/session history is not resumed.
- Upstream phase outcomes are intentionally persisted as artifacts.
- Durable repository instructions (`CLAUDE.md` or `AGENTS.md`) can still load;
  those are desired project policy, not leaked conversational state.
- Claude Code may also load its documented user-level `~/.claude/CLAUDE.md`
  memory. `--setting-sources project` restricts settings sources; it should not
  be represented as a documented switch that disables the CLAUDE.md hierarchy.
- Codex autonomous memories and subagents are disabled inside each pipeline
  child so a phase cannot import unrelated cross-run context or create hidden
  child work.
- Claude uses project settings only and disables session persistence.

Autonomous cross-run memory is not enabled. For a deterministic delivery
pipeline, unreviewed memory can preserve stale facts, poison later decisions,
or leak sensitive content. If cross-run learning is added, use a small
human-reviewed fact ledger, never secrets, and expose it only to Pre-Check and
Design.

Passing paths instead of bodies is the right just-in-time context pattern:
phases read the artifact they need from disk, prompts stay lean, and no lossy
“summary” silently deletes requirements.

## Tools and MCP

Claude Code exposes the exact control this engine originally described:
`--tools`, allowed tools, and `--strict-mcp-config`. Reports are now returned in
the final response, so read-only phases no longer need Write merely to create
their artifact. See the [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage).

Codex CLI does not currently expose a per-tool allowlist on `codex exec`.
Authority is enforced with:

- `read-only` versus `workspace-write` sandboxes;
- web search disabled outside research phases;
- subagents and memories disabled;
- `approval_policy="never"` inside the selected sandbox;
- `--ignore-user-config` when the installed CLI supports it.

The locally installed Codex CLI (0.104.0 during this audit) does not expose
`--ignore-user-config`, so the engine warns that ambient MCP/config cannot be
fully excluded. Upgrade the CLI before treating Codex runs as strictly
hermetic. Current Codex non-interactive guidance documents ephemeral runs,
sandbox selection, JSONL events, final-message output, and structured output:
[Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

## Cost and budget semantics

Claude Code’s `--max-budget-usd` is a native per-call stop and its JSON result
contains `total_cost_usd`.

Codex CLI emits token usage in `turn.completed`, but it does not expose a
native per-call USD cap. The engine estimates:

```text
uncached input × input rate
+ cached input × cached rate
+ output × output rate
```

using the current GPT-5.6 Sol/Terra/Luna API prices. This is:

- an API-price-equivalent estimate, not ChatGPT subscription billing;
- enforced only after a call finishes;
- incomplete for separate tool-call charges;
- unavailable for an overridden model not in the engine’s price table.

The run cap still halts between phases. Do not describe Codex’s cap as a hard
in-flight spend limit.

Anthropic’s newer task budgets do not change this engine: the feature is not
supported on Claude Code, and it is advisory at the model loop level. See
[Anthropic task budgets](https://platform.claude.com/docs/en/build-with-claude/task-budgets).

## Multi-agent coordination and outcomes

The engine deliberately disables nested multi-agent work. The process boundary
is its isolation primitive; allowing a phase to spawn hidden children would
weaken budget accounting, tool policy, and traceability. Phase 3 currently
applies three critic perspectives in one clean process—it is not three actual
agents.

Parallel critics can be evaluated later, but only with an acceptance suite that
compares finding recall, false positives, latency, tokens, and gate stability.
The same applies to changing model tiers or effort.

The artifact directory is the outcome ledger:

- phase report;
- redacted provider events;
- redacted stderr;
- typed verdict sidecar where available;
- real test output and a machine-written `test-exit-code.txt`;
- exact review diff plus hash;
- provider/model/token/cost metadata in history.
- versioned routing decisions and deterministic QA evidence in the ledger and
  derived run summary.
- deterministic security evidence, release-verification events, retention
  actions, and a derived operational dashboard.

## Remaining gaps

1. **No Bash-owned per-step Phase 6 retry.** The builder may self-correct, but
   the documented “retry each failed plan step twice” loop is not implemented by
   the orchestrator.
2. **Claude typed verdicts remain disabled.** Anchored parsing is robust but not
   schema-constrained on the Claude path.
3. **Strict hermeticity is incomplete.** Codex needs a newer CLI with
   `--ignore-user-config`.
   Claude Code can still load user-level CLAUDE.md memory; the engine does not
   relocate the authenticated Claude home.
4. **Broad SAST and vulnerability-database coverage is not automatic.** The
   built-in scanners cover protected paths, high-confidence secrets, remote or
   unbounded dependency sources, and escaping symlinks. Project-specific SAST,
   dependency-CVE, and license scanners still need trusted adapters.
5. **Test-command detection is intentionally small.** Projects with custom
   build systems should expose a trusted command through their repository
   setup.
6. **No in-flight Codex dollar stop.** Only post-call estimates and between-phase
   caps are possible through the current CLI.
7. **The interactive helper agents are not the engine.** Some existing
   `.codex/agents/` and `.agents/skills/` files contain RDO-specific conventions;
   they should not be advertised as generic pipeline behavior.
8. **Adaptive routing evidence is offline.** The frozen corpus validates policy
   logic and call boundaries, not live model quality. Cost and latency use
   relative units until a controlled provider canary supplies production data.
9. **The deterministic docs scan is conservative.** It detects common route
   shapes and documentation markers; the frozen final verification and Phase 11
   security review remain the authoritative release controls.
10. **GA evidence is still incomplete.** Offline release-SLO fixtures pass and
    rollback is tested, but `release-slo-report.v1.json` intentionally records
    `liveProviderCanary: false` and `gaEligible: false`.

## Verification

Validation performed without paid model calls:

```bash
bash -n run-pipeline.sh
bash tests/smoke-provider-adapters.sh
bash tests/deterministic-first-smoke.sh
bash tests/milestone-2-smoke.sh
bash tests/milestone-3-smoke.sh
bash tests/milestone-4-smoke.sh
node tests/evaluate-routing-policy.js \
  evals/routing-corpus.v1.json \
  evals/routing-eval-report.v1.json
node tests/evaluate-release-slos.js \
  evals/release-slo-corpus.v1.json \
  evals/release-slo-report.v1.json
```

The suites run mocked Claude and Codex adapters, including a full standard Codex
profile, and verify artifact contracts, append behavior, typed verdicts, gates,
final review, durable resume, deterministic clean paths, and adaptive-routing
thresholds, scanner non-waiver, redaction, retention, rollout rollback, and
release SLOs without paid provider calls.
