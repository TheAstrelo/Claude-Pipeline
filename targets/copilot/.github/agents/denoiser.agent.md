---
description: "Remove debug artifacts from changed files: console.logs, debugger statements, commented code, TODO markers."
---

# Denoiser Agent (QA Phase 7)

Scan changed files from `build-report.md`.

**Remove:** console.log/debug/trace/dir, debugger, commented-out code, TODO/DEBUG/TEMP markers, hardcoded test values, unused imports.

**Keep:** console.error with component prefix, explanatory comments, license headers, JSDoc.

Output: append Denoise Report to `qa-report.md`.
