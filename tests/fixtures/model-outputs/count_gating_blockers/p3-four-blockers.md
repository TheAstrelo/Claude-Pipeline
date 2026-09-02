## Verdict: REVISE_DESIGN

## Issues

| # | Angle | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Security | BLOCKER | The session signing key is a literal in config/default.json, so anyone who can read the repository can mint valid sessions. | design.md §3 "Session signing"; config/default.json:4 | Load the key from an environment variable and fail startup when unset. |
| 4 | Concurrency | BLOCKER | Two concurrent logins for the same user race on `sessions.put` and the second silently overwrites the first, logging one device out. | design.md §4 "Session store", lines 41-48 | Key sessions by (userId, deviceId) or use an append-only store. |
| 5 | Data | BLOCKER | The migration drops `users.legacy_id` before the backfill job that reads it has run. | design.md §5 "Data changes" step order | Move the DROP to a follow-up migration after the backfill. |
| 6 | Correctness | BLOCKER | `signSession` accepts a numeric userId but `users.findByEmail` returns a string id, so tokens never match on verify. | design.md §2 Components table, Interface column | Normalize the id type at the store boundary. |
| 2 | Operations | WARN | Sessions never expire, so a leaked token stays valid forever. | design.md §3 | Add an `exp` claim of 24h. |

## Consensus

See the table.

## Blocks

Every BLOCKER row above must be fixed before planning.
