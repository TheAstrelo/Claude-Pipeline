/**
 * Plan: pre-check, requirements, design and steps in one strong call.
 *
 * These were four separate phases in the shell engine, each paying a cold
 * start to rediscover the repository and each free to disagree with the last.
 * Collapsing them keeps the artifacts — the validators, the critique and the
 * build still consume the same four sections — while the reasoning happens
 * once, with everything in view.
 */

import type { PlanStep } from "../gates.js";
import { ENGINEERING_STANDARD, header, type PromptContext } from "./common.js";

export interface Criterion {
  id: string;
  statement: string;
  /** How the orchestrator could tell whether this happened. */
  verification: string;
}

export interface PlanOutput {
  precheck: {
    matches: Array<{ path: string; relevance: string }>;
    recommendation: "BUILD_NEW" | "USE_EXISTING" | "USE_LIBRARY";
    reasoning: string;
  };
  brief: {
    verdict: "CLEAR" | "AMBIGUOUS";
    problem: string;
    criteria: Criterion[];
    outOfScope: string[];
    assumptions: string[];
  };
  design: {
    decisions: Array<{ decision: string; rationale: string; source: string }>;
    risks: Array<{ risk: string; mitigation: string }>;
  };
  steps: PlanStep[];
}

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["precheck", "brief", "design", "steps"],
  properties: {
    precheck: {
      type: "object", additionalProperties: false,
      required: ["matches", "recommendation", "reasoning"],
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["path", "relevance"],
            properties: { path: { type: "string" }, relevance: { type: "string" } },
          },
        },
        recommendation: { type: "string", enum: ["BUILD_NEW", "USE_EXISTING", "USE_LIBRARY"] },
        reasoning: { type: "string" },
      },
    },
    brief: {
      type: "object", additionalProperties: false,
      required: ["verdict", "problem", "criteria", "outOfScope", "assumptions"],
      properties: {
        verdict: { type: "string", enum: ["CLEAR", "AMBIGUOUS"] },
        problem: { type: "string" },
        criteria: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["id", "statement", "verification"],
            properties: {
              id: { type: "string", description: "SC1, SC2, …" },
              statement: { type: "string" },
              verification: { type: "string" },
            },
          },
        },
        outOfScope: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
    design: {
      type: "object", additionalProperties: false, required: ["decisions", "risks"],
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["decision", "rationale", "source"],
            properties: {
              decision: { type: "string" }, rationale: { type: "string" },
              source: { type: "string", description: "a file:line in this repository, or an external URL" },
            },
          },
        },
        risks: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["risk", "mitigation"],
            properties: { risk: { type: "string" }, mitigation: { type: "string" } },
          },
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["file", "action", "anchor", "intent", "test", "criteria"],
        properties: {
          file: { type: "string" },
          action: { type: "string", enum: ["CREATE", "MODIFY", "DELETE", "VERIFY"] },
          anchor: { type: ["string", "null"], description: "text that literally occurs in the file today; null for CREATE" },
          intent: { type: "string", description: "what changes and why, not the exact code" },
          test: { type: "string", description: "how this step is proved" },
          criteria: { type: "array", items: { type: "string" }, description: "criterion ids this step serves" },
        },
      },
    },
  },
} as const;

export interface PlanInput extends PromptContext {
  /** Present when a critique sent the design back. */
  critique: string | null;
  /** Present when the plan lint rejected the previous attempt. */
  lintFindings: string | null;
  hasTestCommand: boolean;
}

export function buildPlanPrompt(input: PlanInput): string {
  const parts = [header(input, "planning agent")];

  parts.push(`## What to produce

One pass over four questions, in order. Later answers must be consistent with earlier ones.

**1. Pre-check.** Before designing anything, look for what already exists. Search the repository for code that already does this or nearly does. Check the manifest for a dependency that already solves it. Recommend BUILD_NEW only when neither exists; recommend USE_EXISTING when the repository already has the mechanism and the task is to use or extend it; recommend USE_LIBRARY only when a dependency the project already has covers it. The most common failure here is building a second version of something the repository already has.

**2. Requirements.** State the problem in one paragraph, then the success criteria as a numbered list with ids SC1, SC2, … Each criterion must be checkable by someone who cannot read your mind: an observable behavior, not "works correctly". For each, say how it would be verified. Where the task is under-specified, do not stop — choose the most conventional reading, record it as an assumption, and note what you ruled out. Mark the brief AMBIGUOUS only when a wrong guess would make the work useless.

**3. Design.** The decisions that matter, each with a rationale and a source. Cite this repository (\`path:line\`) wherever the answer is already established here — an existing pattern, an interface you must match. Cite a URL only for an external API you cannot inspect. A trivial change needs one decision, not five. List real risks with mitigations; do not invent risks to fill the section.

**4. Steps.** The plan the builder executes. Each step names one file, an action, an anchor, an intent and a test. Anchors must be text that literally occurs in the file today, copied exactly — the orchestrator checks this before the build runs, and a wrong anchor costs a re-plan. Intent describes what changes and why; do not write the code here. Every success criterion must be named by at least one step, and at least one of those steps must have a real test.`);

  if (input.hasTestCommand) {
    parts.push(`**Acceptance-first.** This repository has a test command, and the pipeline gates on the real test run.

First check whether a test that already exists covers the criteria and fails today. If one does — the task begins from a failing test, or points at one — that test *is* the acceptance test and it is the specification. Do not modify it, do not add cases to it, and do not move it: the plan changes the code until that test passes. A pipeline that edits the failing test is the exact failure this pipeline exists to prevent, and adding cases beside it is one step from it.

Only where nothing covers a criterion should an early step author a new failing test for it, placed where the existing test command already finds it. A change whose tests were already green proves nothing about the task.`);
  } else {
    parts.push(`**No test command was detected.** Do not invent a test framework or add one as a dependency. State in each step's test field how a human would verify it by hand.`);
  }

  if (input.critique) {
    parts.push(`## A previous design was sent back\n\nAddress every point. Where you disagree, say so in the rationale rather than silently keeping the old decision.\n\n${input.critique}`);
  }
  if (input.lintFindings) {
    parts.push(`## The previous plan failed its lint\n\nThese anchors did not occur in the files as written. Open each file, copy the anchor text exactly as it appears, and re-check every other anchor while you are there.\n\n${input.lintFindings}`);
  }

  parts.push(ENGINEERING_STANDARD);
  return parts.join("\n\n");
}

