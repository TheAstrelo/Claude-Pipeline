## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/routes/version.js | MODIFY | None |

### Step 1: Cache the version at module load
**File:** src/routes/version.js [MODIFY]
**Deps:** None
**Anchor:** `const { version } = require`
**Intent:** Hoist the require out of the handler.
**Test:** GET /api/version twice -> package.json read once
