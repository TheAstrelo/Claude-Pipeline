# Add X-Request-Id middleware

`express-request-id` · kind: **routine** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add request-id middleware to the Express app: every response (including 404s for unknown routes) must carry an X-Request-Id header. If the incoming request already has an X-Request-Id header, echo that value back unchanged; otherwise generate a UUID with crypto.randomUUID() from node:crypto. Put the middleware in its own module under src/middleware/ and register it in src/index.js before the routes. Do not add dependencies.

## Author notes

- Good: `src/middleware/request-id.js` (~10 lines) using `req.get('x-request-id') || randomUUID()` and `res.set(...)`, registered in `src/index.js` before the routes and `express.json()`; ~15-30 changed lines.
- Slop: adding `uuid`/`nanoid`; registering the middleware after the routers (404s and errors miss the header); only setting the header on some routes; putting it inside the logger; wiring AsyncLocalStorage or a request-context "framework".
- The 404 subtest is the one a route-scoped implementation fails.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
