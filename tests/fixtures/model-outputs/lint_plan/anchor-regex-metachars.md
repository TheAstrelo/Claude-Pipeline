## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/app.js | MODIFY | None |
| 2 | src/app.js | MODIFY | 1 |

### Step 1: Loosen the version regex
**File:** src/app.js [MODIFY]
**Deps:** None
**Anchor:** `const VERSION_RE = /^v?\d+\.\d+\.\d+$/;`
**Intent:** Allow an optional prerelease suffix (`-beta.1`) in VERSION_RE.
**Test:** '1.2.3-beta.1'.match(VERSION_RE) -> truthy

### Step 2: Export the router pieces
**File:** src/app.js [MODIFY]
**Deps:** 1
**Anchor:** `module.exports = { app, VERSION_RE };`
**Intent:** Also export a `start(port)` helper.
**Test:** require('./app').start -> function
