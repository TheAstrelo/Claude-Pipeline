## Verdict: REVISE_DESIGN

## Issues

Severity lanes used below: WARN | BLOCKER | PRE-EXISTING (per the calibration rules in the prompt).

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 2 | Operations | WARN | Sessions never expire, so a leaked token stays valid forever. | design.md §3 | Add an `exp` claim of 24h. |
| 3 | Correctness | PRE-EXISTING | `express.json()` has no body-size limit. | src/app.js:3 | Not introduced by this design. |

## Consensus

See the table.

## Blocks

Every BLOCKER row above must be fixed before planning.
