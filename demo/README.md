# Pipeline Demo Kit

Show a fellow dev what the pipeline does in about ten minutes.

## What's inside

```
demo/
├── starter-project/            # Tiny Express API (5 source files)
│   ├── package.json            # npm test → node --test src/**/*.test.js
│   ├── .env.example
│   └── src/
│       ├── index.js            # Express server, 2 routes mounted
│       ├── middleware/logger.js
│       ├── routes/health.js    # GET /api/health
│       ├── routes/items.js     # CRUD /api/items
│       └── acceptance/version.test.js   # RED by design: asserts GET /api/version
└── expected-output/            # Artifacts from a real run of the demo task
```

## The demo

**Task:** `add a GET /api/version endpoint that returns the version from package.json`

**Why this task:** it is small enough to finish in one run, and it shows the
part of the pipeline that matters most. The starter ships a *failing*
acceptance test for the endpoint, so the baseline test run is red, Phase 9
gates on the real test exit code, and the run commits only once that test is
green. Along the way Pre-Check finds the existing route pattern, Planning is
intent-level and lint-checked against the live tree, Security scans the real
diff, and Phase 12 reviews the real diff and commits on `APPROVE`.

The sealed version of this task, with the acceptance test hidden from the
pipeline, is `evals/corpus/express-version-endpoint`.

## Setup (one minute)

```bash
# 1. Copy the starter project somewhere and make it a git repo
mkdir -p /tmp/pipeline-demo
cp -r demo/starter-project/. /tmp/pipeline-demo/
cd /tmp/pipeline-demo
npm install
git init -q && git add -A && git commit -q -m "baseline"   # the engine needs one commit

# 2. Copy the engine in (from the Claude-Pipeline repo root)
cp /path/to/Claude-Pipeline/run-pipeline.sh .
# optional: cp -r /path/to/Claude-Pipeline/.claude .   → /auto-pipeline + hooks
#   (the hooks then apply to every Claude Code session in this directory)

# 3. See the red acceptance test
npm test    # 1 failing: "GET /api/version returns the package version"
```

## Run it

```bash
# Claude Code
bash run-pipeline.sh --provider=claude "add a GET /api/version endpoint that returns the version from package.json"

# Codex
npm install -g @openai/codex
bash run-pipeline.sh --provider=codex "add a GET /api/version endpoint that returns the version from package.json"
```

Inside Claude Code, `/auto-pipeline <task>` runs the same engine.

## What to watch for

| Moment | What happens | Why it matters |
|---|---|---|
| Startup | Baseline matrix runs; the acceptance test is red and tagged `FAIL_PREEXISTING` | Red baseline never gates; the run stays armed to commit once it turns green |
| Phase 0 | Finds `routes/health.js` and the mount pattern in `index.js` | Builds like the codebase already does |
| Phase 4 | Intent-level steps with verbatim anchors; a lint verifies every anchor exists | No paste-ready code that goes stale |
| Phase 6 | Build, then the frozen `npm test` runs immediately; failures get a bounded fix | Cheap correction before review |
| Phase 9 | The orchestrator runs `npm test` and gates on the real exit code; green needs no model call | The one signal a model cannot fake |
| Phase 11 | Deterministic scanners, then a review bound to the diff SHA and tree OID | Secrets and protected paths block before any judgment |
| Phase 12 | Reviews the real diff; commits the reviewed tree on `APPROVE` | What was reviewed is exactly what is committed |

## Expected output

The result lands on a `pipeline/<run>` branch; your checkout is untouched.

- **New:** a version route (typically `src/routes/version.js`).
- **Modified:** `src/index.js` (mount the route). The acceptance test is
  unchanged and now green.
- **Artifacts** under `.pipeline/artifacts/<run>/`: `pre-check.md`,
  `brief.md`, `design.md`, `critique.md`, `plan.md`, `drift-report.md`,
  `build-report.md`, `qa-report.md`, `code-review.md`, `review.diff`,
  `test-output.txt`, `run.json`, and the ledger.

`expected-output/` holds the artifacts from a real run. Model output varies
run to run; the structure and gates do not.

## Quick verification

```bash
git merge pipeline/<run-id>        # or inspect .pipeline/worktrees/<run-id>
npm test                           # all green, including the acceptance test
node src/index.js &
curl http://localhost:3000/api/version    # → {"version":"1.0.0"}
```

## Talking points

1. **"It's not autocomplete."** Requirements, design, adversarial review,
   plan, build, QA, security, review — the process a senior team follows,
   run unattended.
2. **"The tests decide, not the model."** The orchestrator runs the real test
   command and gates on its exit code. The build report is a claim; the exit
   code is evidence.
3. **"Nothing ships unreviewed."** Phase 12 reviews the real git diff and
   commits only on `APPROVE`, after bounded self-healing.
4. **"Your checkout is never touched."** Every run works in its own git
   worktree and publishes a branch.
5. **"Every decision is traceable."** Readable artifacts at every phase, plus
   an append-only ledger.
