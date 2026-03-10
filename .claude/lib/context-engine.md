# Context Engine Library

Learn from history to provide context-aware recommendations.

## Purpose

Analyze pipeline history and project state to provide intelligent suggestions before running pipelines.

## Data Sources

### History Analysis

Load from `.claude/history.json`:
```javascript
const history = loadHistory();

// Extract patterns
const taskPatterns = history.map(h => ({
  task: h.task,
  status: h.status,
  profile: h.profile,
  cost: h.cost,
  failedPhase: h.failedPhase,
  error: h.error
}));
```

### Similar Task Detection

Find similar past tasks:
```javascript
function findSimilarTasks(currentTask, history, threshold = 0.6) {
  return history
    .map(h => ({
      ...h,
      similarity: calculateSimilarity(currentTask, h.task)
    }))
    .filter(h => h.similarity > threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function calculateSimilarity(a, b) {
  // Tokenize and compare
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  // Jaccard similarity
  const intersection = tokensA.filter(t => tokensB.includes(t));
  const union = [...new Set([...tokensA, ...tokensB])];

  return intersection.length / union.length;
}
```

### Failure Pattern Detection

Identify tasks that commonly fail:
```javascript
function getFailurePatterns(history) {
  const failedTasks = history.filter(h => h.status === 'failed');

  // Group by failure phase
  const byPhase = groupBy(failedTasks, 'failedPhase');

  // Extract common keywords
  const patterns = {};
  for (const [phase, tasks] of Object.entries(byPhase)) {
    const keywords = extractKeywords(tasks.map(t => t.task));
    patterns[phase] = {
      count: tasks.length,
      keywords,
      commonErrors: extractCommonErrors(tasks)
    };
  }

  return patterns;
}
```

## Context Checks

### Pre-Run Analysis

Before starting pipeline:

```javascript
async function analyzeContext(task, config) {
  const warnings = [];
  const suggestions = [];

  // 1. Check for similar past failures
  const similarFailed = findSimilarTasks(task, history)
    .filter(h => h.status === 'failed');

  if (similarFailed.length > 0) {
    warnings.push({
      type: 'past-failure',
      message: `Similar task "${similarFailed[0].task}" failed on Phase ${similarFailed[0].failedPhase}`,
      suggestion: `Review: ${similarFailed[0].error}`
    });
  }

  // 2. Check task type and recommend profile
  const taskType = detectTaskType(task);

  if (taskType === 'payment' || taskType === 'security') {
    suggestions.push({
      type: 'profile-upgrade',
      message: 'Detected security-sensitive task',
      suggestion: 'Consider using --paranoid profile'
    });
  }

  // 3. Check for files that were modified often
  const hotspots = getRecentlyModifiedFiles(history, task);
  if (hotspots.length > 0) {
    warnings.push({
      type: 'hotspot',
      message: `${hotspots[0]} was modified ${hotspots[0].count} times today`,
      suggestion: 'Extra review recommended'
    });
  }

  return { warnings, suggestions };
}
```

### Task Type Detection

```javascript
const taskTypes = {
  payment: /pay|stripe|billing|invoice|subscript/i,
  security: /auth|login|password|token|session|permission/i,
  api: /api|endpoint|route|handler/i,
  ui: /component|page|button|form|modal|ui/i,
  database: /database|migration|schema|model|query/i,
  test: /test|spec|coverage/i,
  docs: /document|readme|jsdoc|swagger/i
};

function detectTaskType(task) {
  for (const [type, pattern] of Object.entries(taskTypes)) {
    if (pattern.test(task)) return type;
  }
  return 'general';
}
```

### Profile Recommendations

```javascript
const profileRecommendations = {
  payment: {
    recommended: 'paranoid',
    reason: 'Payment code requires extra security scrutiny'
  },
  security: {
    recommended: 'paranoid',
    reason: 'Security-sensitive code needs thorough review'
  },
  api: {
    recommended: 'standard',
    reason: 'API changes benefit from full QA'
  },
  ui: {
    recommended: 'fast',
    reason: 'UI changes can skip some QA phases'
  },
  test: {
    recommended: 'yolo',
    reason: 'Test code can use minimal pipeline'
  },
  docs: {
    recommended: 'yolo',
    reason: 'Documentation changes are low risk'
  }
};
```

## Output Format

Before pipeline starts:

```
/auto-pipeline "add payment processing"

⚠ Context-aware suggestions:
  • Similar task "add stripe integration" failed on security phase
    └─ Error: SQL injection vulnerability detected

  • Payment code detected → recommending --paranoid profile

  • src/api/payments.ts was modified 3 times today
    └─ Consider extra review

Proceed with --paranoid? [Y/n/custom]
```

## Learning

Track successful patterns:
```javascript
async function recordSuccess(session) {
  const entry = await loadSession(session);

  // Record what worked
  await updatePatterns({
    taskType: entry.taskType,
    profile: entry.profile,
    flags: entry.flags,
    success: true,
    cost: entry.cost,
    duration: entry.duration
  });
}
```

Use patterns for future recommendations:
```javascript
function getRecommendedConfig(taskType) {
  const successfulRuns = history
    .filter(h => h.taskType === taskType && h.status === 'success')
    .sort((a, b) => a.cost - b.cost);

  if (successfulRuns.length > 0) {
    return {
      profile: mode(successfulRuns.map(r => r.profile)),
      flags: commonFlags(successfulRuns),
      estimatedCost: average(successfulRuns.map(r => r.cost))
    };
  }

  return defaultConfig(taskType);
}
```
