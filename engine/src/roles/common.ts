/**
 * Shared prompt scaffolding.
 *
 * Two things every phase gets: the repository context pack (so nobody
 * rediscovers the layout) and, for anything that writes code, the engineering
 * standard. The standard is short on purpose — it names the specific slop the
 * evaluation corpus measures and nothing else. A long style essay in every
 * prompt buys drift, not quality.
 */

import { isBlockingVerdict } from "../gates.js";
import type { Finding, PlanStep } from "../gates.js";

export const ENGINEERING_STANDARD = `Engineering standard:
- Make the smallest change that satisfies the success criteria. A diff is a liability; every line has to earn its place.
- Reuse what the pre-check found. Add a dependency only if the pre-check recommended USE_LIBRARY.
- No abstraction with one caller, no configuration for a need nobody has stated, no feature flags nobody asked for.
- Comments, docstrings and defensive checks only where the surrounding file already has them. Match the file you are editing, not your habits.
- Write tests in the style of the example test above, placed where the existing test command already finds them.
- Never edit a test that already specifies the behavior you are changing. A failing test is the specification: change the code until it passes. Never weaken a test, delete an assertion, or edit the package scripts the verification commands call.
- Stay inside the area the task and the plan name. If you think a change is needed elsewhere, say so instead of making it.
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
 * Markdown fallback for an adapter that returned no structured output.
 *
 * When anchored verdict lines disagree — a model that restates its verdict, or
 * quotes another one — the blocking verdict wins. The shell engine took the
 * last line, which fails open: an APPROVE further down the page could bury a
 * REQUEST_CHANGES above it. Ambiguity should cost a review cycle, not a gate.
 */
export function parseMarkdownVerdict(report: string, allowed: string[]): string | null {
  const anchored = new RegExp(`^\\s*#*\\s*\\**\\s*(?:Verdict|VERDICT)\\s*\\**\\s*:?\\s*\\**\\s*(${allowed.join("|")})\\b`, "gim");
  const found: string[] = [];
  for (const match of report.matchAll(anchored)) {
    const verdict = match[1]?.toUpperCase();
    if (verdict && !found.includes(verdict)) found.push(verdict);
  }
  if (found.length === 1) return found[0]!;
  if (found.length > 1) return found.find(isBlockingVerdict) ?? found[found.length - 1]!;
  // No anchored line: fall back to any allowed token appearing at all, still
  // preferring the blocking one.
  const loose = allowed.filter(verdict => new RegExp(`\\b${verdict}\\b`).test(report));
  if (!loose.length) return null;
  return loose.find(isBlockingVerdict) ?? loose[0]!;
}

/** Column headings a model might use for each field of a finding. */
const COLUMN_ALIASES: Record<"severity" | "location" | "summary" | "evidence", RegExp> = {
  severity: /^(severity|level|sev)$/i,
  location: /^(file|file:line|location|path|where)$/i,
  summary: /^(issue|finding|summary|problem|description|what)$/i,
  evidence: /^(evidence|trigger|exploit path|repro|reproduction|why)$/i,
};

/**
 * Findings from a markdown table.
 *
 * The columns are read from the table's own header rather than assumed by
 * position: review phases use different tables, and mis-reading which cell is
 * the evidence would let an uncited BLOCKER through the gate that exists to
 * strip it.
 */
export function parseMarkdownFindings(report: string): Finding[] {
  const findings: Finding[] = [];
  let columns: Partial<Record<keyof typeof COLUMN_ALIASES, number>> | null = null;

  for (const line of report.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) { columns = null; continue; }
    const cells = trimmed.split("|").slice(1, -1).map(c => c.trim().replace(/^\*+|\*+$/g, ""));
    if (!cells.length) continue;
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // separator row

    const header = headerColumns(cells);
    if (header) { columns = header; continue; }

    const severityIndex = columns?.severity ?? cells.findIndex(c => /^(BLOCKER|WARN|PRE[-_ ]?EXISTING)$/i.test(c));
    const severityCell = severityIndex >= 0 ? cells[severityIndex] : undefined;
    if (!severityCell || !/^(BLOCKER|WARN|PRE[-_ ]?EXISTING)$/i.test(severityCell)) continue;

    const pick = (field: keyof typeof COLUMN_ALIASES, fallback: number): string => {
      const index = columns?.[field];
      if (index !== undefined && index >= 0) return cells[index] ?? "";
      const rest = cells.filter((_, i) => i !== severityIndex);
      return rest[fallback] ?? "";
    };
    findings.push({
      severity: /^BLOCKER$/i.test(severityCell) ? "BLOCKER" : /^PRE/i.test(severityCell) ? "PRE_EXISTING" : "WARN",
      location: pick("location", 0),
      summary: pick("summary", 1),
      evidence: pick("evidence", 2),
    });
  }
  return findings;
}

function headerColumns(cells: string[]): Partial<Record<keyof typeof COLUMN_ALIASES, number>> | null {
  const found: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
  let matched = 0;
  cells.forEach((cell, index) => {
    for (const [field, pattern] of Object.entries(COLUMN_ALIASES) as Array<[keyof typeof COLUMN_ALIASES, RegExp]>) {
      if (found[field] === undefined && pattern.test(cell)) { found[field] = index; matched++; }
    }
  });
  // Two recognized headings is enough to trust the row as a header; one could
  // be a data cell that happens to read like a column name.
  return matched >= 2 ? found : null;
}
