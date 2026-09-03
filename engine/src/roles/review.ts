/**
 * Commit review: the last gate before anything is committed.
 *
 * It reviews the real diff of the exact tree the orchestrator will commit,
 * against the criteria the plan committed to, with the test results already
 * known. Its job is to catch what the machine could not: a change that passes
 * its tests and still does the wrong thing.
 */

import { asFindings, BLOCKER_RULE, FINDINGS_SCHEMA, header, parseMarkdownFindings, parseMarkdownVerdict, type PromptContext } from "./common.js";
import type { Finding } from "../gates.js";
import type { Criterion } from "./plan.js";

export interface CriterionCoverage {
  id: string;
  satisfied: boolean;
  evidence: string;
}

export interface ReviewOutput {
  verdict: "APPROVE" | "REQUEST_CHANGES";
  findings: Finding[];
  coverage: CriterionCoverage[];
}

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings", "coverage"],
  properties: {
    verdict: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES"] },
    findings: FINDINGS_SCHEMA,
    coverage: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "satisfied", "evidence"],
        properties: {
          id: { type: "string" },
          satisfied: { type: "boolean" },
          evidence: { type: "string", description: "where in the diff this is satisfied" },
        },
      },
    },
  },
} as const;

export interface ReviewInput extends PromptContext {
  diff: string;
  criteria: Criterion[];
  assumptions: string[];
  designDecisions: string[];
  testSummary: string;
  scannerResult: string;
  /** Findings from earlier heals, so a re-review can verify rather than restart. */
  priorFindings: Finding[];
  healRound: number;
}

export function buildReviewPrompt(input: ReviewInput): string {
  const parts = [
    header(input, "commit reviewer"),
    `## What the machine already knows

- Tests: ${input.testSummary}
- Deterministic security scan: ${input.scannerResult}

These are captured facts, not claims. Do not re-litigate them, and do not ask for a test run you cannot see the result of.

## What the change promised

**Success criteria**

${input.criteria.map(c => `- ${c.id}: ${c.statement} (verified by: ${c.verification})`).join("\n") || "None stated."}

**Assumptions the plan recorded**

${input.assumptions.map(a => `- ${a}`).join("\n") || "None."}

**Design decisions**

${input.designDecisions.map(d => `- ${d}`).join("\n") || "None recorded."}

## The diff

\`\`\`diff
${input.diff}
\`\`\``,
  ];

  if (input.healRound > 0) {
    parts.push(`## This is re-review round ${input.healRound}

The previous round asked for these changes:

${input.priorFindings.map(f => `- [${f.severity}] ${f.location} — ${f.summary}`).join("\n") || "None recorded."}

Verify whether each was actually addressed. Beyond that, raise a new BLOCKER only for something on lines this round changed. Finding a fresh objection in untouched code on every round is how a review loop fails to terminate.`);
  }

  parts.push(`## How to review

Work in this order.

1. **Criteria.** For each success criterion, find where the diff satisfies it and quote that evidence. A criterion nothing in the diff addresses is the most important thing you can report.
2. **Correctness.** Read the change for what it does, not what it says. Off-by-one, wrong operator, a case the code does not handle, an error path that swallows the error, a resource never released, a promise never awaited, state mutated where a copy was meant.
3. **Fit.** Does it match how this repository does things, using what already exists? Did it add a dependency, an abstraction with one caller, or configuration nothing reads?
4. **Assumptions.** The plan recorded assumptions. Did the code actually follow them, and are any of them now clearly wrong?

${BLOCKER_RULE}

The tests passing does not mean the change is right, and the tests failing is already known — neither is a finding by itself. Return APPROVE when the criteria are met and you found no surviving BLOCKER; note the WARNs and approve anyway.`);

  return parts.join("\n\n");
}

export function parseReview(structured: unknown, report: string): ReviewOutput {
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    const verdict = String(record["verdict"] ?? "").toUpperCase();
    if (verdict === "APPROVE" || verdict === "REQUEST_CHANGES") {
      return {
        verdict,
        findings: asFindings(record["findings"]),
        coverage: Array.isArray(record["coverage"])
          ? (record["coverage"] as unknown[]).map(item => {
              const c = (item ?? {}) as Record<string, unknown>;
              return { id: String(c["id"] ?? ""), satisfied: c["satisfied"] === true, evidence: String(c["evidence"] ?? "") };
            })
          : [],
      };
    }
  }
  const parsed = parseMarkdownVerdict(report, ["APPROVE", "REQUEST_CHANGES"]);
  return {
    verdict: parsed === "REQUEST_CHANGES" ? "REQUEST_CHANGES" : "APPROVE",
    findings: parseMarkdownFindings(report),
    coverage: [],
  };
}

export interface HealInput extends PromptContext {
  findings: Finding[];
  diff: string;
  testOutput: string | null;
  verificationNote: string;
}

/** Repair pass after a review asked for changes. */
export function buildHealPrompt(input: HealInput): string {
  const parts = [
    header(input, "builder, addressing review findings"),
    `## What the reviewer asked for

${input.findings.map(f => `- **[${f.severity}]** ${f.location} — ${f.summary}\n  - Evidence: ${f.evidence}`).join("\n") || "None."}

## Your change as it stands

\`\`\`diff
${input.diff}
\`\`\``,
  ];
  if (input.testOutput) {
    parts.push(`## The latest test run\n\n\`\`\`\n${input.testOutput}\n\`\`\``);
  }
  parts.push(`## How to fix

Address every BLOCKER. Fix the cause, not the symptom, and keep the fix as small as the finding.

If a finding is wrong, do not change the code to satisfy it — leave it and explain why in your notes, citing what the reviewer missed. A fix that silences a reviewer while making the code worse is the failure this loop exists to avoid.

Do not take the opportunity to refactor something else, and do not weaken a test. Run the verification commands (${input.verificationNote}) before you finish.`);
  return parts.join("\n\n");
}
