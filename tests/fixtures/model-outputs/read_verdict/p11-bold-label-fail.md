## Findings

| Type | File:Line | Pattern | Confidence | Exploit Path | Fix |
|---|---|---|---|---|---|
| SQL injection | src/db/users.js:18 | Template-literal query built from `req.body.email` | 0.95 | POST /login with email `' OR 1=1 --` returns the first user row and a session token | Use a parameterized query. |

## Advisories

None.

## Summary

Injection: FOUND, Auth: 1/1 protected, Secrets: CLEAR

## Scanned Diff SHA-256: 9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f
## Scanned Tree OID: 4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e

**Verdict:** FAIL
