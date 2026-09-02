# Corpus results

One JSON file per full run of `evals/run-corpus.mts` (rows per task) with a
`.summary.json` from `evals/score.mts`. Compare runs with
`node evals/score.mts <new> --prev=<old>`.

| File | Engine | Notes |
|---|---|---|
| `2026-09-02-pilot.json` | bash, after the symlink-exclusion fix | single task (`express-version-endpoint`); the first end-to-end pass |
| `2026-09-02-run1.json` | bash, before the escaped-backtick lint fix | 11/14; `express-logger-refactor` halted at the plan lint |
| `2026-09-02.json` | bash, all M1 engine fixes | 10/14; the M1 baseline every later milestone is compared against |

Two runs of the same engine on the same corpus differ by about two tasks
(different failing sets), so judge a change on more than one run or on a
larger corpus, and read the per-task `reason`, `haltedAt`, and `engineTail`
before trusting an aggregate.
