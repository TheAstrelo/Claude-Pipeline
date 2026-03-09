Cost estimate - project API costs, infrastructure impact, and database growth.

---

## Purpose

Estimate the cost impact of a proposed feature BEFORE design:
- External API costs (Serper, Groq, HubSpot, Salesforce)
- LLM token usage and costs
- Database growth (new tables, rows, storage)
- Redis/cache impact
- Cost projections at 100/500/1000 user tiers

---

## Execution

Use the **cost-estimator** agent.

**Input:** Read `brief.md` to understand feature scope.

**Process:**

1. Read brief.md for scope and requirements
2. Identify cost-bearing operations
3. Grep codebase for existing usage patterns
4. Estimate per-request and monthly costs at 3 tiers
5. Estimate database and cache growth
6. Identify optimization opportunities
7. Write to `cost-estimate.md`

---

## Output

After estimating, report:

```
## Cost Estimate Complete

**Verdict:** [ACCEPTABLE | REVIEW_COSTS | EXPENSIVE]

### Projections
| Scale | Monthly API | Monthly Infra | Total |
|-------|-------------|---------------|-------|
| 100 users | $[X] | $[X] | $[X] |
| 500 users | $[X] | $[X] | $[X] |
| 1000 users | $[X] | $[X] | $[X] |

### Top Cost Drivers
1. [Service/operation] — $[X]/month
2. [Service/operation] — $[X]/month

### Optimization Opportunities
1. [Suggestion with savings]
```

---

## Verdict Levels

- **ACCEPTABLE:** < $50/mo at 100 users, no call > $0.10
- **REVIEW_COSTS:** $50-$200/mo, or new expensive service dependency
- **EXPENSIVE:** > $200/mo at 100 users, or uncapped cost growth

---

## Gate

This command runs after Requirements, before Design.
Order: `/arm` → `/estimate-cost` → `/design`
