# Claude-Pipeline: Improvement Plan

**Date:** 2026-07-16 · **Companion to:** [AUDIT-FABLE.md](AUDIT-FABLE.md) — every "today" claim below is evidenced there.
**Decisions already made:** No Haiku anywhere (settled — Sonnet 5 is the floor, effort is the dial). API key for pipeline runs, not a Pro/Max subscription. Two modes, one codebase of prompts: **Local mode** (Claude Code, one session + subagents) and **Autonomous mode** (Claude Managed Agents).

---

## 0. Design principles (the frameworks, applied)

| Framework | How this plan applies it |
|---|---|
| **Four primitives** (Agent / Environment / Session / Events) | Phase personas become *versioned agent definitions* (one source of truth — kills the three-way prompt drift). The environment declares tools + network per phase (replaces `--dangerously-skip-permissions`). A *session* holds run state (replaces bash variables that evaporate between tool calls, `checkpoint.log`, and the resume logic that never worked). *Events* become the spine: progress, per-phase cost, notifications, and human gates come from the event stream, not from grepping files. |
| **Agentic loop** (reason → tool → result → repeat) | Each phase is an agent *with tools and a done-when contract*, not a one-shot prompt. Verification is tool-grounded (exit codes, real test runs). Failure feeds back as re-gathered context, never a blind re-prompt. |
| **Tools & skills** | Server tools: web search + web fetch (Phases 0/2), code execution (CMA sandbox = where builds/tests actually run). Client tools: bash + text editor (build), memory (learning), computer use (Phase 9 web-UI verification only). Rules become path-scoped skills (JIT conventions). |
| **Memory** | The Phase-12/AGENTS.md idea is kept; the `sed -i` implementation is replaced by a memory directory (local) / memory store (CMA — auto-injects the "check memory" note into the system prompt). |
| **Four context patterns** | Prompt caching: one session per run so the ~41K prefix is written once, not 15× (measured today: zero cross-subprocess reuse). Server-side compaction replaces the lossy `compress_*` greps. JIT: artifacts pass by *path*, agents Read what they need. Context editing: clear spent tool results during the long build phase. |
| **Extended thinking** | Adaptive thinking + per-phase `effort`. High where there is multi-step logic and tradeoffs (design, critics, security, debugging); low on extraction/formatting; `max` nowhere. |

**Prerequisites:** upgrade the Claude Code CLI (installed v2.1.50 caps `--effort` at `high|max`; current CLIs add `xhigh`). Install `jq` or remove all jq dependencies (plan removes them). Set `ANTHROPIC_API_KEY` for autonomous/CI runs.

---

## 1. Sequence of work

### Step 1 — Correctness: make one run possible *(~1 day, do first, no exceptions)*

These are the audit's §6a items; listed here so this doc is self-contained. Nothing in Steps 2–4 is testable until a run completes.

