## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/routes/version.js | CREATE | None |

### Step 1: Create the version router
**File:** src/routes/version.js [CREATE]
**Deps:** None
**Anchor:** `module.exports = router;`
**Intent:** New Express router exporting GET / that returns `{ version }` from package.json, read once at module load.
**Test:** require('./routes/version') -> function with a `get` handler
