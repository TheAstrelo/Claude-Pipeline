Create an implementation plan and automatically review it for the following task:

$ARGUMENTS

Execute these steps IN SEQUENCE. Do NOT skip steps.

---

## Step 1: Consult Codex

Use the `mcp__codex-advisor__ask_codex` tool to get a second opinion on the high-level approach. Ask Codex:

> "I need to implement the following task in a Next.js/TypeScript/MUI/PostgreSQL B2B platform: [TASK]. What's your recommended approach, key architectural considerations, and potential pitfalls to watch out for?"

Save Codex's response for the planner.

---

## Step 2: Plan

Use the **planner** agent (Task tool with subagent_type="planner"). Pass it:
- The original task description
- Codex's advice from Step 1

Prompt: "Create a detailed implementation plan for: [TASK]. Consider the following advice from Codex: [CODEX RESPONSE]. Explore the codebase to understand existing patterns before planning."

After the planner finishes, provide a brief summary of the plan to the user.

---

## Step 3: Review Plan

Use the **plan-reviewer** agent (Task tool with subagent_type="plan-reviewer"). Pass it the full plan from Step 2.

Prompt: "Review this implementation plan for completeness, feasibility, and convention compliance: [PLAN]"

- If verdict is **APPROVED**: present the plan to the user with a green light.
- If verdict is **APPROVED WITH CHANGES**: present the plan with the suggested changes highlighted.
- If verdict is **NEEDS REVISION**: go back to Step 2 with the reviewer's feedback. Maximum 2 revision cycles — if still not approved after 2 cycles, present the best version and note the concerns.

---

## Final Summary

After all steps complete, provide a summary:

```
## Plan Review Complete

### Task
[Original task description]

### Codex Advice
[Key points from Codex]

### Plan Summary
[What was planned — files to change, approach, key decisions]

### Review Verdict: [APPROVED | APPROVED WITH CHANGES | NEEDS REVISION]
[Key findings and any suggested changes]

### Next Steps
[What the user should do — e.g., "Run `/dev-pipeline` to implement" or "Approve and I'll start coding"]
```