1. **Delete `--max-tokens N`** from all 17 invocation sites in `auto-pipeline.md` (`:1052, :1157, :1241, :1328, :1373, :1418, :1498, :1527, :1603, :1684, :1710, :1802, :1896, :1938, :1978, :2011, :2157`) and the Token Budgets section (`:2300-2317`). Output length is enforced by the `## OUTPUT CONSTRAINTS` blocks already written in `.claude/prompts/*.md`.
2. **Unset the nesting guard**: every child invocation becomes `env -u CLAUDECODE claude -p …` (verified working) — interim measure until Step 2 removes child processes entirely.
3. **Fix the retry kill**: `run-pipeline.sh:863` and `:903` — `((retries++))` → `retries=$((retries + 1))`.
4. **Fix the `[r]evise` self-destruct**: `run-pipeline.sh:844` — call `run_gate` in a condition (`if ! run_gate "$phase"; then …re-run…; fi`) so errexit can't kill the run; implement the actual re-run branch.
5. **Un-swallow the validators**: `log_pass`/`log_fail` (`run-pipeline.sh:174-187`) write display lines to stderr; counts return on stdout's final line. Delete `t.sh`, `fwd.sh`.
6. **Delete the `.raw`-promotion fallback** (18 sites + `run-pipeline.sh:231-235`) and add exit-code checks on every child invocation. A phase that wrote no artifact **failed**.
7. **Fix Phase 11's gate**: own artifact (`security-report.md`), anchored verdict greps, FAIL-severity validators — interim until Step 2's typed outputs make this moot.
8. **Fail-closed hooks**: rewrite `protect-files.sh` without jq (node is present), fail closed on parse failure, normalize `\`→`/`, anchor patterns on path segments, add a `Bash` matcher.
9. **Installer nesting bug**: `install.sh:121` → `cp -r "$source_dir/." "$target_dir/"`. Delete `.claude/.claude/`.
10. **Docs triage**: fix `--yolo`→`--profile=yolo`, delete the 12 phantom flags, pick one cost number (or none until measured), fix the routing sentence, remove/satisfy the LICENSE badge.

**Acceptance test for Step 1:** one end-to-end run against `demo/starter-project` completes; every artifact exists; `history.json` records run #1.

### Step 2 — Collapse to one session + subagents *(the architectural move; a few days)*

Delete subprocess-per-phase. One orchestrating Claude Code session runs the pipeline; each phase is a **subagent** per the matrix in §2. What this single change buys, mostly by deletion:

- **Prompt caching becomes real**: the harness prefix is written once per run instead of 15× (~$0.62–2.30/run of measured waste eliminated).
- **State becomes real**: `$TASK`, profile, skip-lists, phase status live in the orchestrator's context — the entire checkpointing subsystem, `restore_phase_context`, and the fictional cache-metrics/compression layers are deleted.
- **Gates become typed**: each subagent returns a JSON verdict per the schemas in §2; the orchestrator validates structure + runs the objective checks (file-exists, exit codes). No more vocabulary greps that punish honest reports.
- **Tool scoping becomes real**: per-agent `tools:` frontmatter replaces `--dangerously-skip-permissions` (PIPELINE-SPEC's tables, finally enforced).
- **The revision loops re-gather**: see §2.1.

Orchestrator contract (replaces the 2,417-line bash-in-markdown): a ~200-line command file that (a) resolves profile/flags, (b) dispatches phase subagents in order with artifact *paths*, (c) validates each returned verdict object, (d) runs the objective gate checks itself (`test -f`, `$TEST_COMMAND; $?`, `git diff --stat`), (e) pauses for the human on HARD-gate failure with the NEEDS_HUMAN contract, (f) appends one line per phase to `history.json`.

Keep `run-pipeline.sh` (post-Step-1 fixes, plus `--model`/`--effort` flags copied from `codex-pipeline.sh:44-73`) as the headless CI fallback only.

### Step 3 — Skills, memory, hooks *(an afternoon each)*

- **Rules → path-scoped skills** (§4). Delete the keyword-grep injection (`auto-pipeline.md:84-133`).
- **Memory** (§5): memory directory + orchestrator instruction; Phase 13 (Learning) writes it via tool calls, not `sed`.
- **Hooks** (§6): all four use cases — format, compliance log, dangerous-op block, per-stage notify.
- **`disable-model-invocation: true`** on `/build`, `/auto-pipeline`, `/pipeline-undo`, `/cache-clear`.
- **New Phase 12 — Commit**: branch → `code-reviewer` subagent on the real diff with brief criteria → HARD gate → commit → optional `gh pr create`. (Renumber Learning to 13.)

### Step 4 — Autonomous mode on Managed Agents *(the end-state for "auto"; §3)*

Version-controlled agent + environment YAMLs applied with the `ant` CLI; one CMA session per run with the repo mounted; kickoff via `user.define_outcome` with Phase 1's success criteria as the rubric; events drive notifications and a rebuilt pipeline-viz; memory store attached. Scheduled runs via a deployment.

---

## 2. Per-phase agent / tool / effort matrix

Applies to both modes. **Model column is final: no Haiku.** Effort applies directly in local mode (subagent/CLI); in CMA, effort is not currently an agent-config field — encode the intent via model choice + system-prompt guidance there (see §3 note). "Objective gate" = a check the orchestrator runs itself; the agent's own verdict is *input* to the gate, never the gate.

| # | Phase | Agent (source file) | Model | Effort | Thinking | Tools | Inputs (JIT — paths, not contents) | Returns (typed) | Objective gate (orchestrator-run) |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Pre-Check | `pre-check` | Sonnet 5 | medium | adaptive | Read, Grep, Glob, WebSearch | task; `detect-project` output | `{recommendation: EXTEND\|USE_LIBRARY\|BUILD_NEW\|NEEDS_HUMAN, matches[], triage{complexity, risk, profile}}` | HARD: schema-valid; `matches[].path` values exist on disk (`test -f`) |
| 1 | Requirements | `requirements-crystallizer` | Sonnet 5 | low | off | Read, Grep, Glob | task; `pre-check.json` path | `{verdict, problem, criteria[{id, text, testable_via}], scope{in,out}, assumptions[]}` | HARD on `NEEDS_INPUT`; SOFT: every criterion has `testable_via` |
| 2 | Design | `architect` | **Opus 4.8** | **high** | **adaptive on** | Read, Grep, Glob, WebSearch, WebFetch | `brief.json` path; relevant skills auto-load | `{verdict, decisions[{choice, rationale, source}], components[], data_changes, risks[]}` | HARD on `NEEDS_RESEARCH`; schema: `source` required & non-empty per decision; orchestrator spot-checks `file:line` sources exist |
| 3a | Critics ×3 (architect / skeptic / implementer lenses) | `adversarial-coordinator` prompts, split | **Opus 4.8** | **high** | **adaptive on** | Read, Grep, Glob | `design.json` path **+ repo access** (critics may read actual code, which today they can't) | `{findings[{severity, target, issue, fix}], top_concern}` ×3 | all three returned schema-valid |
| 3b | Aggregator | `adversarial-coordinator` | Sonnet 5 | medium | adaptive | Read | 3 critic outputs | `{verdict: APPROVED\|REVISE_DESIGN, issues[], consensus[], blocks[]}` | HARD: verdict==APPROVED or → revision loop (§2.1, max 2) |
| 4 | Planning | `atomic-planner` | Sonnet 5 | medium | adaptive | Read, Grep, Glob, Bash | `design.json`, `critique.json` paths | `{verdict, steps[{n, file, action: MODIFY\|CREATE, before, after, test}]}` | HARD: ≥1 step; every MODIFY `file` exists (`test -f` — orchestrator, not the model); ≤8 steps SOFT |
| 5 | Drift | `drift-detector` | Sonnet 5 | low | off | Read | `brief.json`, `plan.json` paths | `{verdict, matrix[{criterion_id, step_n\|null}], coverage_pct, scope_creep[]}` | SOFT: coverage ≥90% or → plan revision (max 1) |
| 6 | Build | `builder` | Sonnet 5 | medium (**xhigh** on hard tasks) | adaptive | Read, Edit, Write, Bash, Glob, Grep | full `plan.json`; skills auto-load | `{verdict, steps[{n, status, notes}], files_changed[]}` — **per-step loop, retry ≤2/step with error context** (the loop every doc promises and no code has) | **HARD: orchestrator runs `$BUILD_COMMAND` and `$TEST_COMMAND` itself; gates on exit codes.** `files_changed` cross-checked against `git diff --name-only` |
| 7 | Denoise | `denoiser` | Sonnet 5 | low | off | Read, Edit, Grep, Glob, Bash | `git diff --name-only` output (objective scope) | `{files[], removals[{file, count, kinds}]}` | NONE; orchestrator re-runs tests after edits (exit code) |
| 8 | Fit | `quality-fit` | Sonnet 5 | low | off | Read, Bash, Grep | changed-files list | `{lint: {exit, violations[]}, types: {exit, errors[]}, fixes[]}` | NONE→SOFT: lint/tsc **exit codes** captured by orchestrator |
| 9 | Behavior | `quality-behavior` | Sonnet 5 | medium | adaptive | Read, Bash (+ browser MCP for web UI) | changed files, **`brief.json` criteria** (today Phases 7-11 never see them), test output | `{criteria[{id, status: PASS\|FAIL\|UNVERIFIABLE, evidence}]}` | HARD-able: every Phase-1 criterion has a status; PASS requires `evidence` referencing a real run — **this closes the EPCC trace** |
| 10 | Docs | `quality-docs` | Sonnet 5 | low | off | Read, Grep, Glob, Edit | changed-files list | `{routes[{path, documented}], missing[]}` | SOFT: required-doc grep on route files |
| 11 | Security | `security-auditor` | Sonnet 5 | **high** | **adaptive on** | Read, Grep, Glob, Bash | changed-files list + diff | `{findings[{type, file, line, severity: CRITICAL\|HIGH\|MEDIUM\|LOW, fix}], verdict: PASS\|FAIL\|CRITICAL}` → own `security-report.json` | HARD: `verdict` field (typed, not grepped); CRITICAL always pauses; FAIL pauses outside yolo. Enforcement backstop = PreToolUse deny rules (§6), which a model cannot talk past |
| 12 | **Commit** (new) | `code-reviewer` | Sonnet 5 | high | adaptive | Read, Grep, Glob, Bash (git) | **real diff** (`git diff main...`), `brief.json` criteria | `{verdict: APPROVE\|REQUEST_CHANGES, comments[]}` | HARD on verdict; then `git checkout -b pipeline/<session>` → commit (never `git add -A`) → optional `gh pr create` |
| 13 | Learning | (orchestrator + memory tool) | Sonnet 5 | low | off | memory dir (Read/Write) | run artifacts | memory entries (§5) | NONE |

**Cross-cutting rows:** revision loops (3→2, 5→4, per-step 6) always re-inject the brief + rules + the upstream validator set, and re-run the *upstream* phase's gate on the revised artifact (today's loops silently drop the citation mandate and never re-validate). `max` effort nowhere. Fable 5 nowhere in the loop (interactive design sessions only, if ever).

### 2.1 Revision-loop contract (the re-gather rule)

```
on REVISE_DESIGN (max 2):
  context = design.json + critique.json + brief.json + relevant skills
          + instruction: "Re-read every file the critique names before revising."
  re-run Phase 2 agent → re-run Phase 2 gate (sources present!) → re-run Phase 3
