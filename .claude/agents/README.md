# Interactive agents (helpers, not the engine)

Three agents back the interactive slash commands that remain
(`/plan-review` → `planner` + `plan-reviewer`; `/pipeline-scan` →
`code-scanner`). **The pipeline engine (`run-pipeline.sh`) does not use
them** — it inlines every phase prompt in `build_prompt()`. Editing an agent
changes the interactive helper only, never engine behavior.

They are project-agnostic: each learns the repository's stack and
conventions from `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, and the code
itself, and none pins a model (they inherit the session's). A worked example
of convention files lives in `docs/examples/reference-project-rules/`.

The per-phase ladder (`/arm`, `/design`, `/ar`, `/plan`, `/pmatch`,
`/build`, the QA and security commands) and its twelve agents were removed
in Implementation Plan v2, Milestone 0: they had drifted from the engine's
contracts (artifact directory, verdict tokens, BLOCKER lane, attestations)
and carried another project's conventions. Milestone 6 regenerates any
in-session helpers from the engine's role definitions so they cannot drift.
