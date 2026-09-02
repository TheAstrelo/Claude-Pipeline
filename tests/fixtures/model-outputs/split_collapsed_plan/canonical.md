===BRIEF===
## Verdict: CLEAR
## Problem
The service exposes no way for operators to see which build is deployed.
## Success Criteria
1. GET /api/version returns 200 with `{ "version": "<package.json version>" }`.
2. The existing /api/health route is unchanged.
## Scope (In/Out)
In: one read-only route. Out: authentication, build metadata beyond the version.
## Constraints
No new dependencies.
## Context Found
src/app.js already mounts /api/health inline; there is no routes/ convention yet.
## Assumptions
The version is the package.json `version` field, read once at startup.

===DESIGN===
## Decisions
- **Read package.json once at module load** — avoids a file read per request — Source: src/app.js:4
- **Inline route in src/app.js, matching the health route** — no router convention exists yet — Source: src/app.js:11-13
## Components
| Name | Purpose | Interface |
|---|---|---|
| version route | expose the deployed version | GET /api/version -> `{ version }` |
## Data Changes
None
## Risks
| Risk | Mitigation |
|---|---|
| package.json path differs after bundling | resolve relative to __dirname |

===PLAN===
## Verdict: READY
## Steps
| # | File | Action | Depends |
|---|---|---|---|
| 1 | src/acceptance/version.test.js | CREATE | None |
| 2 | src/app.js | MODIFY | 1 |
### Step 1: Acceptance test
**File:** src/acceptance/version.test.js [CREATE]
**Deps:** None
**Intent:** supertest GET /api/version expecting 200 and the package.json version.
**Test:** npm test -> fails until step 2
### Step 2: Add the route
**File:** src/app.js [MODIFY]
**Deps:** 1
**Anchor:** `app.get('/api/health', (req, res) => {`
**Intent:** add GET /api/version after the health route.
**Test:** npm test -> passes
