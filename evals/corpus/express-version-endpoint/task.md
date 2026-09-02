# Add GET /api/version to the Express API

`express-version-endpoint` · kind: **routine** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add a GET /api/version endpoint that responds with JSON { "version": "<version>" } where <version> is the "version" field of package.json (read it from the file, do not hard-code the string). Register it alongside the existing /api/health and /api/items routes.

## Author notes

- Good: a new `src/routes/version.js` router that reads `version` from `package.json` once at require time, mounted at `/api/version` in `src/index.js`; optionally one focused test. Roughly 10-25 changed lines.
- Slop: hard-coding `"1.4.2"`; reading and parsing `package.json` with `fs` on every request; touching `items.js` or the logger; adding a dependency to read a JSON file; a `/api/version` route bolted onto the health router under `/api/health/version`.
- The hidden test uses `deepStrictEqual` on the body, so extra fields (`name`, `uptime`) fail it.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
