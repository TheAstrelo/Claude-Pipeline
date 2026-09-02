# AGENTS.md

Codex reads this file; Claude Code reads `CLAUDE.md`. They describe the same
engine, so this file is a pointer, not a copy — two 20 KB descriptions of one
script drift.

- Engine, commands, phases, gates, flags, and environment knobs: **`CLAUDE.md`**.
- The portable, vendor-independent contract (roles, workspace, phases,
  evidence, executor adapters): **`PIPELINE-SPEC.md`**.
- Roadmap: **`IMPLEMENTATION-PLAN-V2.md`**. Superseded plans and audits:
  `docs/archive/`.
- Run it: `bash run-pipeline.sh --provider=codex "task"`.
- Codex production runs require `--ignore-user-config`; a repository
  `.codex/config.toml` is rejected for auto-commit runs (audit with `--no-commit`).
