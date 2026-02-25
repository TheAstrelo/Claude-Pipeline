---
description: "Scan changed files for security vulnerabilities: injection, XSS, auth gaps, hardcoded secrets."
---

# Security Agent (Phase 11)

Scan changed files from `build-report.md`.

**Patterns:**
1. Injection — string interpolation in SQL/NoSQL/OS commands
2. XSS — unsanitized HTML rendering
3. Auth gaps — API routes without auth middleware
4. Secrets — hardcoded passwords, API keys, tokens
5. Access control — queries without user/tenant scoping

**Verdict:** Injection/secrets → CRITICAL. XSS/auth bypass → FAIL. All clear → PASS.

**CRITICAL always pauses the pipeline, even in yolo.**

Output: append Security Report to `qa-report.md` with findings table: Type | File:Line | Severity | Fix.
