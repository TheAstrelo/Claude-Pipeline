## Verdict: ❌ REVISE_DESIGN
## Issues

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Security | BLOCKER | The session signing key is a literal in config/default.json, so anyone who can read the repository can mint valid sessions. | design.md §3 "Session signing"; config/default.json:4 | Load the key from an environment variable and fail startup when it is unset. |
| 2 | Operations | WARN | Sessions never expire, so a leaked token is valid forever. | design.md §3 | Add an `exp` claim of 24h. |

## Consensus

Issue 1 was raised independently by the Security and Correctness angles.

## Blocks

- Issue 1 must be fixed before the plan is written: a static, committed signing key defeats the purpose of signing.
