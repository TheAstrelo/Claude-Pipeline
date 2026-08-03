# Interactive agents (helpers, not the engine)

These agents back the per-phase slash commands (`/design`, `/ar`,
`/security-review`, …) when you run them interactively in Claude Code. **The
pipeline engine (`run-pipeline.sh`) does not use them** — it inlines every
phase prompt in `build_prompt()`. Editing an agent changes the interactive
helper only, never engine behavior.

**Reference-project content.** Several of these prompts were written for the
specific app the pipeline was extracted from (a Next.js + PostgreSQL SaaS
called "RDO") and still name its tables, imports, and UI conventions as
examples. Treat those as *illustrations of shape*, not rules for your
project. Your real conventions belong in `.claude/rules/*.md`
(see `examples/reference-project-rules/` for a worked example). If you copy
`.claude/` into another project and use these agents interactively, adjust
the project-specific references first.
