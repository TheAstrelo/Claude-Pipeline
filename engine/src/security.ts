/**
 * Deterministic security scanner (policy 1.1), ported from the bash engine.
 *
 * It runs before any model sees the candidate, and a BLOCK is non-waivable:
 * the run stops rather than asking a model whether the leak matters. Waivers
 * are recorded, never silently applied — an allowlisted match still lands in
 * the evidence file with the reason it was let through.
 *
 * The scanner must be provably read-only: the caller compares the candidate
 * tree OID before and after and halts if this code changed anything.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, dirname, sep } from "node:path";

export const SECURITY_POLICY_VERSION = "1.1";

export type ScanResult = "CLEAN" | "BLOCK" | "NOT_APPLICABLE";
export type Severity = "CRITICAL" | "HIGH";
export type FileStatus = "TEXT" | "BINARY" | "DELETED" | "SYMLINK" | "NON_REGULAR";

export interface Finding {
  adapter: string;
  rule: string;
  path: string;
  line: number;
  severity: Severity;
  /** Digest of the matched text. The secret itself is never recorded. */
  fingerprint: string | null;
}

export interface Waiver {
  adapter: string;
  rule: string;
  path: string;
  line: number;
  reason: "placeholder-marker" | "fixture-path" | "explicit-env-waiver";
  fingerprint: string | null;
}

export interface ScannedFile {
  path: string;
  status: FileStatus;
  sha256: string | null;
}

export interface AdapterStatus {
  id: string;
  version: string;
  status: "PASS" | "FAIL";
}

export interface SecurityEvidence {
  schemaVersion: "1.0";
  policyVersion: string;
  source: "orchestrator";
  candidateTreeOid: string | null;
  result: ScanResult;
  adapters: AdapterStatus[];
  files: ScannedFile[];
  findings: Finding[];
  waivers: Waiver[];
}

export class ScannerEscapeError extends Error {}

