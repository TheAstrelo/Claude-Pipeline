Now I have everything needed to write the plan.

## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|------|--------|---------|
| 1 | `src/routes/version.test.js` | CREATE | None |
| 2 | `src/routes/version.js` | CREATE | None |
| 3 | `src/index.js` | MODIFY | Step 2 |

### Step 1: Author acceptance test for the version endpoint
**File:** `src/routes/version.test.js` [CREATE]
**Deps:** None
**Anchor:** N/A (new file)
**Intent:** Mirror the structure of `src/routes/health.test.js` exactly (same `node:test`/`node:assert`/`node:http` imports, same `get`/`withServer` helpers copied verbatim). Add one test `'GET /api/version reports the package version'` that calls `get(port, '/api/version')`, asserts `response.status === 200`, parses the body as JSON, and asserts the parsed payload deep-equals `{ version: require('../../package.json').version }` (require the root `package.json` directly in the test to avoid hardcoding the version string, keeping the test valid if the manifest version changes later). This test must fail before Step 2/3 exist (404, since no route is mounted at `/api/version`) and pass once they're implemented.
**Test:** `node --test src/routes/version.test.js` before implementation → fails (status 404 / route not mounted). After Steps 2–3 → passes.

### Step 2: Create the version router
**File:** `src/routes/version.js` [CREATE]
**Deps:** None
**Anchor:** N/A (new file)
**Intent:** Mirror `src/routes/health.js`'s structure and single-quote style: `const { Router } = require('express'); const router = Router();`. At module scope, read `const { version } = require('../../package.json');` (resolved once at load time, per design decision 3). Define `router.get('/', (req, res) => { res.json({ version }); });` — response body must contain exactly the `version` field, no extras (design decision 5). End with `module.exports = router;`.
**Test:** `node -e "console.log(require('./src/routes/version').stack.length)"` → prints `1` (one route layer registered), confirming the module loads without throwing and exports a router.

### Step 3: Mount the version router in the app
**File:** `src/index.js` [MODIFY]
**Anchor:** `const itemRoutes = require("./routes/items");`
**Deps:** Step 2
**Intent:** Add a new require line immediately after the anchor: `const versionRoutes = require("./routes/version");` (double quotes, matching `index.js`'s local style per design decision 3 of Risks table). Then, immediately after the existing `app.use("/api/items", itemRoutes);` line, add `app.use("/api/version", versionRoutes);`. Do not reorder or otherwise modify the existing `app.use` calls for `/api/health` or `/api/items`.
**Test:** Run `npm test` (or `node --test "src/**/*.test.js"`) → `src/routes/version.test.js` now passes alongside `health.test.js` and `items.test.js`, and `GET /api/version` returns `200` with body `{"version":"1.4.2"}`.
