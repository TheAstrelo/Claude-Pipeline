# The engine

A task description in, reviewed code out. This is the TypeScript
implementation of `PIPELINE-SPEC.md`, built on the Claude Agent SDK with
Codex as a subprocess adapter.

```bash
npm install
npm run build
node dist/cli.js --help
node dist/cli.js "add a GET /api/version endpoint"
```

## What it does

Six model roles run in fresh contexts, and an orchestrator that trusts none of
them decides what happens:

| Role | Runs | Gates on |
|---|---|---|
| `plan` | pre-check, requirements, design and steps in one strong call | the plan lint and criteria coverage, both mechanical |
| `critique` | an adversarial pass over the design, before code exists | confirmed blockers only |
| `build` | executes the plan, then verifies and self-reviews | the real test run, not its own claim |
| `qafix` | repairs what the deterministic checks found | nothing; it only runs when there is something to fix |
| `security` | reads the diff for what patterns cannot see | the deterministic scanner runs first and cannot be waived |
| `review` | the last gate, against the criteria and the real diff | confirmed blockers only |

The premise is structured distrust. A phase can claim anything; only evidence
the orchestrator captured itself — the exit code of the project's own test
command, the bytes of the candidate tree, the scanner's findings — decides
whether a commit happens.

## The invariants

- **Your checkout is never touched.** Every run happens in an engine-owned git
  worktree created from an immutable baseline commit. Results land as a
  `pipeline/<run>` branch.
- **What was reviewed is what gets committed.** The commit is created from the
  exact reviewed tree with the baseline as its parent, and published by
  compare-and-swap. Verification, the security scan and the review must all
  attest the same tree; any write after them sends the run back through them.
- **The test gate cannot be talked around.** The orchestrator runs the
  project's own test command and reads the exit code. A build that reports
  success without doing the work is not committed.
- **Verification descriptors are frozen.** The test scripts, package manager
  and tool identities are captured at startup and re-derived at every check
  boundary. A run that edits the scripts its own gate calls halts, and no flag
  overrides that.
- **Blocking needs evidence.** A review may only gate on a defect with a
  concrete trigger and a citation into the diff. Findings that cite nothing,
  or a file the change never touched, are stripped; a blocking verdict citing
  nothing that survives is demoted to proceed-with-notes and recorded.

## Layout

```
src/
  cli.ts          flags, exit codes 0/1/3/4
  config.ts       profiles, quality presets, routing, budgets
  run.ts          the stage machine, checkpoints, resume
  git.ts          worktree isolation, candidate tree, the commit path
  checks.ts       verification command detection, freezing, execution
  security.ts     the deterministic scanner
  gates.ts        the BLOCKER lane, demotion, plan lint, criteria coverage
  context.ts      the repository context pack every phase opens with
  providers/      the adapter contract, Claude (Agent SDK), Codex, a fake
  roles/          the six roles: prompts, schemas, parsers
test/             vitest; whole runs against real git repos, only the model faked
```

## Tests

```bash
npm test                    # offline: ~100 tests, about 40 seconds
PIPELINE_LIVE=1 npm test    # adds 8 live adapter tests (spends a little money)
```

The integration tests drive the real stage machine over real temporary git
repositories with an in-process fake adapter, so a scenario is a function
rather than a fake binary on `PATH`.
