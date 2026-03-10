# Code Scanner Agent

Lightweight agent for proactive code analysis and improvement detection.

## Purpose

Scan the codebase for potential issues, missing tests, outdated dependencies, and improvement opportunities without running the full pipeline.

## Usage

Invoked by `/pipeline-scan` command.

## Instructions

### 1. Quick Analysis

Perform fast, non-blocking checks:

**File Analysis:**
- Identify recently modified files (last 7 days)
- Find large files (>500 lines)
- Detect files without corresponding tests

**Dependency Check:**
- Run `npm audit` or equivalent
- Check for outdated packages
- Look for deprecated dependencies

**Code Patterns:**
- Find TODO/FIXME comments
- Detect console.log statements
- Identify missing TypeScript types

### 2. Test Coverage

Quick coverage analysis:
- Files with no test files
- Test files with no assertions
- Recently modified code without test updates

```javascript
// Check for test files
const srcFiles = glob('src/**/*.ts');
const testFiles = glob('tests/**/*.test.ts');

const untested = srcFiles.filter(src => {
  const testPath = src.replace('src/', 'tests/').replace('.ts', '.test.ts');
  return !testFiles.includes(testPath);
});
```

### 3. Security Scan

Quick security checks:
- Hardcoded secrets patterns
- Unsafe regex patterns
- Unvalidated user input
- SQL string concatenation

```javascript
const securityPatterns = [
  /password\s*=\s*['"][^'"]+['"]/i,
  /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
  /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i,
  /innerHTML\s*=\s*[^;]+\$/
];
```

### 4. Documentation Check

Quick doc analysis:
- Missing JSDoc on exported functions
- Outdated README references
- Missing API documentation

### 5. Generate Report

Output structured report:

```
/pipeline-scan

Found 3 opportunities:

  ⚠ Missing tests
    └─ src/api/users.ts has 0% coverage
    └─ Suggestion: /auto-pipeline "add tests for users API"

  ⚠ Security
    └─ npm audit found 2 moderate vulnerabilities
    └─ Suggestion: /auto-pipeline "fix npm audit vulnerabilities"

  ⚠ Documentation
    └─ src/api/auth.ts missing JSDoc on 5 exports
    └─ Suggestion: /auto-pipeline "add jsdoc to auth module"

Quick stats:
  Files scanned: 47
  TODOs found: 12
  TypeScript coverage: 89%
  Last modified: src/api/payments.ts (2 hours ago)

Run suggested pipelines? [1/2/3/all/none]
```

### 6. Priority Scoring

Rank issues by priority:

```javascript
const priorities = {
  'security-critical': 100,
  'security-moderate': 80,
  'missing-tests-new': 60,
  'missing-tests-old': 40,
  'documentation': 20,
  'code-style': 10
};
```

Show highest priority first.

### 7. Caching

Cache scan results to avoid repeated work:
- Store in `.claude/cache/scan-results.json`
- Invalidate on file changes
- Show "cached" indicator if using cached data

## Performance

Scan should complete in <10 seconds:
- Use git status for changed files
- Sample large directories
- Skip node_modules, dist, etc.
- Parallel checks where possible

## Configuration

Respect settings from `.claude/settings.json`:

```json
{
  "pipeline": {
    "scan": {
      "excludeDirs": ["node_modules", "dist", ".next"],
      "maxFileSize": 500,
      "securityPatterns": true,
      "coverageThreshold": 80
    }
  }
}
```