on DRIFT (max 1):
  context = plan.json + drift.json + brief.json  → re-run Phase 4 gate → re-run Phase 5
on build step failure (max 2/step):
  context = step + verbatim error output + the file's current content (fresh Read)
```

---

## 3. Autonomous mode — CMA sketches

Control plane = version-controlled YAML applied with the `ant` CLI (create once, store IDs; update with `--version N`). Data plane = your runner script creating sessions. All YAML below uses the documented field names (beta `managed-agents-2026-04-01`, which the SDK/CLI set automatically).

> **Effort note:** agent config takes `model` (string or `{id, speed}`); a per-agent `effort` field is not part of the CMA agent object as of 2026-07. Encode the §2 effort intent here through model choice and system-prompt guidance ("think through tradeoffs before deciding" on design/critics; "respond directly, no exploration" on low-effort personas). Revisit when effort lands in agent config.

### 3.1 Environment — `pipeline.environment.yaml`

```yaml
name: claude-pipeline-env
description: Sandbox for pipeline runs. Package managers allowed; egress limited to docs.
config:
  type: cloud
  networking:
    type: limited
    allow_package_managers: true   # npm install in the sandbox
    allow_mcp_servers: true        # reach declared MCP servers without listing hosts
    allowed_hosts:
      - platform.claude.com        # Phase 2 citation targets
      - "*.github.com"
