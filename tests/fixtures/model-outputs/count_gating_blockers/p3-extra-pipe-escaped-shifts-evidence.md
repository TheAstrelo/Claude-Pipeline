## Verdict: REVISE_DESIGN

## Issues

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Concurrency | BLOCKER | Two writers can race on `state \| lock` and drop an update. | — | Serialize with a mutex. |
| 2 | Operations | WARN | Sessions never expire, so a leaked token stays valid forever. | design.md §3 | Add an `exp` claim of 24h. |

## Consensus

See the table.

## Blocks

Every BLOCKER row above must be fixed before planning.
