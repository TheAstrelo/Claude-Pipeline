## Codebase Matches

| Type | Path | Relevance |
|------|------|-----------|
| Route module (pattern to follow) | `src/routes/health.js` | Minimal `Router()` with a single `GET /` handler returning JSON — exact pattern to replicate for `/api/version`. |
| Route registration | `src/index.js:12-13` | Shows how `healthRoutes`/`itemRoutes` are mounted with `app.use("/api/...", router)`; new route registers the same way. |
| Route module | `src/routes/items.js` | Secondary example of the router pattern (CRUD), less directly relevant than health.js. |
| Manifest | `package.json` | Contains `"version": "1.4.2"` — the value to read and return, not hard-code. |

## Installed Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.21.0 | Web framework already used for routing (`Router()`); sufficient on its own via `require('../../package.json').version` — no extra dependency needed. |

## Recommendation
EXTEND_EXISTING

**Reasoning:** The codebase already has a clean, minimal router pattern (`health.js`) and registration convention (`index.js`) for exactly this kind of stateless JSON endpoint; adding `version.js` that requires `package.json` and mounting it the same way is a one-file addition with zero new dependencies, making external libraries like `express-package-json` or `version-middleware` unnecessary overhead.

Sources:
- [express-package-json - npm](https://www.npmjs.com/package/express-package-json)
- [version-middleware (GitHub)](https://github.com/bahmutov/version-middleware)
- [express-version-route - npm](https://www.npmjs.com/package/express-version-route)
