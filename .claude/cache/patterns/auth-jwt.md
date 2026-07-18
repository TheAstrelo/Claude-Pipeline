# Pattern: JWT Authentication

## Structure

```
src/infrastructure/auth/
├── middleware.ts    # requireAuth, requireAdmin
├── jwt.ts           # sign, verify tokens
└── types.ts         # AuthenticatedRequest
```

## Decisions

1. **Storage**: HTTP-only cookie (not localStorage)
2. **Expiry**: 7 days, refresh on activity
3. **Payload**: `{ userId: string, email: string, isAdmin: boolean }`
4. **Middleware**: Attach userId to request

## Template

### jwt.ts

```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;
const EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
```

### middleware.ts

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from './jwt';

export interface AuthenticatedRequest extends NextApiRequest {
  userId?: string;
  isAdmin?: boolean;
}

type Handler = (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>;

export function requireAuth(handler: Handler): Handler {
  return async (req, res) => {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = payload.userId;
    req.isAdmin = payload.isAdmin;

    return handler(req, res);
  };
}

export function requireAdmin(handler: Handler): Handler {
  return requireAuth(async (req, res) => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return handler(req, res);
  });
}
```

## Checklist

- [ ] JWT_SECRET in environment
- [ ] HTTP-only cookie
- [ ] Token expiry set
- [ ] requireAuth on protected routes
- [ ] requireAdmin on admin routes
- [ ] userId from token (never from request body)
