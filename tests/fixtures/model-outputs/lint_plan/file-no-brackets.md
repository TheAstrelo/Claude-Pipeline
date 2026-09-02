## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/legacy/router.js | MODIFY | None |

### Step 1: Retire the legacy router
**File:** src/legacy/router.js MODIFY
**Deps:** None
**Anchor:** `router.use('/v0'`
**Intent:** Remove the /v0 mount now that /api/version replaces it.
**Test:** GET /v0/version -> 404
