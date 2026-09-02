## Decisions (max 6)

1. **Implement `src/routes/version.js` with `express.Router()` returning `res.json({ version })` from `GET /`** — Mirrors the established minimal router pattern so the new endpoint is structurally identical to existing routes and mounts cleanly. — Source: `src/routes/health.js:1-16`

2. **Read the version via `require('../../package.json').version`** — From `src/routes/version.js` the repo-root `package.json` is two levels up (`routes/` → `src/` → root); `require` on a `.json` file synchronously parses it into an object, so `.version` yields `"1.4.2"` with no `fs`/`JSON.parse` boilerplate and no new dependency. — Source: [Node.js CommonJS modules — .json is read and parsed into the exported object](https://nodejs.org/api/modules.html)

3. **Resolve the version once at module load, not per request** — `require` caches the parsed JSON after first load and returns the same object reference; version is static for the process lifetime, so reading at module scope avoids repeated work in the handler. This is acceptable because the manifest does not change at runtime. — Source: [Node.js modules caching — "modules are cached after the first time they are loaded"](https://nodejs.org/api/modules.html)

4. **Register with `app.use("/api/version", versionRoutes)` immediately after the existing mounts** — The codebase already uses the `app.use("/api/<name>", <name>Routes)` convention with a paired top-of-file `require`; following it keeps `/api/health` and `/api/items` untouched and functioning. — Source: `src/index.js:3-4,12-13`

5. **Response body is exactly `{ "version": "<value>" }` (no extra fields)** — The brief specifies this precise shape, intentionally departing from `health.js`'s multi-field body, so success criterion #1 is met verbatim. — Source: `brief.md:7`, `brief.md:30`

6. **Add no npm dependencies and no `package.json` content changes** — `express` is already present and sufficient; the task explicitly excludes new packages and manifest edits. — Source: `package.json:12-14`, `brief.md:16,21`

## Components (max 4)

| Name | Purpose | Interface |
|------|---------|-----------|
| `src/routes/version.js` | Express Router exposing the app version | `GET /` → `200 application/json` `{ version: string }`; `module.exports = router` |
| `src/index.js` (edit) | Mount the version router alongside existing routes | Adds `const versionRoutes = require("./routes/version");` and `app.use("/api/version", versionRoutes);` |

## Data Changes

None.

## Risks

| Risk | Mitigation |
|------|------------|
| Wrong relative path to `package.json` yields a load error | Path is `../../package.json` from `src/routes/`; confirmed root manifest at repo top (`package.json:2`). Verify by resolving at module load — a broken path throws at startup, failing fast rather than at request time. |
| Cached `require` returns stale version if manifest changes at runtime | Acceptable per design: version is static for the process lifetime; a restart (already required to pick up new code/version) reloads it. — Source: [Node.js module caching](https://nodejs.org/api/modules.html) |
| Divergent quote/style from `index.js` (double quotes) vs `health.js` (single quotes) | Match each file's local style: use single quotes inside `version.js` (like `health.js`), double quotes for the added `index.js` lines (like `index.js:3-4`). |
| Regression to `/api/health` or `/api/items` during edit | Only append one `require` and one `app.use` line; do not reorder or modify existing mounts (`src/index.js:12-13`). |

Sources:
- [Modules: CommonJS modules | Node.js Documentation](https://nodejs.org/api/modules.html)