```

```sh
ENV_ID=$(ant beta:environments create < pipeline.environment.yaml --transform id -r)
```

### 3.2 Phase agents — one YAML per persona (source of truth; local subagent files are generated from these)

`architect.agent.yaml` (Phase 2 — the strong-model design persona):

```yaml
name: pipeline-architect
description: Phase 2 design agent. Produces sourced technical designs.
model: claude-opus-4-8
system: |
  You are the Architect agent for a 12-phase development pipeline.
  Read the requirements brief at the path given in the kickoff message.
  Every design decision MUST cite a source: a live documentation URL
  (use web_fetch/web_search) or an existing repo file:line.
  No source => verdict NEEDS_RESEARCH. Never invent a citation.
  Write design.json to /mnt/session/outputs/ using the schema in your brief.
  Think through tradeoffs before committing to a decision.
tools:
  - type: agent_toolset_20260401
    default_config: { enabled: true }
    configs:
      - name: edit                          # design phase reads; it does not modify the repo
        enabled: false
      - name: write
        enabled: true                       # needed for /mnt/session/outputs
```

`builder.agent.yaml` (Phase 6 — the only repo-mutating persona, gated bash):

```yaml
name: pipeline-builder
description: Phase 6 builder. Executes the plan step-by-step with per-step retry.
model: claude-sonnet-5
system: |
  Execute plan.json exactly — the plan is law; no improvisation.
  Per step: fresh-Read the target file, verify BEFORE matches, apply AFTER,
  run the step's test. On failure, retry with the verbatim error (max 2),
  then mark the step BLOCKED and continue reporting.
  After all steps: run the project's build and test commands and report
  their exit codes verbatim. Write build-report.json to /mnt/session/outputs/.
