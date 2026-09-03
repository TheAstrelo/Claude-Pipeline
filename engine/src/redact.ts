/**
 * Redaction applied to everything durable: command output, provider output,
 * anything that could carry a credential into an artifact file.
 *
 * The point is not to be clever. It is that a secret which reaches disk in a
 * run artifact has leaked, and artifacts are read by later phases, quoted into
 * prompts, and sometimes pasted into pull requests.
 */

export const REDACTION_POLICY_VERSION = "1.0";

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g, "[REDACTED:PRIVATE_KEY]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:AWS_ACCESS_KEY]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:GITHUB_TOKEN]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED:GITHUB_TOKEN]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED:SLACK_TOKEN]"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "[REDACTED:API_KEY]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED:JWT]"],
  [/((?:"|'|`)?(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)(?:"|'|`)?\s*[:=]\s*(?:"|'|`)?)([^"'`\s,;]{8,})/gi, "$1[REDACTED:ASSIGNED_SECRET]"],
];

const SECRET_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/i;

/** Replace credential-shaped text, and any secret-looking env value verbatim. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8 || !SECRET_ENV_NAME.test(name)) continue;
    out = out.split(value).join(`[REDACTED:ENV:${name.replace(/[^A-Za-z0-9_]/g, "_")}]`);
  }
  return out;
}
