/**
 * Shared prompt scaffolding.
 *
 * Two things every phase gets: the repository context pack (so nobody
 * rediscovers the layout) and, for anything that writes code, the engineering
 * standard. The standard is short on purpose — it names the specific slop the
 * evaluation corpus measures and nothing else. A long style essay in every
 * prompt buys drift, not quality.
 */

import type { Finding, PlanStep } from "../gates.js";

export const ENGINEERING_STANDARD = `Engineering standard:
- Make the smallest change that satisfies the success criteria. A diff is a liability; every line has to earn its place.
- Reuse what the pre-check found. Add a dependency only if the pre-check recommended USE_LIBRARY.
- No abstraction with one caller, no configuration for a need nobody has stated, no feature flags nobody asked for.
- Comments, docstrings and defensive checks only where the surrounding file already has them. Match the file you are editing, not your habits.
- Write tests in the style of the example test above, placed where the existing test command already finds them.
- Never edit the package scripts the verification commands call, and never weaken a test to make it pass.
- No debug output, no TODO markers, no commented-out code left behind.`;

/** The evidence rule for every phase that may block the run. */
export const BLOCKER_RULE = `You may report a BLOCKER only for a defect in THIS change that would produce wrong behavior, data loss, a crash, or a security breach, and only when you can state the concrete trigger and cite the file and line where it is visible. Everything else is WARN. A pre-existing problem this change did not introduce is PRE_EXISTING, however serious.
Style, formatting, naming, lint and documentation are out of scope here: other phases own them, and raising them costs a review cycle for nothing. A BLOCKER without a trigger and a citation is stripped before it reaches the gate, and a blocking verdict that cites nothing is demoted — so an unevidenced objection is not a safe default, it is a wasted turn.`;

export interface PromptContext {
  task: string;
  contextPack: string;
  precedents: string | null;
}

export function header(context: PromptContext, role: string): string {
  const parts = [
    `You are the ${role} for an automated development pipeline.`,
    "",
    "## Task",
    "",
    context.task,
    "",
    context.contextPack,
  ];
  if (context.precedents) {
    parts.push(
      "## Findings previously judged FALSE POSITIVE in this repository",
      "",
      "A human reviewed and rejected each of these. Do not raise them again.",
      "",
      context.precedents,
      "",
    );
  }
  return parts.join("\n");
}

export function renderSteps(steps: PlanStep[]): string {
  return steps.map((step, index) => [
    `### Step ${index + 1}`,
    `- File: \`${step.file}\` [${step.action}]`,
    step.anchor ? `- Anchor: \`${step.anchor}\`` : null,
    `- Intent: ${step.intent}`,
    `- Test: ${step.test}`,
    step.criteria.length ? `- Criteria: ${step.criteria.join(", ")}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
}

export function renderFindings(findings: Finding[]): string {
  if (!findings.length) return "None.";
  return findings.map(f => `- [${f.severity}] ${f.location} — ${f.summary}\n  Evidence: ${f.evidence}`).join("\n");
}

/** JSON schema fragment shared by every reviewing role. */
export const FINDINGS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["severity", "location", "summary", "evidence"],
    properties: {
      severity: { type: "string", enum: ["BLOCKER", "WARN", "PRE_EXISTING"] },
      location: { type: "string", description: "file:line, or the file alone" },
      summary: { type: "string", description: "one sentence naming the defect" },
      evidence: { type: "string", description: "the concrete trigger and where it is visible" },
    },
  },
} as const;

export function asFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  const findings: Finding[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const severity = String(record["severity"] ?? "WARN").toUpperCase();
    findings.push({
      severity: severity === "BLOCKER" ? "BLOCKER" : severity === "PRE_EXISTING" ? "PRE_EXISTING" : "WARN",
      location: String(record["location"] ?? ""),
      summary: String(record["summary"] ?? ""),
      evidence: String(record["evidence"] ?? ""),
    });
  }
  return findings;
}

/**
 * Markdown fallback for an adapter that returned no structured output. It
 * reads the verdict line and any severity-tagged table rows, so a schema
 * hiccup costs parsing quality rather than failing the phase open.
 */
export function parseMarkdownVerdict(report: string, allowed: string[]): string | null {
  const pattern = new RegExp(`^\\s*#*\\s*\\**\\s*(?:Verdict|VERDICT)\\s*\\**\\s*:?\\s*\\**\\s*(${allowed.join("|")})\\b`, "im");
  const match = pattern.exec(report);
  if (match?.[1]) return match[1].toUpperCase();
  for (const verdict of allowed) {
    if (new RegExp(`\\b${verdict}\\b`).test(report)) return verdict;
  }
  return null;
}

export function parseMarkdownFindings(report: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of report.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map(c => c.trim().replace(/^\*+|\*+$/g, ""));
    const severity = cells.find(c => /^(BLOCKER|WARN|PRE[-_ ]?EXISTING)$/i.test(c));
    if (!severity) continue;
    const rest = cells.filter(c => c && c !== severity);
    findings.push({
      severity: /^BLOCKER$/i.test(severity) ? "BLOCKER" : /^PRE/i.test(severity) ? "PRE_EXISTING" : "WARN",
      location: rest[0] ?? "",
      summary: rest[1] ?? "",
      evidence: rest[2] ?? "",
    });
  }
  return findings;
}
