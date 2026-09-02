# React & Frontend Rules

## MUI Grid v2 (MUI v6+)
This project uses the new Grid `size` prop syntax:
- Correct: `<Grid size={{ xs: 12, sm: 6, md: 3 }}>`
- WRONG: `<Grid item xs={12} sm={6} md={3}>`

## UI Components
- Use MUI components first — avoid raw CSS/HTML when MUI has an equivalent
- Import from `@mui/material` (Button, Card, Typography, etc.)
- Use MUI theme tokens for colors — never hardcode hex values for light/dark mode
- Use `useTheme()` or `sx` prop for dynamic styling

## State Management
- Uses `@tanstack/react-query` for server state (NOT SWR)
- Import: `import { useQuery, useMutation } from '@tanstack/react-query'`
- Use React Context for auth and theme state only

## Theme
- Support both light and dark mode
- Use `theme.palette.*` tokens instead of hardcoded colors
- Marketing pages have a separate theme — don't mix with app theme

## File Structure
- Feature modules live in `src/features/<name>/`
- Shared UI components in `src/ui/`
- Pages in `src/pages/` (Next.js file-based routing)