tools:
  - type: agent_toolset_20260401
    default_config: { enabled: true }
    configs:
      - name: bash
        permission_policy: { type: always_ask }   # HARD-gate primitive: session idles
                                                  # until the runner sends tool_confirmation
```

Coordinator (maps the pipeline onto CMA's multiagent primitive — one session, phase agents as roster threads):

```yaml
name: pipeline-coordinator
description: Orchestrates the 12-phase pipeline by delegating to phase agents.
model: claude-sonnet-5
system: |
  Run phases in order: pre-check -> requirements -> design -> adversarial(x3+aggregate)
  -> plan -> drift -> build -> denoise -> fit -> behavior -> docs -> security -> commit-review.
  Delegate each phase to its roster agent with the artifact PATHS it needs (never paste
  artifact contents). Gate between phases on the typed verdict in each agent's output
  plus the objective checks (files exist, exit codes). On HARD-gate failure, stop and
  report — the outcome grader and the human decide, not you.
  Check the memory mount before starting; write new lessons to it before finishing.
tools:
  - type: agent_toolset_20260401
multiagent:
  type: coordinator
  agents:
    - pipeline-precheck        # store real agent_... IDs here after `ant beta:agents create`
    - pipeline-requirements
    - pipeline-architect
    - pipeline-critic          # spawned 3x with different lens instructions
    - pipeline-planner
    - pipeline-drift
    - pipeline-builder
    - pipeline-qa              # denoise/fit/behavior/docs as one QA persona or four
    - pipeline-security
    - pipeline-reviewer
```

```sh
for f in *.agent.yaml; do ant beta:agents create < "$f" --transform '{id,name}' --format jsonl; done
# CI sync on change:  ant beta:agents update --agent-id "$ID" --version "$V" < architect.agent.yaml
```

### 3.3 Memory store (once per project)

```sh
MEM_ID=$(ant beta:memory-stores create \
  --name "pipeline-memory" \
  --description "Lessons from prior pipeline runs: resolved design issues, build failure fixes, security patterns, project conventions. Check before starting any phase." \
  --transform id -r)