export function parsePlan(structured: unknown): PlanOutput | null {
  if (!structured || typeof structured !== "object") return null;
  const record = structured as Record<string, unknown>;
  const precheck = record["precheck"] as PlanOutput["precheck"] | undefined;
  const brief = record["brief"] as PlanOutput["brief"] | undefined;
  const design = record["design"] as PlanOutput["design"] | undefined;
  const steps = record["steps"];
  if (!precheck || !brief || !design || !Array.isArray(steps)) return null;
  return {
    precheck: {
      matches: Array.isArray(precheck.matches) ? precheck.matches : [],
      recommendation: precheck.recommendation ?? "BUILD_NEW",
      reasoning: String(precheck.reasoning ?? ""),
    },
    brief: {
      verdict: brief.verdict === "AMBIGUOUS" ? "AMBIGUOUS" : "CLEAR",
      problem: String(brief.problem ?? ""),
      criteria: Array.isArray(brief.criteria) ? brief.criteria : [],
      outOfScope: Array.isArray(brief.outOfScope) ? brief.outOfScope : [],
      assumptions: Array.isArray(brief.assumptions) ? brief.assumptions : [],
    },
    design: {
      decisions: Array.isArray(design.decisions) ? design.decisions : [],
      risks: Array.isArray(design.risks) ? design.risks : [],
    },
    steps: steps.map(normalizeStep).filter((s): s is PlanStep => s !== null),
  };
}

function normalizeStep(value: unknown): PlanStep | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const file = String(record["file"] ?? "").trim();
  if (!file) return null;
  const action = String(record["action"] ?? "MODIFY").toUpperCase();
  return {
    file,
    action: action === "CREATE" || action === "DELETE" || action === "VERIFY" ? action : "MODIFY",
    anchor: typeof record["anchor"] === "string" && record["anchor"].trim() ? record["anchor"] : null,
    intent: String(record["intent"] ?? ""),
    test: String(record["test"] ?? ""),
    criteria: Array.isArray(record["criteria"]) ? record["criteria"].map(String) : [],
  };
}

/** Render the plan into the artifacts the later phases read. */
export function renderPlanArtifacts(plan: PlanOutput): Record<string, string> {
  const criteria = plan.brief.criteria.map(c => `${c.id}. ${c.statement}\n   Verified by: ${c.verification}`).join("\n");
  return {
    "pre-check.md": [
      "# Pre-check", "",
      `## Recommendation\n\n${plan.precheck.recommendation}`, "",
      `## Reasoning\n\n${plan.precheck.reasoning}`, "",
      "## Existing code found", "",
      plan.precheck.matches.length
        ? plan.precheck.matches.map(m => `- \`${m.path}\` — ${m.relevance}`).join("\n")
        : "None.",
      "",
    ].join("\n"),
    "brief.md": [
      "# Requirements", "",
      `## Verdict\n\n${plan.brief.verdict}`, "",
      `## Problem\n\n${plan.brief.problem}`, "",
      `## Success criteria\n\n${criteria || "None stated."}`, "",
      `## Out of scope\n\n${plan.brief.outOfScope.map(s => `- ${s}`).join("\n") || "Nothing recorded."}`, "",
      `## Assumptions\n\n${plan.brief.assumptions.map(s => `- ${s}`).join("\n") || "None."}`,
      "",
    ].join("\n"),
    "design.md": [
      "# Design", "",
      "## Decisions", "",
      plan.design.decisions.map(d => `**${d.decision}**\n\n- Why: ${d.rationale}\n- Source: ${d.source}`).join("\n\n") || "None recorded.",
      "",
      "## Risks", "",
      plan.design.risks.map(r => `- **${r.risk}** — ${r.mitigation}`).join("\n") || "None recorded.",
      "",
    ].join("\n"),
    "plan.md": [
      "# Plan", "",
      plan.steps.map((step, index) => [
        `## Step ${index + 1}`,
        `- **File:** \`${step.file}\` [${step.action}]`,
        step.anchor ? `- **Anchor:** \`${step.anchor}\`` : null,
        `- **Intent:** ${step.intent}`,
        `- **Test:** ${step.test}`,
        step.criteria.length ? `- **Criteria:** ${step.criteria.join(", ")}` : null,
      ].filter(Boolean).join("\n")).join("\n\n"),
      "",
    ].join("\n"),
  };
}
