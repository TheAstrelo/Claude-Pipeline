## Verdict: REVISE_DESIGN

## Issues

| # | Angle | Severity | Issue | Fix |
|---|---|---|---|---|
| 1 | Security | BLOCKER | The session signing key is a literal in config/default.json (design.md §3, config/default.json:4). | Load it from the environment. |
| 2 | Operations | WARN | Sessions never expire. | Add an `exp` claim. |

## Consensus

None.

## Blocks

Issue 1.
