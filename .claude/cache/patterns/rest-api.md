# Pattern: REST API Endpoint

## Structure

```typescript
// src/pages/api/[resource]/index.ts (list/create)
// src/pages/api/[resource]/[id].ts (get/update/delete)
```

## Decisions

1. **Auth**: Use `requireAuth` middleware
2. **Validation**: Validate request body with Zod
3. **Errors**: Return consistent error shape `{ error: string, code?: string }`
4. **Response**: Return `{ data: T }` for success

## Template

```typescript
import { requireAuth, AuthenticatedRequest } from '@infrastructure/auth/middleware';
import { NextApiResponse } from 'next';
import pool from '@infrastructure/database/connection';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1),
  // ... fields
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = req.userId!;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM resources WHERE user_id = $1',
      [userId]
    );
    return res.status(200).json({ data: result.rows });
  }

  if (req.method === 'POST') {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const result = await pool.query(
      'INSERT INTO resources (user_id, name) VALUES ($1, $2) RETURNING *',
      [userId, parsed.data.name]
    );
    return res.status(201).json({ data: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
```

## Checklist

- [ ] Auth middleware applied
- [ ] User ID from req.userId (not body)
- [ ] Parameterized SQL queries
- [ ] Input validation
- [ ] Consistent error responses
- [ ] Multi-tenant filtering (user_id)
