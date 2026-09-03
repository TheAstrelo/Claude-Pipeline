/**
 * QA-fix: repair what the deterministic checks found.
 *
 * It only runs when there is something concrete to fix. The shell engine
 * called a model for denoise, fit and docs on every run and usually paid it to
 * report that nothing was wrong; here the regexes, the linter and the
 * typechecker decide whether a call happens at all.
 */

import { ENGINEERING_STANDARD, header, parseMarkdownVerdict, type PromptContext } from "./common.js";

export interface QaFinding {
  rule: string;
  path: string;
  line: number;
  detail: string;
}

export interface QaFixOutput {
  verdict: "FIXED" | "NOTHING_TO_FIX";
  notes: string;
}

export const QAFIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "notes"],
  properties: {
    verdict: { type: "string", enum: ["FIXED", "NOTHING_TO_FIX"] },
    notes: { type: "string" },
  },
} as const;

export interface QaFixInput extends PromptContext {
  findings: QaFinding[];
  lintOutput: string | null;
  typecheckOutput: string | null;
}

export function buildQaFixPrompt(input: QaFixInput): string {
  const parts = [
    header(input, "quality fixer"),
    `## What the deterministic checks found

${input.findings.length
  ? input.findings.map(f => `- \`${f.path}:${f.line}\` [${f.rule}] ${f.detail}`).join("\n")
  : "No pattern findings."}`,
  ];
  if (input.typecheckOutput) parts.push(`## Typecheck output\n\n\`\`\`\n${input.typecheckOutput}\n\`\`\``);
  if (input.lintOutput) parts.push(`## Lint output\n\n\`\`\`\n${input.lintOutput}\n\`\`\``);
  parts.push(`## How to fix

Fix exactly these findings and nothing else. This phase runs after the change has been built and before it is reviewed: an unrelated edit here arrives in the reviewer's diff with no explanation and costs a review cycle.

Delete debug output rather than commenting it out. Fix a type error at its cause rather than casting it away. If a finding is wrong — the linter is misconfigured, the rule does not apply — leave the code alone and say so in your notes.`);
  parts.push(ENGINEERING_STANDARD);
  return parts.join("\n\n");
}

export function parseQaFix(structured: unknown, report: string): QaFixOutput {
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    const verdict = String(record["verdict"] ?? "").toUpperCase();
    if (verdict === "FIXED" || verdict === "NOTHING_TO_FIX") return { verdict, notes: String(record["notes"] ?? "") };
  }
  const parsed = parseMarkdownVerdict(report, ["FIXED", "NOTHING_TO_FIX"]);
  return { verdict: parsed === "NOTHING_TO_FIX" ? "NOTHING_TO_FIX" : "FIXED", notes: report.slice(0, 2000) };
}

const DEBUG_RULES: ReadonlyArray<readonly [string, RegExp, string]> = [
  ["console-debug", /\bconsole\.(log|debug|trace)\s*\(/g, "debug output left in the change"],
  ["debugger", /\bdebugger\s*;?/g, "debugger statement left in the change"],
  ["debug-marker", /(?:\/\/|#|\/\*)[^\r\n]*\b(DEBUG|TEMP|FIXME_REMOVE|REMOVE_ME)\b/g, "temporary marker left in the change"],
  ["print-debug", /^\s*print\s*\(\s*["'`](?:DEBUG|TODO|XXX|HERE)/gim, "debug print left in the change"],
];

const ROUTE_PATTERNS = [
  /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete)\s*\(/,
  /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(/,
  /@\w+\.(?:get|post|put|patch|delete)\s*\(/,
];
const ROUTE_DOC_PATTERN = /@(openapi|swagger)\b|openapi\s*:|swagger\s*:|operationId\s*:/;

const CODE_EXTENSIONS = new Set(["js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "go", "rb", "php", "rs", "java"]);

/**
 * Scan the changed files for the things a model should not have to be asked
 * about. Findings here are facts; the model is only called to fix them.
 */
export function scanForQaFindings(
  files: Array<{ path: string; body: string }>,
  options: { documentsRoutes: boolean },
): QaFinding[] {
  const findings: QaFinding[] = [];
  for (const file of files) {
    const extension = file.path.split(".").pop()?.toLowerCase() ?? "";
    for (const [rule, pattern, detail] of DEBUG_RULES) {
      for (const match of file.body.matchAll(pattern)) {
        findings.push({ rule, path: file.path, line: lineOf(file.body, match.index ?? 0), detail });
      }
    }
    // The docs rule fires only where the project already documents routes, or
    // says it should. Adding swagger blocks to a project that never wanted
    // them is manufactured work.
    if (options.documentsRoutes && CODE_EXTENSIONS.has(extension)) {
      const hasRoute = ROUTE_PATTERNS.some(p => p.test(file.body));
      if (hasRoute && !ROUTE_DOC_PATTERN.test(file.body)) {
        findings.push({ rule: "undocumented-api-route", path: file.path, line: 1, detail: "this project documents its routes; this one is undocumented" });
      }
    }
  }
  return findings;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}
