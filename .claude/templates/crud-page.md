# CRUD Page Template

Pre-configured requirements for creating a full CRUD interface.

## Template Variables

- `$RESOURCE` - Resource name (e.g., "users", "products", "posts")
- `$FIELDS` - Fields for the resource

## Requirements

### Functional Requirements

1. **List View**
   - Display all $RESOURCE in a table/list
   - Pagination support
   - Search/filter functionality
   - Sort by columns

2. **Create View**
   - Form to create new $RESOURCE
   - Input validation
   - Success/error feedback

3. **Edit View**
   - Form to edit existing $RESOURCE
   - Pre-populate with current values
   - Input validation
   - Success/error feedback

4. **Delete**
   - Confirmation dialog
   - Soft delete or hard delete
   - Success/error feedback

5. **Detail View** (optional)
   - Display single $RESOURCE details
   - Navigation to edit

### Technical Requirements

1. Follow existing UI patterns
2. Use existing form/table components
3. Implement proper loading states
4. Handle error states gracefully
5. Add TypeScript types for $RESOURCE

### Files to Create/Modify

**Frontend:**
- `src/pages/$RESOURCE/index.tsx` - List view
- `src/pages/$RESOURCE/[id].tsx` - Detail/edit view
- `src/pages/$RESOURCE/new.tsx` - Create view
- `src/components/$RESOURCE/` - Shared components
  - `$ResourceForm.tsx`
  - `$ResourceTable.tsx`
  - `$ResourceCard.tsx`

**API (if needed):**
- `src/api/$RESOURCE.ts` - CRUD endpoints
- `src/types/$RESOURCE.ts` - Types

**Tests:**
- `tests/pages/$RESOURCE.test.tsx`
- `tests/api/$RESOURCE.test.ts`

### UI Components Pattern

```tsx
// List page
export default function ResourceListPage() {
  const { data, loading, error } = useResources();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <PageLayout title="Resources">
      <ResourceTable data={data} />
      <Pagination />
    </PageLayout>
  );
}
```

### API Pattern

```typescript
// CRUD operations
GET    /api/$RESOURCE      - List all
GET    /api/$RESOURCE/:id  - Get one
POST   /api/$RESOURCE      - Create
PUT    /api/$RESOURCE/:id  - Update
DELETE /api/$RESOURCE/:id  - Delete
```

### Example Usage

```bash
# Create users CRUD
/auto-pipeline --template=crud-page "users with name, email, role fields"

# Create products CRUD
/auto-pipeline --template=crud-page "products with name, price, description, category"
```