```

The description is written *for the model* — CMA auto-injects the mount note into the system prompt, which is exactly the "tell it to check memory before work" behavior wanted, with zero prompt plumbing.

### 3.4 Session per run + outcome kickoff (the runner, data plane)

```python
session = client.beta.sessions.create(
    agent=COORDINATOR_ID,                       # or {"type":"agent","id":...,"version":N} to pin
    environment_id=ENV_ID,
    title=f"pipeline: {task[:60]}",
    resources=[
        {   # the repo the pipeline works on
            "type": "github_repository",
            "url": "https://github.com/you/your-app",
            "mount_path": "/workspace/repo",
            "authorization_token": os.environ["GITHUB_TOKEN"],   # Contents: R/W for push
            "checkout": {"type": "branch", "name": "main"},
        },
        {   # cross-run learning (§5)
            "type": "memory_store",
            "memory_store_id": MEM_ID,
            "access": "read_write",
            "instructions": "Prior-run lessons. Check before pre-check and design; append after security passes.",
        },
    ],
    vault_ids=[VAULT_ID],                        # GitHub MCP credential for PR creation
)

# THE LOOP, AS A PLATFORM PRIMITIVE: Phase 1's success criteria ARE the rubric.
# The independent grader iterates the session until the rubric passes or max_iterations.
client.beta.sessions.events.send(session_id=session.id, events=[{
    "type": "user.define_outcome",
    "description": task,
    "rubric": {"type": "text", "content": render_rubric(brief["criteria"])},
    #   e.g. "1. GET /health returns 200 with {status:'ok'} — verified by a passing test
    #         2. All existing tests still pass (exit code 0)
    #         3. No new lint errors ..."
    "max_iterations": 5,
}])
```

Runner event loop (replaces gate bash, notify wiring, and pipeline-viz's dead file-watch):

```python
with client.beta.sessions.events.stream(session_id=session.id) as stream:   # stream first, then send
    for ev in stream:
        if ev.type == "span.model_request_end":
            record_cost(ev.model_usage)                     # real per-phase tokens — the metrics
                                                            # the old cache-metrics.log faked
        elif ev.type == "agent.tool_use" and ev.evaluated_permission == "ask":
            decision = hard_gate_review(ev)                 # your HARD gate: human or policy
            client.beta.sessions.events.send(session_id=session.id, events=[{
                "type": "user.tool_confirmation", "tool_use_id": ev.id,
                "result": "allow" if decision else "deny",
                **({} if decision else {"deny_message": "HARD gate: revise per critique."}),
            }])
        elif ev.type == "span.outcome_evaluation_end":
            notify("Pipeline", f"iteration {ev.iteration}: {ev.result}")     # your ask #4
        elif ev.type == "session.status_idle" and ev.stop_reason.type != "requires_action":
            break                                            # end_turn / retries_exhausted

# artifacts: client.beta.files.list(scope_id=session.id, betas=["managed-agents-2026-04-01"])
# console trace: https://platform.claude.com/workspaces/<ws>/sessions/{session.id}
```

Scheduled autonomous runs (nightly debt-burn, etc.): `deployments.create` with the same agent/environment plus `schedule: {type: cron, expression: "0 2 * * *", timezone: ...}` and the kickoff in `initial_events`.

**Why this mode wins for "auto":** sessions bring compaction, prompt caching, resume, and the event stream natively — the checkpoint system, the fictional caching layer, the compression layer, and the viz's dead file-watcher all stop existing rather than getting fixed. The grader loop is the verify→re-gather loop the audit graded F, delivered as a primitive.

---

## 4. Skills (JIT conventions; replaces keyword-grep rule injection)

Decision rule: **command** = workflow a human triggers · **skill** = knowledge/capability the model pulls when relevant · **subagent** = isolated context + different tools/model.

```
.claude/skills/
  api-conventions/SKILL.md        # from rules/api.md      — loads when touching src/pages/api/**
  db-conventions/SKILL.md         # from rules/database.md — loads on **/migrations/**, *.sql
  react-conventions/SKILL.md      # from rules/react.md    — loads on **/*.tsx
  new-migration/SKILL.md          # keep; re-point paths at detect-project output
  scaffold-api/SKILL.md           # keep; same
  run-tests/SKILL.md              # wraps detect-project's TEST_COMMAND; used by phases 6/8/9
  commit-and-pr/SKILL.md          # Phase 12 procedure
