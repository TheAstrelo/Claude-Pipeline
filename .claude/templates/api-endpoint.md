# API Endpoint Template

Pre-configured requirements for adding a new API endpoint.

## Template Variables

- `$NAME` - Endpoint name (e.g., "users", "products")
- `$METHOD` - HTTP method (GET, POST, PUT, DELETE)
- `$PATH` - URL path (e.g., "/api/users")

## Requirements

### Functional Requirements

1. Create a new `$METHOD $PATH` endpoint
2. Handle request validation
3. Implement business logic for $NAME
4. Return appropriate response format (JSON)
5. Handle error cases with proper status codes

### Technical Requirements

1. Follow existing API patterns in the codebase
2. Add input validation using existing validation library
3. Include proper TypeScript types for request/response
4. Add authentication/authorization if required
5. Implement rate limiting if applicable

### Files to Create/Modify

- `src/api/$NAME.ts` or `src/routes/$NAME.ts` - Main handler
- `src/types/$NAME.ts` - TypeScript interfaces
- `src/validators/$NAME.ts` - Input validation schema
- `tests/api/$NAME.test.ts` - Unit tests

### Security Checklist

- [ ] Input validation
- [ ] SQL injection prevention (parameterized queries)
- [ ] Authentication check
- [ ] Authorization check
- [ ] Rate limiting
- [ ] Logging (no sensitive data)

### Response Format

```typescript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Example Usage

```bash
# Create a users GET endpoint
/auto-pipeline --template=api-endpoint "users GET /api/users"

# Create a products POST endpoint
/auto-pipeline --template=api-endpoint "products POST /api/products"
```
