# Pattern: CRUD Endpoint

## Structure

```
src/pages/api/[resource]/
├── index.ts      # GET (list), POST (create)
└── [id].ts       # GET (one), PUT (update), DELETE
```

## Decisions

1. **IDs**: UUID from database (`gen_random_uuid()`)
2. **Ownership**: All queries filter by `user_id`
3. **404**: Check existence before update/delete
4. **Soft delete**: Add `deleted_at` column, filter in queries

## Template: [id].ts

```typescript
import { requireAuth, AuthenticatedRequest } from '@infrastructure/auth/middleware';
import { NextApiResponse } from 'next';
import pool from '@infrastructure/database/connection';
import { z } from 'zod';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  // ... fields
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = req.userId!;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  // GET one
  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM resources WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({ data: result.rows[0] });
  }

  // PUT update
  if (req.method === 'PUT') {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const result = await pool.query(
      `UPDATE resources
       SET name = COALESCE($1, name), updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [parsed.data.name, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({ data: result.rows[0] });
  }

  // DELETE (soft)
  if (req.method === 'DELETE') {
    const result = await pool.query(
      `UPDATE resources SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
```

## Checklist

- [ ] UUID validation on id parameter
- [ ] Ownership check (user_id filter)
- [ ] 404 on not found
- [ ] Soft delete (deleted_at)
- [ ] updated_at on PUT
- [ ] COALESCE for partial updates
