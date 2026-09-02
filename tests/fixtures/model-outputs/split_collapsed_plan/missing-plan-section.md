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
