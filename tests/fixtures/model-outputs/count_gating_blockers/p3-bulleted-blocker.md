## Verdict: REVISE_DESIGN

## Issues

- **BLOCKER** (Security): the session signing key is a literal in config/default.json (design.md §3; config/default.json:4). Anyone who can read the repo can mint sessions. Fix: load it from the environment and fail startup when unset.
- **WARN** (Operations): sessions never expire (design.md §3). Add an `exp` claim.
- **PRE-EXISTING** (Correctness): no body-size limit on `express.json()` (src/app.js:3).

## Consensus

The signing-key issue was raised by Security and Correctness.

## Blocks

The BLOCKER above.
