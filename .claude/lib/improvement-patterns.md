# Improvement Patterns Library

Patterns for proactive issue detection in `/pipeline-scan`.

## Categories

### Missing Tests

**Detection:**

1. Source files without corresponding test files:
```javascript
const srcFiles = glob('src/**/*.ts').filter(f => !f.includes('.test.'));
const testFiles = glob('{tests,__tests__}/**/*.test.ts');

const untested = srcFiles.filter(src => {
  const baseName = path.basename(src, '.ts');
  return !testFiles.some(test => test.includes(baseName));
});
```

2. Recently modified files without test updates:
```bash
# Files changed in last 7 days
git diff --name-only HEAD~7 -- 'src/**/*.ts' | \
  while read f; do
    test_file="${f/src/tests}"
    test_file="${test_file/.ts/.test.ts}"
    if ! git diff --name-only HEAD~7 | grep -q "$test_file"; then
      echo "$f"
    fi
  done
```

**Output:**
```
⚠ Missing tests
  └─ src/api/users.ts has no corresponding test file
  └─ src/utils/format.ts modified without test update
  └─ Suggestion: /auto-pipeline "add tests for users API"
```

---

### Security Vulnerabilities

**Detection:**

1. npm audit:
```bash
npm audit --json 2>/dev/null | jq '.vulnerabilities | length'
```

2. Hardcoded secrets:
```javascript
const secretPatterns = [
  /(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"]{8,}['"]/gi,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /ghp_[A-Za-z0-9]{36}/,  // GitHub token
  /sk_live_[A-Za-z0-9]{24}/  // Stripe key
];
```

3. Known vulnerable patterns:
```javascript
const vulnerablePatterns = [
  { pattern: /eval\(/, type: 'code-injection' },
  { pattern: /innerHTML\s*=/, type: 'xss' },
  { pattern: /\$\{.*\}.*SELECT/i, type: 'sql-injection' }
];
```

**Output:**
```
⚠ Security
  └─ npm audit found 2 moderate, 1 high vulnerability
  └─ src/config.ts:15 contains hardcoded API key
  └─ Suggestion: /auto-pipeline "fix npm audit vulnerabilities"
```

---

### Documentation Gaps

**Detection:**

1. Exported functions without JSDoc:
```javascript
const exported = grep('export (function|const|class)', 'src/**/*.ts');
const documented = grep('/\*\*[\s\S]*?\*/\s*export', 'src/**/*.ts');
const undocumented = exported.filter(e => !documented.includes(e.file));
```

2. Missing README sections:
```javascript
const requiredSections = ['Installation', 'Usage', 'API'];
const readme = read('README.md');
const missingSections = requiredSections.filter(s => !readme.includes(`# ${s}`));
```

3. Outdated documentation:
```bash
# README mentions files that don't exist
grep -oE 'src/[a-zA-Z/]+\.(ts|js)' README.md | \
  while read f; do
    [ ! -f "$f" ] && echo "$f"
  done
```

**Output:**
```
⚠ Documentation
  └─ src/api/auth.ts missing JSDoc on 5 exports
  └─ README.md references non-existent src/old-file.ts
  └─ Suggestion: /auto-pipeline "add jsdoc to auth module"
```

---

### Code Quality

**Detection:**

1. Large files:
```bash
find src -name '*.ts' -exec wc -l {} \; | \
  awk '$1 > 500 { print $2 ": " $1 " lines" }'
```

2. Complex functions:
```javascript
// Cyclomatic complexity > 10
const complexFunctions = analyzeComplexity('src/**/*.ts')
  .filter(f => f.complexity > 10);
```

3. TODO/FIXME comments:
```bash
grep -rn 'TODO\|FIXME\|HACK\|XXX' src/ --include='*.ts'
```

4. Console statements:
```bash
grep -rn 'console\.(log|debug|info)' src/ --include='*.ts'
```

**Output:**
```
⚠ Code quality
  └─ src/utils/parser.ts is 847 lines (consider splitting)
  └─ 12 TODO comments found
  └─ 3 console.log statements in production code
  └─ Suggestion: /auto-pipeline "refactor parser into smaller modules"
```

---

### Outdated Dependencies

**Detection:**

```bash
npm outdated --json 2>/dev/null | jq 'to_entries | length'
```

**Output:**
```
⚠ Dependencies
  └─ 5 packages have major updates available
  └─ react: 17.0.2 → 18.2.0
  └─ typescript: 4.9.5 → 5.3.3
  └─ Suggestion: /auto-pipeline "update dependencies"
```

---

### Type Safety

**Detection:**

1. Any types:
```bash
grep -rn ': any' src/ --include='*.ts' | wc -l
```

2. Type assertions:
```bash
grep -rn 'as any\|as unknown' src/ --include='*.ts' | wc -l
```

3. Missing return types:
```javascript
const functionsWithoutReturnType = grep(
  'function [a-z]+\([^)]*\)\s*{',  // No return type
  'src/**/*.ts'
);
```

**Output:**
```
⚠ Type safety
  └─ 15 uses of 'any' type
  └─ 8 type assertions (as any, as unknown)
  └─ Suggestion: /auto-pipeline "improve type safety in utils"
```

---

## Priority Scoring

```javascript
const priorities = {
  'security-critical': 100,
  'security-moderate': 80,
  'security-low': 60,
  'missing-tests-critical': 70,
  'missing-tests-new': 50,
  'missing-tests-old': 30,
  'documentation-api': 40,
  'documentation-readme': 35,
  'code-quality-complexity': 45,
  'code-quality-size': 35,
  'dependencies-security': 75,
  'dependencies-major': 25,
  'type-safety': 20
};
```

## Aggregation

Group related issues:
```javascript
function aggregateIssues(issues) {
  const groups = {
    security: issues.filter(i => i.category === 'security'),
    tests: issues.filter(i => i.category === 'tests'),
    docs: issues.filter(i => i.category === 'documentation'),
    quality: issues.filter(i => i.category === 'code-quality')
  };

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .sort((a, b) => maxPriority(b[1]) - maxPriority(a[1]));
}
```
