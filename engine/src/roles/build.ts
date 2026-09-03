/**
 * Build: execute the plan in the run worktree.
 *
 * This is the only role that writes code. It runs under command guards and
 * protected paths, so the things it must not do are blocked at the point of
 * attempt rather than found by a scanner afterwards.
 */

import { ENGINEERING_STANDARD, header, parseMarkdownVerdict, renderSteps, type PromptContext } from "./common.js";
import type { PlanOutput } from "./plan.js";

export interface BuildOutput {
  verdict: "SUCCESS" | "PARTIAL" | "FAILED";
  filesChanged: string[];
  notes: string;
  /** Set when the builder stopped because the plan could not be executed. */
  blockedReason: string | null;
}

export const BUILD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "filesChanged", "notes", "blockedReason"],
  properties: {
    verdict: { type: "string", enum: ["SUCCESS", "PARTIAL", "FAILED"] },
    filesChanged: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    blockedReason: { type: ["string", "null"] },
  },
} as const;

export interface BuildInput extends PromptContext {
  plan: PlanOutput;
  verificationNote: string;
  /** Lint findings that were waived; the builder should verify these anchors itself. */
  lintNotes: string | null;
}

export function buildBuildPrompt(input: BuildInput): string {
  const parts = [
    header(input, "builder"),
    `## Success criteria

${input.plan.brief.criteria.map(c => `- ${c.id}: ${c.statement}`).join("\n") || "None stated."}

## The plan

${renderSteps(input.plan.steps)}`,
    `## How to work

Execute the steps in order. The plan states intent, not code: write the code the intent calls for, in the style of the file you are editing.

If a step cannot be executed as written — the anchor moved, the design does not fit what the code actually does — do not improvise around it silently. Do the part that is right, and record what you could not do and why in blockedReason. A partial change that is honest about its gap is worth more than a complete one that hides a wrong assumption.

When the steps are done, verify your own work before returning:
1. Run the verification commands (${input.verificationNote}) and fix what you broke.
2. Re-read your own diff with \`git diff\`. Check it against the engineering standard below, line by line. Delete anything you added that no criterion needed: a helper with one caller, a defensive branch nobody can reach, a comment restating the code, debug output.

Return SUCCESS only when every step is done and the verification commands pass. The orchestrator runs those commands itself afterwards, so claiming success without running them just delays the same failure.`,
  ];
  if (input.lintNotes) {
    parts.push(`## Anchors the pre-build lint could not confirm\n\nTreat these as approximate. Find the real location before editing.\n\n${input.lintNotes}`);
  }
  parts.push(ENGINEERING_STANDARD);
  return parts.join("\n\n");
}

export function parseBuild(structured: unknown, report: string): BuildOutput {
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    const verdict = String(record["verdict"] ?? "").toUpperCase();
    if (verdict === "SUCCESS" || verdict === "PARTIAL" || verdict === "FAILED") {
      return {
        verdict,
        filesChanged: Array.isArray(record["filesChanged"]) ? record["filesChanged"].map(String) : [],
        notes: String(record["notes"] ?? ""),
        blockedReason: typeof record["blockedReason"] === "string" && record["blockedReason"].trim() ? record["blockedReason"] : null,
      };
    }
  }
  const parsed = parseMarkdownVerdict(report, ["SUCCESS", "PARTIAL", "FAILED"]);
  return {
    verdict: parsed === "FAILED" ? "FAILED" : parsed === "PARTIAL" ? "PARTIAL" : "SUCCESS",
    filesChanged: [],
    notes: report.slice(0, 4000),
    blockedReason: null,
  };
}

export interface BuildFixInput extends PromptContext {
  failingOutput: string;
  verificationNote: string;
}

/** In-build repair, seeded with the real failing output rather than a summary. */
export function buildFixPrompt(input: BuildFixInput): string {
  return [
    header(input, "builder, fixing a failing verification run"),
    `## What failed

The frozen verification commands (${input.verificationNote}) were run against your change and did not pass. This is the actual output:

\`\`\`
${input.failingOutput}
\`\`\``,
    `## How to fix it

Read the failure before changing anything: the first error is usually the only real one. Fix the cause in the code you changed.

Do not weaken a test, delete an assertion, or edit the package scripts the verification commands call. If the test is right and your change is wrong, change your code. If the failure is in code your change never touched and was already failing before, say so and stop rather than widening the change.`,
    ENGINEERING_STANDARD,
  ].join("\n\n");
}
