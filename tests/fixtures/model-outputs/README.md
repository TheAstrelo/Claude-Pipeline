# Model-output fixture corpus (parser characterization)

`run-pipeline.sh` turns model-written markdown into gate decisions: verdict
tokens, BLOCKER rows, attestation digests, plan anchors, collapsed-plan
markers. This corpus is the set of report *shapes* those parsers are run
against by `tests/parser-golden.sh`, which extracts the real parser functions
from the engine (no copies) and records what they do today.

Run it from the repo root:

```bash
bash tests/parser-golden.sh          # ok - <kind>/<case> per case, then a summary
bash tests/parser-golden.sh -v       # also print the raw result and validator log
bash tests/parser-golden.sh p12-     # only cases whose id contains the substring
```

The suite is green when every case matches its *recorded current* value —
including the known-bad ones. It exists so a parser fix can be made with the
full corpus in front of it and every improvement shows up as a flipped case.

## Layout

```
tests/fixtures/model-outputs/
├── README.md
├── read_verdict/             read_verdict(artifact, tokens)          — phases 3, 6, 11, 12
├── count_gating_blockers/    count_gating_blockers(artifact)         — phases 3 (evidence mode), 12 (diff mode)
├── lint_plan/                lint_plan(plan)                         — phase 4
│   └── tree/                 the tiny working tree lint_plan resolves paths/anchors against
├── split_collapsed_plan/     split_collapsed_plan(source)            — collapsed yolo/fast planning
├── validate_phase_3/         validate_phase_3()   whole-gate cases
├── validate_phase_6/         validate_phase_6()
├── validate_phase_11/        validate_phase_11()  (Claude path: reads qa-report.md.report)
└── validate_phase_12/        validate_phase_12()  (verdict from code-review.md, attestation from code-review.md.report)
```

Each case is `<kind>/<case>.md` (the model output, written as plausible full
report prose, never a one-liner) plus `<kind>/<case>.expect` (what the parser
does with it). Optional sidecars next to them, picked up by name:

| Sidecar | Staged as | Used by |
|---|---|---|
| `<case>.diff` | `$ARTIFACTS/review.diff` | `count_gating_blockers` (phase-12 path filter), `validate_phase_12` |
| `<case>.refuted` | `$ARTIFACTS/<artifact>.refuted` | `count_gating_blockers`, `validate_phase_3/12` (rows the refuter excluded, verbatim) |
| `<case>.verdict` | `$ARTIFACTS/<artifact>.verdict` | `read_verdict` (typed Codex schema output, wins over markdown) |

The harness stages every case into a fresh temp `$ARTIFACTS` under the
canonical artifact name the engine uses (`critique.md`, `build-report.md`,
`qa-report.md.report`, `code-review.md` + `code-review.md.report`), so
basename-driven behavior (e.g. `count_gating_blockers` switching to diff mode
for `code-review.md`) is exercised exactly as in a run.

### Corpus constants

Every attestation fixture echoes the same orchestrator digests, which the
harness binds to `SECURITY_DIFF_SHA`/`REVIEWED_DIFF_SHA` and
`SECURITY_TREE_SHA`/`REVIEWED_TREE_SHA` before each case:

```
diff SHA-256: 9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f
tree OID:     4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e
```

A case that needs the "no tree OID" path sets `tree=unavailable` in its expect
file; the harness then blanks the tree globals so `unavailable` is expected.

`lint_plan` cases run with `lint_plan/tree/` as the working directory; plans
must reference paths and anchors relative to that tree (`src/app.js`,
`src/routes/health.js`, `config/default.json`, `README.md`).

## `.expect` keys

Plain `key=value` lines; the first `=` splits key from value, so values may
contain `=` and spaces. `#` lines are comments.

Common to every case:

| Key | Values | Meaning |
|---|---|---|
| `status` | `expected` \| `xfail` | `expected`: today's result is the right one. `xfail`: today's result is a known parser gap; the primary key still records what the parser does *now* so the suite stays green. |
| `want_after_fix` | same shape as the primary key | Required on `xfail` (must differ from the recorded value), forbidden on `expected`. When the actual result equals it, the harness reports **XPASS** and fails: flip `status=expected` and update the primary key. |
| `note` | free text, one line | Why the recorded behavior is right or wrong, citing `run-pipeline.sh:<line>` where it helps. |
| `source` | `synthetic` \| `live` | `synthetic`: authored to reproduce a shape. `live`: captured from a real run (see below). |

Primary key per kind (the value the harness compares):

| Kind | Primary key | Value shape | Extra keys |
|---|---|---|---|
| `read_verdict` | `verdict` | a token, or `MISSING` when nothing parsed (the engine's own `${verdict:-MISSING}`) | `tokens=` the alternation the phase passes (required), `artifact=` staged name |
| `read_attestation` | `attestation` | the digest / `unavailable`, or `MISSING` when rejected | `field=` `reviewed_diff_sha` \| `reviewed_tree_sha` \| `scanned_diff_sha` \| `scanned_tree_sha`, `artifact=` |
| `count_gating_blockers` | `blockers` | integer | `artifact=` `critique.md` (evidence mode) or `code-review.md` (diff mode) |
| `lint_plan` | `lint_errors` | integer (lines in `PLAN_LINT_ERRORS`) | `lint_match=` substring that must appear in the errors |
| `split_collapsed_plan` | `split` | `ok:brief,design,plan` or `fail:<non-empty sections>` | — |
| `validate_phase_*` | `gate` | `hard=N soft=M` (the `GATE_HARD`/`GATE_SOFT` the gate reads) | `log_match=` substring of a recorded `pass:<check>` / `HARD:<msg>` / `SOFT:<msg>` line, `tree=unavailable` |

## Adding captured outputs from real runs

Real model output is the point of this corpus. When a run's report parsed
wrongly (or surprisingly rightly), copy the artifact from
`.pipeline/runs/<run>/` into the matching kind directory under the same
layout, with `source=live` in the expect file:

1. Copy `critique.md` / `build-report.md` / `qa-report.md.report` /
   `code-review.md` / `plan.md` / `collapsed-plan.md` to
   `<kind>/<descriptive-name>.md`. For a phase-12 blocker case also copy
   `review.diff` to `<descriptive-name>.diff`. Redact anything sensitive; the
   shape is what matters.
2. Replace the run's digests with the corpus constants above (or the
   attestation cases will fail for the wrong reason).
3. Write the expect file with `source=live`, the primary key set to what the
   parser does today (run the suite with `-v` to see it), and `status`
   according to whether that is right.
4. Run `bash tests/parser-golden.sh` — it must stay green.

Keep one shape per case and name the case after the shape, not the run.
