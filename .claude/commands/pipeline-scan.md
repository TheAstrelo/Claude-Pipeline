# Pipeline Scan Command

Proactive code analysis to detect issues and suggest improvements.

## Arguments

- `$ARGUMENTS` - Optional flags:
  - `--full` - Deep scan (slower, more thorough)
  - `--security` - Security-focused scan only
  - `--tests` - Test coverage scan only
  - `--deps` - Dependency scan only
  - `--json` - Output as JSON

## Instructions

### 1. Quick Scan (Default)

Perform fast, non-blocking checks using the code-scanner agent:

**Categories to check:**
1. Missing tests
2. Security vulnerabilities
3. Documentation gaps
4. Code quality issues
5. Outdated dependencies
6. Type safety issues

### 2. Execute Scan

Load the code-scanner agent from `.claude/agents/code-scanner.md`.

Run checks based on flags:
- Default: all categories
- `--security`: security only
- `--tests`: test coverage only
- `--deps`: dependencies only

### 3. Aggregate Results

Collect all issues and rank by priority using `.claude/lib/improvement-patterns.md`.

Priority order:
1. Security critical (score: 100)
2. Security moderate (score: 80)
3. Missing tests for critical code (score: 70)
4. Missing tests for new code (score: 50)
5. Code quality issues (score: 45)
6. Documentation gaps (score: 40)
7. Outdated dependencies (score: 25)
8. Type safety (score: 20)

### 4. Output Results

**Default format:**
```
/pipeline-scan

Found {N} opportunities:

  ⚠ {Category 1}
    └─ {Issue description}
    └─ Suggestion: /auto-pipeline "{suggested task}"

  ⚠ {Category 2}
    └─ {Issue description}
    └─ Suggestion: /auto-pipeline "{suggested task}"

  ⚠ {Category 3}
    └─ {Issue description}
    └─ Suggestion: /auto-pipeline "{suggested task}"

Quick stats:
  Files scanned: {count}
  TODOs found: {count}
  TypeScript coverage: {percent}%
  Last modified: {file} ({time} ago)

Run suggested pipelines? [1/2/3/all/none]
```

**JSON format (`--json`):**
```json
{
  "issues": [
    {
      "category": "security",
      "priority": 80,
      "description": "npm audit found 2 moderate vulnerabilities",
      "suggestion": "fix npm audit vulnerabilities",
      "files": ["package.json"]
    }
  ],
  "stats": {
    "filesScanned": 47,
    "todosFound": 12,
    "typeScriptCoverage": 89,
    "lastModified": {
      "file": "src/api/payments.ts",
      "time": "2 hours ago"
    }
  }
}
```

### 5. Handle Selection

If user selects a number or "all":

**Single selection (e.g., "1"):**
- Extract the suggestion for that issue
- Run: `/auto-pipeline "{suggestion}"`

**All selection:**
- Create a combined task list
- Ask for confirmation
- Run pipelines sequentially or show todo list

**None:**
- Exit without action

### 6. Full Scan Mode

If `--full` flag:
- Run deeper analysis
- Check all files, not just recent
- Include cyclomatic complexity
- Run actual npm audit (not cached)
- Check for all security patterns
- Takes longer but more thorough

### 7. Caching

To keep scans fast:
- Cache results in `.claude/cache/scan-results.json`
- Invalidate cache when files change
- Show "(cached)" indicator if using cached data
- `--full` always bypasses cache

## Example Outputs

**Clean codebase:**
```
/pipeline-scan

All clear! No significant issues found.

Quick stats:
  Files scanned: 47
  TODOs found: 2
  TypeScript coverage: 95%
  Test coverage: 87%
  Last scan: just now
```

**Issues found:**
```
/pipeline-scan

Found 4 opportunities:

  ⚠ Security (HIGH)
    └─ npm audit found 1 high, 2 moderate vulnerabilities
    └─ lodash@4.17.20 has prototype pollution vulnerability
    └─ Suggestion: /auto-pipeline "fix npm audit vulnerabilities"

  ⚠ Missing tests
    └─ src/api/users.ts has no corresponding test file
    └─ src/utils/crypto.ts modified 3 days ago, tests unchanged
    └─ Suggestion: /auto-pipeline "add tests for users API"

  ⚠ Code quality
    └─ src/services/parser.ts is 892 lines
    └─ 8 console.log statements found in production code
    └─ Suggestion: /auto-pipeline "refactor parser module"

  ⚠ Documentation
    └─ src/api/auth.ts missing JSDoc on 7 exports
    └─ README.md mentions deprecated endpoint
    └─ Suggestion: /auto-pipeline "add documentation to auth"

Quick stats:
  Files scanned: 52
  TODOs found: 15
  TypeScript coverage: 82%

Run suggested pipelines? [1/2/3/4/all/none]
```

## Notes

- Scan completes in <10 seconds (quick mode)
- Full scan may take 30-60 seconds
- Results are cached for 15 minutes
- Use `--full` for thorough pre-PR analysis
