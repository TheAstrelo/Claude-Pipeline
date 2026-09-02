## Verdict: REVISE_DESIGN

## Issues

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Security | BLOCKER | The session signing key is a literal in config/default.json, so anyone who can read the repository can mint valid sessions. | design.md §3 "Session signing"; config/default.json:4 | Load the key from an environment variable and fail startup when unset. |
| 2 | Operations | WARN | Sessions never expire, so a leaked token stays valid forever. | design.md §3 | Add an `exp` claim of 24h. |
| 3 | Correctness | PRE-EXISTING | `express.json()` has no body-size limit. | src/app.js:3 | Not introduced by this design. |

## Consensus

See the table.

## Blocks

Every BLOCKER row above must be fixed before planning.
