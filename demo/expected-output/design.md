# Technical Design

## Decisions

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| 1 | Use bcrypt for password hashing | Industry standard, built-in salt | bcrypt npm docs |
| 2 | Use jsonwebtoken for JWT | Most popular Node.js JWT library | npm trends |
| 3 | Auth middleware follows existing logger pattern | Consistency with codebase | `src/middleware/logger.js` |
| 4 | Auth routes in `src/routes/auth.js` | Follows existing route structure | `src/routes/items.js` |
| 5 | JWT secret from `process.env.JWT_SECRET` | Never hardcode secrets | OWASP guidelines |

## Components

| Component | File | Responsibility |
|-----------|------|---------------|
| Auth routes | `src/routes/auth.js` | Register + login endpoints |
| Auth middleware | `src/middleware/auth.js` | Token verification, route protection |
| User store | `src/store/users.js` | In-memory user storage (Map) |

## Data Changes
None — in-memory storage (Map), matching existing items pattern.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| JWT secret not set | HIGH | Fail fast on startup if missing |
| Timing attacks on password comparison | MEDIUM | bcrypt.compare handles this |
| Token in response body only | LOW | Acceptable for demo scope |