```

Frontmatter sketch (`api-conventions/SKILL.md`):

```yaml
---
name: api-conventions
description: Project API route conventions (auth middleware, handler shape, Swagger).
  Use when creating or modifying files under src/pages/api/ or API handlers.
---
```

De-RDO the bodies (parameterize from `detect-project.sh` output); ship the RDO originals as `examples/`. Add `disable-model-invocation: true` to `/build`, `/auto-pipeline`, `/pipeline-undo`, `/cache-clear` — a pipeline whose gates the model can bypass by self-invoking `/build` has no gates. In CMA, the same three convention skills upload once via the Skills API and attach to agents as `{type: custom, skill_id: ...}`.

---

## 5. Memory (Phase 13, done right)

Layout (local: a directory; CMA: the memory store — same files):

```
memory/
  patterns.md      # design decisions that held up (1 lesson per entry, dated, why it mattered)
  failures.md      # build/test failures + the fix that worked
  security.md      # findings + mitigations
  conventions.md   # discovered project rules not in the repo docs
```

Rules injected once into the orchestrator/coordinator system prompt (CMA injects the mount note automatically; local adds one line to the orchestrator command): *"Check memory/ before Phase 0 and Phase 2; append lessons after Phase 11 passes. One lesson per entry; update rather than duplicate; delete entries proven wrong; never store secrets."*

Writer: Phase 13 uses memory-tool calls (local: `memory_20250818` backend on the repo filesystem; CMA: writes to the mount) — replacing five GNU-only `sed -i` calls against a template whose anchors don't all exist (`auto-pipeline.md:2219-2287`). Honest expectation: this is primarily a *quality* compounder (run N+1 doesn't repeat run N's mistake); the token win is real but second-order to §1's caching fix.

---

## 6. Hooks (all four asks) — `settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|NotebookEdit",
        "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.sh\"", "timeout": 10 }] },
      { "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/log-commands.sh\" pre", "timeout": 10 },
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.sh\"", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/log-commands.sh\" post", "timeout": 10 }] },
      { "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/auto-format.sh\"", "timeout": 30 }] }
    ],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/notify.sh\" \"Pipeline\" \"Phase complete\"", "timeout": 15 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/notify.sh\" \"Pipeline\" \"Subagent done\"",  "timeout": 15 }] }]
  }
}
```

- **guard-bash.sh** (ask #3): deny-list `rm -rf /`, `rm -rf .git`, `git push --force`, `git reset --hard`, `curl … | sh`, `> .env`, `chmod 777`; exit 2 + stderr reason. Careful not to over-match redirects — the pipeline's own tooling uses them.
- **log-commands.sh** (ask #2): append the raw hook JSON to `.claude/logs/commands.jsonl` — it already carries session id, cwd, command, and (post) output; pre/post delta = blocked/failed attempts for free. Add `.claude/logs/` + `.claude/artifacts/` to a new `.gitignore`.
- **auto-format.sh** (ask #1): detect the *project's* formatter (prettier/biome config present?); if none, exit 0 and impose nothing. No jq; parse stdin with node.
- **notify.sh** (ask #4): already correct and tested — this wiring is the whole fix. In CMA mode, notification moves to the event stream / webhooks (§3.4) instead.
- protect-files.sh: fail-closed rewrite per Step 1.8. PreToolUse denies are the one enforcement layer a model cannot talk past — they, not the Phase 11 prompt, are the security *floor*.

---

## 7. What gets deleted (net-negative diff, on purpose)

| Delete | Replaced by |
|---|---|
| `auto-pipeline.md` bash pseudo-implementation (~2,000 of 2,417 lines) | ~200-line orchestrator command + §2 matrix |
| Prompt-caching subsystem (`:349-565`) + cache-metrics reporting | Real caching via one session (§1 Step 2); real usage via `span.model_request_end` (CMA) / `--output-format json` (CI) |
| Compression layer (`:568-680`) | Artifact paths + JIT Reads; server-side compaction on long runs |
| Checkpoint/resume subsystem (`:137-323`) | Session state (local: orchestrator context; CMA: native resume) |
| `--batch-qa` block (`:2087-2108`) | Batch API in the CI path only, via raw Messages calls if ever needed |
| Confidence-gate bash (`:900-964`) + `## Confidence: [0-100]` headers (13 agents) | Typed verdicts + NEEDS_HUMAN escalation (kept — it's good) |
| `dev-pipeline.md`, `.claude/.claude/` fossil, `t.sh`, `fwd.sh` | `--mode=dev` = orchestrator pauses after each phase |
| `.claude/prompts/` (14 files) | Merged into agent definitions (keep their `## OUTPUT CONSTRAINTS` blocks — best-of-three) |
| 27 orphan agents (incl. both frontmatter-less ones) | 12-15 wired personas from §2; slims deleted (effort replaces the slim/full split); `agentMapping`/`slimAgents` keys dropped |
| `pipeline-undo.md` (reads files nothing writes) | Phase 12 branch-per-run = native undo (`git branch -D`) |
| `pipeline-viz` file-watcher + 20-phase `PHASE_META` | Event-stream consumer (§3.4) — or the CMA console trace URL, free |
| `cache.sh` + cache commands + invented "tokens saved" constants | Nothing. Real caching needs no ledger. |

