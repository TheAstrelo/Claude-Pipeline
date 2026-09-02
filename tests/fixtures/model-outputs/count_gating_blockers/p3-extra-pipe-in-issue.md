## Verdict: REVISE_DESIGN

## Issues

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Security | BLOCKER | The session signing key is a literal in config/default.json, so anyone who can read the repository (or the CI logs | build cache) can mint valid sessions. | design.md §3 "Session signing"; config/default.json:4 | Load the key from an environment variable and fail startup when unset. |

## Consensus

See the table.

## Blocks

Every BLOCKER row above must be fixed before planning.
