# Requirements Brief

## Verdict: CLEAR

## Problem
The API has no authentication. All routes (items CRUD) are publicly accessible. Need JWT-based auth with registration, login, and route protection.

## Success Criteria
1. Users can register with email and password
2. Users can log in and receive a JWT token
3. Protected routes reject requests without a valid token
4. Passwords are hashed, never stored in plain text
5. Token has a configurable expiration time

## Scope

**In:**
- Registration endpoint (POST /api/auth/register)
- Login endpoint (POST /api/auth/login)
- Auth middleware for protecting routes
- Password hashing with bcrypt
- JWT token generation and validation

**Out:**
- OAuth/social login
- Email verification
- Password reset flow
- Role-based access control
- Refresh tokens

## Constraints
- In-memory user store (matching existing items pattern)
- JWT secret from environment variable
- Express middleware pattern (matching existing logger)

## Assumptions
- Email is the unique identifier
- Token expiration defaults to 24 hours
