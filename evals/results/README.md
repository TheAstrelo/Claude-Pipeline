# Corpus results

One JSON file per full run of `evals/run-corpus.mts` (rows per task) with a
`.summary.json` from `evals/score.mts`. Compare runs with
`node evals/score.mts <new> --prev=<old>`.

| File | Engine | Notes |
|---|---|---|
| `2026-09-02-pilot.json` | bash, after the symlink-exclusion fix | single task (`express-version-endpoint`); the first end-to-end pass |
| `2026-09-02-run1.json` | bash, before the escaped-backtick lint fix | 11/14; `express-logger-refactor` halted at the plan lint |
| `2026-09-02.json` | bash, all M1 engine fixes | 10/14; the M1 baseline every later milestone is compared against |
| `2026-09-02-m2.json` | bash, M2 engine, `--quality=max` | 12/14; secret-leak, seeded-bug, and tslib terse fixed; `go-wordcount-top-n` failed on a hidden-test name collision in the harness |
| `2026-09-02-m2-go-rerun.json` | bash, M2 engine, `--quality=max` | `go-wordcount-top-n` alone after the runner's Go test-name fix: PASS (13/14 combined) |

Two runs of the same engine on the same corpus differ by about two tasks
(different failing sets), so judge a change on more than one run or on a
larger corpus, and read the per-task `reason`, `haltedAt`, and `engineTail`
before trusting an aggregate.
