## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/routes/version.js | CREATE | None |
| 2 | src/app.js | MODIFY | 1 |
| 3 | src/routes/health.js | MODIFY | None |

### Step 1: Create the version router
**File:** src/routes/version.js [CREATE]
**Deps:** None
**Intent:** New router returning `{ version }`.
**Test:** require('./routes/version') -> router

### Step 2: Mount the version router
**File:** src/app.js [MODIFY]
**Deps:** 1
**Anchor:** `app.get('/api/health', (req, res) => {`
**Intent:** Mount the new router at /api/version just after the health route and delete the inline handler.
**Test:** GET /api/version -> 200

### Step 3: Report uptime in seconds
**File:** src/routes/health.js [MODIFY]
**Deps:** None
**Anchor:** `uptime: Math.floor(process.uptime())`
**Intent:** Round the uptime.
**Test:** GET /api/health -> integer uptime
