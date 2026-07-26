---
name: scaffold-api
description: Generate a new authenticated Next.js API route following RDO project conventions
argument-hint: <route-path> (e.g. companies/[id]/notes)
---

Create a new Next.js API route at `src/pages/api/$ARGUMENTS.ts` following these project conventions exactly:

## Required Structure

1. **Swagger JSDoc comment block** at the top of the file:
```typescript
/**
 * @swagger
 * /api/$ARGUMENTS:
 *   get:
 *     summary: <describe endpoint>
 *     description: <longer description>
 *     tags: [<Feature Area>]
 *     security:
 *       - BearerAuth: []
 *       - CookieAuth: []
 *     parameters: [...]
 *     responses:
 *       200: { description: Success }
 *       401: { description: Unauthorized }
 *       500: { description: Server error }
 */
```

2. **Imports** — always use these exact patterns:
```typescript
import type { NextApiResponse } from 'next';
import { requireAuth, AuthenticatedRequest } from '@infrastructure/auth/middleware';
import pool from '@infrastructure/database/connection';
```

3. **Handler function** with method check and userId extraction:
```typescript
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.userId!;

  try {
    // Query logic here using pool.query()
    const { rows } = await pool.query('SELECT ...', [userId]);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[API_NAME] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

4. **Default export** with auth wrapper:
```typescript
export default requireAuth(handler);
```

## Rules
- Use `requireAdmin` instead of `requireAuth` if the route is admin-only
- Use `AuthenticatedRequest` type, never `NextApiRequest`
- Access user via `req.userId!` (non-null assertion)
- Use `pool.query()` for database access — no ORM
- Never use `do` as a SQL alias (PostgreSQL reserved word) — use `d` instead
- Parse numeric scores with `parseFloat(String(value)).toFixed(1)`
- Define TypeScript interfaces for response shapes at the top of the file
- Add proper query parameter validation before database queries
