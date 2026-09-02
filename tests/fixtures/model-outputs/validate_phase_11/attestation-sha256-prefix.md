## Findings

| Type | File:Line | Pattern | Confidence | Exploit Path | Fix |
|---|---|---|---|---|---|
| None | - | No verdict-driving finding in the changed surface | - | - | - |

## Advisories

- src/routes/version.js:10 — the response includes the exact package version, which mildly aids fingerprinting (confidence 0.7). Defense-in-depth only; the field is the feature.

## Summary

Injection: CLEAR, Auth: 0/0 protected (the new route is intentionally public), Secrets: CLEAR

## Scanned Diff SHA-256: sha256:9b1f4e7a2c8d5b3e6f0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f
## Scanned Tree OID: 4c2f1e9d8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e

## Verdict: PASS
