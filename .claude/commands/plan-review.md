Create an implementation plan and automatically review it for the following task:

$ARGUMENTS

Execute these steps IN SEQUENCE. Do NOT skip steps.

---

## Step 1: Plan

Use the **planner** agent (Task tool with subagent_type="planner"). Pass it the original task description.

Prompt: "Create a detailed implementation plan for: [TASK]. Explore the codebase to understand existing patterns before planning."

After the planner finishes, provide a brief summary of the plan to the user.

---

## Step 2: Review Plan

Use the **plan-reviewer** agent (Task tool with subagent_type="plan-reviewer"). Pass it the full plan from Step 1.

Prompt: "Review this implementation plan for completeness, feasibility, and convention compliance: [PLAN]"

- If verdict is **APPROVED**: present the plan to the user with a green light.
- If verdict is **APPROVED WITH CHANGES**: present the plan with the suggested changes highlighted.
- If verdict is **NEEDS REVISION**: go back to Step 1 with the reviewer's feedback. Maximum 2 revision cycles — if still not approved after 2 cycles, present the best version and note the concerns.

---

## Final Summary

After all steps complete, provide a summary:

```
## Plan Review Complete

### Task
[Original task description]

### Plan Summary
[What was planned — files to change, approach, key decisions]

### Review Verdict: [APPROVED | APPROVED WITH CHANGES | NEEDS REVISION]
[Key findings and any suggested changes]

### Next Steps
[What the user should do — e.g., "Run `/auto-pipeline` (or `bash run-pipeline.sh \"<task>\"`) to implement" or "Approve and I'll start coding"]
```
