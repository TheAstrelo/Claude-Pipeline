## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/app.js | MODIFY | None |

### Step 1: Add the build number to the version payload
**File:** src/app.js [MODIFY]
**Deps:** None
  **Anchor:** `app.get('/version', (req, res) => {`
**Intent:** Extend the JSON response with a `build` field.
**Test:** GET /api/version -> 200 `{ version, build }`
