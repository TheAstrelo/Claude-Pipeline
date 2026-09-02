# Extract formatLogLine from the logger middleware

`express-logger-refactor` · kind: **routine** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Refactor src/middleware/logger.js: extract the log-line formatting into a pure function formatLogLine(req, res, ms) that returns the string the middleware currently logs ("<method> <originalUrl> <statusCode> <ms>ms"), and have the middleware call it. Export formatLogLine as a named property on the same module (module.exports.formatLogLine) while keeping the middleware function as the module's default export so existing require('./middleware/logger') callers are unchanged. Behaviour must not change and no other file should be modified.

## Author notes

- Good: `formatLogLine` as a pure template-string function in `logger.js`, the middleware calling it, `module.exports = logger; module.exports.formatLogLine = formatLogLine;` — under 20 changed lines, nothing outside the file.
- Slop: switching to `module.exports = { logger, formatLogLine }` (breaks `src/index.js`, which the rubric forbids editing to compensate); adding `morgan`/`pino`; changing the log format "while there"; adding options/levels/timestamps nobody asked for.
- The hidden test calls the middleware with a fake `res` EventEmitter and mocks `console.log`, so any change to when or how often the line is logged shows up.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
