## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/middleware/logger.js | MODIFY | None |
| 2 | src/middleware/logger.test.js | CREATE | 1 |

### Step 1: Extract the log line into a pure `formatLogLine` function
**File:** src/middleware/logger.js [MODIFY]
**Deps:** None
**Anchor:** `console.log(\`${req.method} ${req.url} ${res.statusCode} ${ms}ms\`);`
**Intent:** Move the template literal into an exported `formatLogLine(req, res, ms)` that returns the string, and have the middleware call `console.log(formatLogLine(req, res, ms))` so the output is byte-identical. Export both the middleware (default) and `formatLogLine`.
**Test:** formatLogLine({method:'GET',url:'/x'}, {statusCode:200}, 5) -> 'GET /x 200 5ms'

### Step 2: Unit-test the pure function
**File:** src/middleware/logger.test.js [CREATE]
**Deps:** 1
**Intent:** node:test cases for formatLogLine covering method, url, status, and duration formatting.
**Test:** npm test -> the new cases pass
