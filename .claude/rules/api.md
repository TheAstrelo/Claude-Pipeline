# API Route Rules

## Authentication
- Standard routes: `import { requireAuth, AuthenticatedRequest } from '@infrastructure/auth/middleware'`
- Admin routes: `import { requireAdmin } from '@infrastructure/auth/middleware'`
- Export: `export default requireAuth(handler)` or `export default requireAdmin(handler)`
- Access user: `req.userId!` (non-null assertion — middleware guarantees it)
- Use `AuthenticatedRequest` type, never `NextApiRequest` for protected routes

## Handler Pattern
```typescript
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const userId = req.userId!;
  try {
    // ... logic
  } catch (error) {
    console.error('[ENDPOINT_NAME] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
export default requireAuth(handler);
```

## Swagger Documentation
- Add JSDoc `@swagger` comments at the top of every API route
- Include `tags`, `security`, `parameters`, and `responses`
- Security should list both `BearerAuth` and `CookieAuth`

## Response Patterns
- 200: Success
- 400: Bad request / missing params
- 401: Unauthorized (handled by middleware)
- 404: Resource not found
- 405: Method not allowed
- 500: Internal server error (always catch and log)
