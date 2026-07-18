Security audit - check for OWASP vulnerabilities, auth bypass, and secrets exposure.

---

## Purpose

Audit code changes for security vulnerabilities:
- Injection attacks (SQL, XSS, command)
- Authentication bypass
- Access control issues
- Secrets exposure
- Security misconfiguration

---

## Execution

Use the **security-auditor** agent.

**Input:** Read `build-report.md` to identify changed files.

**Process:**

1. Scan for injection patterns:
   - SQL injection: string interpolation in queries
   - XSS: dangerouslySetInnerHTML usage
   - Command injection: exec/spawn with user input

2. Audit authentication:
   - All API routes have requireAuth/requireAdmin
   - User ID from req.userId, not req.body

3. Verify access control:
   - Multi-tenant filtering (user_id in queries)
   - No IDOR vulnerabilities

4. Check for secrets:
   - No hardcoded API keys/passwords
   - No credentials in error messages

5. Append results to `qa-report.md`

---

## Vulnerability Patterns

| Pattern | Risk | Detection |
|---------|------|-----------|
| `${userId}` in SQL | SQL Injection | HIGH |
| `dangerouslySetInnerHTML` | XSS | MEDIUM |
| `exec(userInput)` | Command Injection | CRITICAL |
| Missing `requireAuth` | Auth Bypass | HIGH |
| Missing `user_id` filter | Data Leak | HIGH |
| Hardcoded secrets | Secret Exposure | CRITICAL |

---

## Output

After audit, report:

```
## Security Audit Complete

**Verdict:** [PASS | FAIL | CRITICAL]

### Vulnerability Scan
- SQL Injection: [CLEAR | FOUND]
- XSS: [CLEAR | FOUND]
- Command Injection: [CLEAR | FOUND]

### Authentication
- Routes checked: [N]
- Protected: [N]
- Unprotected: [List]

### Access Control
- Multi-tenant filters: [OK | MISSING]
- IDOR risks: [NONE | FOUND]

### Secrets
- Hardcoded secrets: [NONE | FOUND]

### Required Fixes
[If FAIL/CRITICAL, specific fixes with code examples]

### Summary
This concludes the QA pipeline.
```

---

## Verdict Levels

- **PASS:** No vulnerabilities found
- **FAIL:** Vulnerabilities found, must fix
- **CRITICAL:** Severe vulnerabilities, stop immediately

---

## Gate

This command is the FINAL step of the QA pipeline.
Order: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`

After this passes, the implementation is ready for user review.
