## Findings

| Severity | File:Line | Issue | Trigger | Fix |
|---|---|---|---|---|
| BLOCKER | src/lib/legacy-session.js:17 | Legacy sessions are verified with `==` against a string secret. | Any request with an old-format cookie | Use a constant-time compare. |
| WARN | src/routes/auth.js:38 | The error message differs between missing-user and wrong-password. | POST /login with an unknown email | Use one generic message. |

## Criteria Coverage

| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |
|---|---|---|
| POST /login rejects invalid credentials | No | src/routes/auth.js:42 |

## Reviewed Diff SHA-256: 9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f
## Reviewed Tree OID: 4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e

## Verdict: REQUEST_CHANGES
