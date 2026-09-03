/**
 * Critique: an adversarial pass over the design, in a fresh process.
 *
 * It runs before any code is written, where a wrong decision is still cheap to
 * undo. It reviews the design, not the wording of the design.
 */

import { asFindings, BLOCKER_RULE, FINDINGS_SCHEMA, header, parseMarkdownFindings, parseMarkdownVerdict, renderSteps, type PromptContext } from "./common.js";
import type { Finding, PlanStep } from "../gates.js";
import type { PlanOutput } from "./plan.js";

export interface CritiqueOutput {
  verdict: "APPROVED" | "REVISE_DESIGN";
  findings: Finding[];
}

export const CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: {
    verdict: { type: "string", enum: ["APPROVED", "REVISE_DESIGN"] },
    findings: FINDINGS_SCHEMA,
  },
} as const;

export interface CritiqueInput extends PromptContext {
  plan: PlanOutput;
}

export function buildCritiquePrompt(input: CritiqueInput): string {
  const { brief, design, precheck } = input.plan;
  return [
    header(input, "adversarial reviewer"),
    `## The proposal

**Pre-check:** ${precheck.recommendation} — ${precheck.reasoning}

**Problem:** ${brief.problem}

**Success criteria**

${brief.criteria.map(c => `- ${c.id}: ${c.statement}`).join("\n") || "None stated."}

**Assumptions**

${brief.assumptions.map(a => `- ${a}`).join("\n") || "None."}

**Design decisions**

${design.decisions.map(d => `- ${d.decision} — ${d.rationale} (source: ${d.source})`).join("\n") || "None."}

**Plan**

${renderSteps(input.plan.steps)}`,
    `## How to review

Take three passes, and say which one produced each finding.

1. **The skeptic.** Does this actually solve the stated problem? Is a success criterion untestable, or satisfied by a change that does not do the work? Is the pre-check wrong — does the repository already have this?
2. **The implementer.** Follow the steps literally. Does an anchor exist? Does a step depend on something no earlier step produced? Would executing this plan leave the tree broken between steps?
3. **The operator.** What breaks in production: concurrency, failure paths, migrations, data that already exists in the wrong shape, an interface other code depends on.

You may run read-only commands to check a claim before making it. Prefer checking to guessing: a finding you verified is worth more than three you suspected.

${BLOCKER_RULE}

Return REVISE_DESIGN only when at least one BLOCKER survives that rule. Over-specified plans are not a defect; a plan that is merely different from how you would do it is not a defect either.`,
  ].join("\n\n");
}

export function parseCritique(structured: unknown, report: string): CritiqueOutput {
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    const verdict = String(record["verdict"] ?? "").toUpperCase();
    if (verdict === "APPROVED" || verdict === "REVISE_DESIGN") {
      return { verdict, findings: asFindings(record["findings"]) };
    }
  }
  const parsed = parseMarkdownVerdict(report, ["APPROVED", "REVISE_DESIGN"]);
  return {
    verdict: parsed === "REVISE_DESIGN" ? "REVISE_DESIGN" : "APPROVED",
    findings: parseMarkdownFindings(report),
  };
}

export function renderCritique(output: CritiqueOutput, steps: PlanStep[]): string {
  return [
    "# Critique", "",
    `## Verdict\n\n${output.verdict}`, "",
    "## Findings", "",
    output.findings.length
      ? output.findings.map(f => `- **[${f.severity}]** ${f.location} — ${f.summary}\n  - Evidence: ${f.evidence}`).join("\n")
      : "None.",
    "",
    `_Reviewed a plan of ${steps.length} step(s)._`,
    "",
  ].join("\n");
}
