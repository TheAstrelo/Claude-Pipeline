## Verdict: PARTIAL
## Results

| Step | File | Status | Notes |
|---|---|---|---|
| 1 | src/acceptance/version.test.js | DONE | Acceptance test written first; failed as expected before step 2. |
| 2 | src/routes/version.js | DONE | New router reading the version from package.json at module load. |
| 3 | src/app.js | SKIPPED | Anchor no longer present after step 2. |

## Verification

Build: PASS
Types: PASS

## Files Changed

- src/acceptance/version.test.js
- src/routes/version.js
- src/app.js
