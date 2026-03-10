# Error Patterns Library

Common error patterns and their fixes for the suggestion engine.

## Security Patterns

### SQL Injection

**Pattern:**
```regex
/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i
/'.*\+.*'.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i
/string concatenation.*sql|sql.*string concat/i
```

**Example Detection:**
```typescript
// Bad
const query = `SELECT * FROM users WHERE email = '${email}'`;
db.query(`DELETE FROM posts WHERE id = ${postId}`);
```

**Fix:**
```typescript
// Good - Parameterized query
const query = `SELECT * FROM users WHERE email = $1`;
db.query(query, [email]);

// Good - ORM
await db.users.findOne({ where: { email } });
```

**Suggestion Template:**
```
Use parameterized query instead of string interpolation
└─ {file}:{line}
└─ Before: `WHERE email = '${email}'`
└─ After:  `WHERE email = $1`, [email]
```

---

### XSS (Cross-Site Scripting)

**Pattern:**
```regex
/innerHTML\s*=\s*[^;]*\$/
/dangerouslySetInnerHTML/
/document\.write\(/
```

**Example Detection:**
```typescript
// Bad
element.innerHTML = userInput;
<div dangerouslySetInnerHTML={{ __html: userContent }} />
```

**Fix:**
```typescript
// Good - Use textContent
element.textContent = userInput;

// Good - Sanitize HTML
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

---

### Command Injection

**Pattern:**
```regex
/exec\(.*\$\{/
/spawn\(.*\+/
/child_process.*user/i
```

**Example Detection:**
```typescript
// Bad
exec(`ls ${userPath}`);
spawn('grep', [userInput, 'file.txt']);
```

**Fix:**
```typescript
// Good - Validate and escape
import { escape } from 'shell-escape';
exec(`ls ${escape(userPath)}`);

// Better - Avoid shell entirely
import { readdir } from 'fs/promises';
await readdir(validatePath(userPath));
```

---

### Hardcoded Secrets

**Pattern:**
```regex
/(?:password|secret|key|token|api[_-]?key)\s*[=:]\s*['"][A-Za-z0-9+/=]{16,}['"]/i
/(?:AWS|GITHUB|STRIPE)[_A-Z]*\s*=\s*['"][^'"]+['"]/
```

**Example Detection:**
```typescript
// Bad
const API_KEY = 'sk_live_abc123xyz789';
const password = 'supersecret123';
```

**Fix:**
```typescript
// Good - Use environment variables
const API_KEY = process.env.API_KEY;
const password = process.env.DB_PASSWORD;
```

---

## Code Quality Patterns

### Missing Error Handling

**Pattern:**
```regex
/\.then\([^)]+\)(?!\s*\.catch)/
/await\s+[^;]+(?!.*try)/
```

**Example Detection:**
```typescript
// Bad
await db.query(sql);
fetch(url).then(res => res.json());
```

**Fix:**
```typescript
// Good
try {
  await db.query(sql);
} catch (error) {
  logger.error('Query failed', error);
  throw new DatabaseError('Query failed');
}

// Good
fetch(url)
  .then(res => res.json())
  .catch(error => handleError(error));
```

---

### Unhandled Promise Rejection

**Pattern:**
```regex
/new Promise\([^)]+\)(?!.*reject)/
/async.*\{[^}]*throw(?![^}]*catch)/
```

**Example Detection:**
```typescript
// Bad
new Promise((resolve) => {
  if (error) throw error; // Unhandled
  resolve(data);
});
```

**Fix:**
```typescript
// Good
new Promise((resolve, reject) => {
  if (error) reject(error);
  resolve(data);
});
```

---

### Missing Input Validation

**Pattern:**
```regex
/req\.(?:body|params|query)\.[a-z]+(?!.*validat)/i
/const\s*\{[^}]+\}\s*=\s*req\.body(?!.*schema)/
```

**Example Detection:**
```typescript
// Bad
const { email, password } = req.body;
await createUser(email, password);
```

**Fix:**
```typescript
// Good
const { email, password } = validateInput(req.body, userSchema);
await createUser(email, password);

// With zod
const parsed = userSchema.parse(req.body);
```

---

## Test Patterns

### Missing Assertions

**Pattern:**
```regex
/it\(['""][^'"]+['""]\s*,\s*(?:async\s*)?\(\)\s*=>\s*\{[^}]*\}(?!.*expect|assert)/
```

**Example Detection:**
```typescript
// Bad
it('should do something', () => {
  doSomething();
  // No assertion!
});
```

**Fix:**
```typescript
// Good
it('should do something', () => {
  const result = doSomething();
  expect(result).toBe(expected);
});
```

---

### Flaky Test Patterns

**Pattern:**
```regex
/setTimeout.*test/i
/Date\.now\(\).*expect/
/Math\.random\(\).*test/i
```

**Example Detection:**
```typescript
// Bad - Time-dependent
expect(Date.now() - start).toBeLessThan(100);

// Bad - Random values
const id = Math.random();
expect(result.id).toBe(id);
```

**Fix:**
```typescript
// Good - Mock time
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));

// Good - Deterministic values
const id = 'test-id-123';
expect(result.id).toBe(id);
```

---

## Usage

The suggestion engine loads these patterns and matches against failure artifacts:

```javascript
import { errorPatterns } from './error-patterns';

function generateSuggestion(error, file, line) {
  for (const [name, pattern] of Object.entries(errorPatterns)) {
    if (pattern.regex.test(error.message)) {
      return {
        type: name,
        fix: pattern.fix,
        file,
        line,
        example: pattern.example
      };
    }
  }
  return null;
}
```
