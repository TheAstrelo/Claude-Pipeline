## Findings

| Severity | File:Line | Issue | Trigger | Fix |
|---|---|---|---|---|
| BLOCKER | src/routes/auth.js:42 | `bcrypt.compare` result is computed but never checked, so any password logs the user in. | POST /login with a valid email and any password -> 200 with a token | Return 401 unless `ok` is true. |
| BLOCKER | src/acceptance/auth.test.js:5 | The only test sends the correct password, so the auth bypass is never exercised. | `npm test` passes with the bypass in place | Add a wrong-password case asserting 401. |
| BLOCKER | src/routes/auth.js:39 | 401 is returned before the bcrypt compare, so response timing reveals which emails exist. | Time POST /login for a known vs unknown email | Run a dummy compare on the unknown-user branch. |
| BLOCKER | src/routes/auth.js:43 | `signSession(user.id)` is called with an undefined id when the store returns a plain row. | POST /login for a user created by the legacy importer | Use `user.id ?? user._id`. |

## Criteria Coverage

| Criterion | Satisfied by the diff? (Yes/No) | Evidence in diff |
|---|---|---|
| POST /login rejects invalid credentials | No | src/routes/auth.js:42 |

## Reviewed Diff SHA-256: 9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f
## Reviewed Tree OID: 4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e

## Verdict: REQUEST_CHANGES