/** Secret signatures. Order is preserved so findings are deterministic. */
const SECRET_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["private-key", /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["github-token", /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ["api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
];

/**
 * Only the two shape-only rules may be waived by living in a fixture. A live
 * AWS key or GitHub token under tests/ is still a leak, so those stay fatal
 * everywhere.
 */
const FIXTURE_WAIVABLE_RULES = new Set(["jwt", "api-key"]);

const PLACEHOLDER_RE =
  /(?:^|[^A-Za-z])(EXAMPLE|SAMPLE|PLACEHOLDER|CHANGE[-_]?ME|DUMMY|FAKE|REDACTED|XXXXXXXX|INSERT[-_]?(KEY|TOKEN)[-_]?HERE|YOUR[-_](API[-_]?)?(KEY|TOKEN|SECRET))(?:[^A-Za-z]|$)/i;

/** A match whose own bytes announce it is a placeholder is not a credential. */
function placeholderLike(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}

/**
 * Test/fixture/example locations. Deliberately excludes `.md`: a live-shaped
 * token pasted into a README is still a leak.
 */
function fixturePath(name: string): boolean {
  const value = name.replace(/\\/g, "/");
  return (
    /(^|\/)(tests?|__tests__|specs?|fixtures?|mocks?|__mocks__|examples?|samples?)\//i.test(value) ||
    /\.(test|spec)\.[A-Za-z0-9]+$/i.test(value) ||
    /\.(example|sample|template)($|\.)/i.test(value)
  );
}

/**
 * Control and credential files that must never be part of a candidate.
 *
 * Matched at any depth, unlike the bash engine, which anchored most of these
 * at the repository root and so let a monorepo's `apps/web/.env` through. A
 * credential file is exactly as sensitive three directories down; when the hit
 * is genuinely a fixture, the fixture waiver records it rather than the
 * pattern silently missing it.
 */
function protectedPath(name: string): boolean {
  const value = name.replace(/\\/g, "/").toLowerCase();
  // Documented placeholder shapes at any .env depth are fine.
  if (/(^|\/)\.env([._-][a-z0-9._-]*)?\.(example|sample|template)$/.test(value)) return false;
  return (
    /(^|\/)\.env([._-][a-z0-9._-]*)?$/.test(value) ||
    /(^|\/)\.(npmrc|pypirc|netrc)$/.test(value) ||
    /(^|\/)\.aws\/credentials$/.test(value) ||
    /(^|\/)\.ssh\//.test(value) ||
    /(^|\/)\.codex\/config\.toml$/.test(value) ||
    /(^|\/)\.claude\/settings\.json$/.test(value) ||
    /(^|\/)credentials\.json$/.test(value)
  );
}

function digest(value: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

export interface ScanOptions {
  /** Repository root; resolved to its realpath so a symlinked worktree works. */
  root: string;
  /** Candidate paths, repo-relative, as produced by the candidate index diff. */
  paths: string[];
  candidateTreeOid: string | null;
  /** False when there is no Git binding; the scan then reports NOT_APPLICABLE. */
  gitBound: boolean;
  /** Recorded waiver for git/https dependency specifiers. */
  allowRemoteDeps: boolean;
}

/**
 * Scan the candidate path set. Throws ScannerEscapeError when a candidate path
 * resolves outside the repository — that fails the run closed rather than
 * scanning something the orchestrator never bound.
 */
export function scanCandidate(options: ScanOptions): SecurityEvidence {
  const root = realpathSync.native(options.root);
  const findings: Finding[] = [];
  const waivers: Waiver[] = [];
  const files: ScannedFile[] = [];
  const adapters: AdapterStatus[] = [
    { id: "protected-paths", version: "1.1", status: "PASS" },
    { id: "secret-signatures", version: "1.1", status: "PASS" },
    { id: "dependency-sources", version: "1.1", status: "PASS" },
    { id: "escaping-symlinks", version: "1.0", status: "PASS" },
  ];

  const add = (adapter: string, rule: string, path: string, line: number, severity: Severity, fingerprint: string | null = null) => {
    findings.push({ adapter, rule, path, line, severity, fingerprint });
    const item = adapters.find(a => a.id === adapter);
    if (item) item.status = "FAIL";
  };
  const waive = (adapter: string, rule: string, path: string, line: number, reason: Waiver["reason"], fingerprint: string | null = null) => {
    waivers.push({ adapter, rule, path, line, reason, fingerprint });
  };
  const inside = (candidate: string): boolean => {
    const rel = relative(root, candidate);
    return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
  };

  for (const name of options.paths) {
    const full = resolve(root, name);
    if (!inside(full)) throw new ScannerEscapeError(`candidate path escapes repository: ${name}`);
    if (!existsSync(full)) {
      files.push({ path: name, status: "DELETED", sha256: null });
      continue;
    }
    const stat = lstatSync(full);

    if (protectedPath(name)) {
      if (fixturePath(name)) waive("protected-paths", "protected-control-or-secret-file", name, 1, "fixture-path");
      else add("protected-paths", "protected-control-or-secret-file", name, 1, "CRITICAL");
    }

    if (stat.isSymbolicLink()) {
      const target = resolve(dirname(full), readlinkSync(full));
      if (!inside(target)) add("escaping-symlinks", "symlink-target-outside-repository", name, 1, "HIGH");
      files.push({ path: name, status: "SYMLINK", sha256: null });
      continue;
    }
    if (!stat.isFile()) {
      files.push({ path: name, status: "NON_REGULAR", sha256: null });
      continue;
    }

    const bytes = readFileSync(full);
    const binary = bytes.includes(0);
    files.push({ path: name, status: binary ? "BINARY" : "TEXT", sha256: digest(bytes) });
    if (binary) continue;

    const text = bytes.toString("utf8");
    for (const [rule, pattern] of SECRET_RULES) {
      for (const match of text.matchAll(pattern)) {
        const matched = match[0];
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        if (placeholderLike(matched)) {
          waive("secret-signatures", rule, name, line, "placeholder-marker", digest(matched));
          continue;
        }
        if (fixturePath(name) && FIXTURE_WAIVABLE_RULES.has(rule)) {
          waive("secret-signatures", rule, name, line, "fixture-path", digest(matched));
          continue;
        }
        add("secret-signatures", rule, name, line, "CRITICAL", digest(matched));
      }
    }

    if (name.replace(/\\/g, "/") === "package.json") {
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(text) as Record<string, unknown>;
      } catch {
        add("dependency-sources", "malformed-package-json", name, 1, "HIGH");
        continue;
      }
      for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        const deps = pkg[section];
        if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
        for (const [dependency, specifier] of Object.entries(deps as Record<string, unknown>)) {
          const value = String(specifier).trim();
          if (value === "*" || /^latest$/i.test(value) || /^(?:git(?:\+[^:]+)?|https?):/i.test(value)) {
            const fp = digest(`${dependency}:${value}`);
            if (options.allowRemoteDeps) waive("dependency-sources", "unbounded-or-remote-dependency", name, 1, "explicit-env-waiver", fp);
            else add("dependency-sources", "unbounded-or-remote-dependency", name, 1, "HIGH", fp);
          }
        }
      }
    }
  }

  const result: ScanResult = !options.gitBound ? "NOT_APPLICABLE" : findings.length ? "BLOCK" : "CLEAN";
  return {
    schemaVersion: "1.0",
    policyVersion: SECURITY_POLICY_VERSION,
    source: "orchestrator",
    candidateTreeOid: options.candidateTreeOid || null,
    result,
    adapters,
    files,
    findings,
    waivers,
  };
}
