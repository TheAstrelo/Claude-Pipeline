# Evaluation

Two different things live here. Keep them apart in your head:

1. **Offline policy fixtures** (`routing-corpus.v1.json`, `release-slo-corpus.v1.json`
   and their frozen reports) — hand-authored inputs for
   `tests/evaluate-*.js`. They check that the routing classifier and the
   release-control thresholds behave as labeled. They never run the engine or
   a model and say nothing about code quality.
2. **The real-provider corpus** (`corpus/`, `fixtures/`, `run-corpus.mts`,
   `score.mts`, `results/`) — sealed tasks on small runnable projects with
   hidden acceptance tests. This is the only thing in the repository that
   measures whether the pipeline produces working, non-slop code. It spends
   real money.

## Running the corpus

```bash
# What would run
node evals/run-corpus.mts --dry-run

# Everything, current bash engine, Claude, standard profile, $20 cap per task
node evals/run-corpus.mts --provider=claude --profile=standard --max-run-budget-usd=20

# The money-no-object setting the roadmap is judged at (quality presets: max|balanced|cheap)
node evals/run-corpus.mts --provider=claude --profile=standard --quality=max --max-run-budget-usd=40

# One task, keep the working directory for inspection
node evals/run-corpus.mts --only=express-version-endpoint --keep

# Summarize, optionally against a previous run
node evals/score.mts evals/results/2026-09-08.json --prev=evals/results/2026-09-01.json
```

Requirements: node 22.18+ (TypeScript runs by type stripping, no build), git,
an authenticated provider CLI (`claude` or `codex`), and the fixture toolchains
for the tasks you select (npm, go 1.24, python 3.11 with pytest/fastapi/httpx).

Each task gets a fresh temp git repo copied from its fixture, the engine runs
with `--no-commit` and an isolated `PIPELINE_STATE_DIR`, then the hidden tests
are copied into the run worktree and the fixture's test command is executed.
A task passes when the engine completes, the hidden tests are green, and the
rubric (`must_touch`, `must_not_touch`, `forbidden_new_deps`) holds — or, for
negative tasks that should stop the pipeline, when it halts at the expected
gate. The runner also records a slop profile per task (added lines, files,
new dependencies, debug output, TODO markers, comment ratio) and the engine's
own cost, token, and phase evidence from `run.json`.

`.github/workflows/eval-corpus.yml` runs the corpus weekly and on dispatch
when an `ANTHROPIC_API_KEY` secret exists, always with a budget cap, and
commits the results file. Treat `results/` as the project's scoreboard: every
milestone in `IMPLEMENTATION-PLAN-V2.md` is judged against it.

## Adding a task

See `corpus/README.md` for the `task.json` contract and the validation rule
(hidden tests must be red on the untouched fixture and green on a reference
solution; record both exit codes in `task.md`).
