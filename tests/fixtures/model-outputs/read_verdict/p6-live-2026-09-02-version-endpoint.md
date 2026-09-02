All 5 tests pass, including the new `/api/version` test.

## Verdict: SUCCESS

## Results

| Step | File | Status | Notes |
|---|---|---|---|
| 1 | `src/routes/version.test.js` | DONE | Mirrors `health.test.js` structure; asserts body deep-equals `{ version: require('../../package.json').version }` |
| 2 | `src/routes/version.js` | DONE | Mirrors `health.js` style; `version` read once at module load; response body contains only `version` |
| 3 | `src/index.js` | DONE | Added `versionRoutes` require after `itemRoutes`, mounted `app.use("/api/version", versionRoutes)` after items route; existing routes untouched |

## Verification
Build: PASS (no build step defined; module loads without error)
Types: PASS (no TypeScript in project; `npm test` — all 5 tests pass, 0 failures)

## Files Changed
- `src/routes/version.test.js` (new)
- `src/routes/version.js` (new)
- `src/index.js` (modified)
