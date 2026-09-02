/**
 * Convert free text into a URL-friendly slug: lower-case, every run of
 * characters outside `a-z0-9` becomes a dash, leading/trailing dashes are
 * trimmed.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "");
}