---

## 8. Cost model, before/after (per run; measured constants from the audit)

| Configuration | Bootstrap overhead | Phase work | ≈ Per run |
|---|---|---|---|
| Today's design *if it ran* (13 Haiku + 2 Sonnet subprocesses) | ~$0.97 (15 × 41K cache-write, zero reuse — measured) | ~$0.25 | ~$1.20 |
| §2 matrix on subprocess-per-phase (no-Haiku, 4 Opus calls) | ~$2.15 | ~$0.90 | ~$3.00 |
| **§2 matrix on one session + subagents (Step 2)** | ~$0.15–0.30 (prefix written once) | ~$0.90 | **~$1.10–1.30** |
| CMA session (native caching/compaction) | comparable to Step 2 | ~$0.90 | ~$1.10–1.50 |

The architecture change funds the model upgrade: recommended-quality models (Sonnet 5 + Opus where it counts) at roughly the price the old design paid for Haiku. Sonnet 5 intro pricing ends **2026-08-31** (+~50% after); re-baseline then.

---

## 9. Acceptance criteria for this plan

1. One command runs the demo task end-to-end; `history.json` gains a run record with real per-phase token counts.
2. Every gate decision traceable to a typed verdict + an objective check (exit code / file-exists / diff-list) — zero vocabulary greps remain.
3. Phase 1 criteria appear, per-criterion, in Phase 9's output with evidence, and in Phase 12's review context.
4. Killing the run mid-Phase-6 and resuming loses no completed phase (local: orchestrator state; CMA: session resume).
5. A deliberately planted `eval(userInput)` in a test task is caught at Phase 11 **and** a `git push --force` attempt is blocked by the Bash guard hook.
6. Second run on the same repo consults memory (observable: pre-check cites a prior-run lesson).
7. All four hook use cases observably fire (format diff, `commands.jsonl` lines, blocked command, toast per phase).
