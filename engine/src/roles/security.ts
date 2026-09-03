/**
 * Security review.
 *
 * The deterministic scanner has already run and its result is non-waivable;
 * this call exists for what patterns cannot see — an authorization check in
 * the wrong place, a trust boundary crossed, user input reaching a sink.
 */

import { asFindings, BLOCKER_RULE, FINDINGS_SCHEMA, header, parseMarkdownFindings, parseMarkdownVerdict, type PromptContext } from "./common.js";
import type { Finding } from "../gates.js";

export interface SecurityOutput {
  verdict: "PASS" | "FAIL" | "CRITICAL";
  findings: Finding[];
}

export const SECURITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL", "CRITICAL"] },
    findings: FINDINGS_SCHEMA,
  },
} as const;

export interface SecurityInput extends PromptContext {
  diff: string;
  scannerResult: string;
  scannerEvidencePath: string;
}

export function buildSecurityPrompt(input: SecurityInput): string {
  return [
    header(input, "security reviewer"),
    `## What has already been checked mechanically

The deterministic scanner ran before you and returned **${input.scannerResult}**. Its evidence is at \`${input.scannerEvidencePath}\`. It owns secrets, protected files, dependency sources and escaping symlinks, and its result cannot be waived — do not re-report those, and do not report outdated or vulnerable dependencies, which it also owns.

## The change

\`\`\`diff
${input.diff}
\`\`\``,
    `## What to look for

Only what reading the code can find and a pattern cannot:

- **Injection**: user-controlled data reaching SQL, a shell, a template, \`eval\`, a path, or a redirect target. Trace the value from where it enters to where it lands.
- **Authorization**: a new route, handler or query that reads or writes data belonging to someone else without checking who is asking. Compare against how the neighbouring handlers do it.
- **Trust boundaries**: input validated on one side of a boundary and trusted on the other; a check performed on the client and assumed on the server.
- **Data exposure**: a field added to a response that should not leave the server, an error that returns internals, a log line that records a credential.

You may run read-only commands to confirm how a value flows before reporting on it.

${BLOCKER_RULE}

Report a BLOCKER only when you can name the input, the path it takes, and what an attacker gets. "Could be unsafe" is not a finding. Return CRITICAL only for something exploitable as written; FAIL for a real but bounded issue; PASS when the change introduces nothing.`,
  ].join("\n\n");
}

export function parseSecurity(structured: unknown, report: string): SecurityOutput {
  if (structured && typeof structured === "object") {
    const record = structured as Record<string, unknown>;
    const verdict = String(record["verdict"] ?? "").toUpperCase();
    if (verdict === "PASS" || verdict === "FAIL" || verdict === "CRITICAL") {
      return { verdict, findings: asFindings(record["findings"]) };
    }
  }
  const parsed = parseMarkdownVerdict(report, ["PASS", "FAIL", "CRITICAL"]);
  return { verdict: parsed === "CRITICAL" ? "CRITICAL" : parsed === "FAIL" ? "FAIL" : "PASS", findings: parseMarkdownFindings(report) };
}
