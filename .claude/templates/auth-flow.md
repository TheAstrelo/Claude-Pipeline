# Authentication Flow Template

Pre-configured requirements for implementing authentication features.

## Template Variables

- `$AUTH_TYPE` - Authentication type (jwt, session, oauth)
- `$PROVIDER` - OAuth provider if applicable (google, github, etc.)

## Requirements

### Functional Requirements

1. Implement user registration (signup)
2. Implement user login
3. Implement user logout
4. Implement password reset flow
5. Implement session/token management
6. Handle authentication state on client

### Technical Requirements

#### JWT Authentication
- Generate secure JWT tokens
- Implement refresh token rotation
- Store tokens securely (httpOnly cookies preferred)
- Handle token expiration and renewal

#### Session Authentication
- Use secure session store (Redis, database)
- Implement session expiration
- Handle concurrent sessions

#### OAuth Authentication
- Implement OAuth 2.0 flow
- Handle callback and token exchange
- Link OAuth accounts to users

### Files to Create/Modify

- `src/auth/` - Authentication module
  - `login.ts` - Login handler
  - `register.ts` - Registration handler
  - `logout.ts` - Logout handler
  - `middleware.ts` - Auth middleware
  - `tokens.ts` - Token management
- `src/types/auth.ts` - Auth types
- `tests/auth/` - Auth tests

### Security Checklist

- [ ] Password hashing (bcrypt, argon2)
- [ ] Secure token generation
- [ ] CSRF protection
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed attempts
- [ ] Secure password reset flow
- [ ] No sensitive data in tokens/logs

### Middleware Pattern

```typescript
// requireAuth middleware
export const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await verifyToken(token);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Example Usage

```bash
# Add JWT authentication
/auto-pipeline --template=auth-flow "jwt authentication with refresh tokens"

# Add OAuth with Google
/auto-pipeline --template=auth-flow "oauth google login"
```
