import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, write, cleanup } from "./helpers.js";
import { scanCandidate, ScannerEscapeError, SECURITY_POLICY_VERSION } from "../src/security.js";

const roots: string[] = [];
function repo(files?: Record<string, string>): string {
  const root = makeRepo(files); roots.push(root); return root;
}
afterEach(() => cleanup(...roots.splice(0)));

function scan(root: string, paths: string[], allowRemoteDeps = false) {
  return scanCandidate({ root, paths, candidateTreeOid: "deadbeef", gitBound: true, allowRemoteDeps });
}

// A live-shaped GitHub token, assembled at runtime so this test file itself
// never contains a scannable credential.
const LIVE_TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const LIVE_AWS = "AKIA" + "IOSFODNN7EXAMPL1";

describe("clean candidates", () => {
  it("passes ordinary source with no findings", () => {
    const root = repo({ "src/app.ts": "export const x = 1;\n" });
    const evidence = scan(root, ["src/app.ts"]);
    expect(evidence.result).toBe("CLEAN");
    expect(evidence.findings).toEqual([]);
    expect(evidence.policyVersion).toBe(SECURITY_POLICY_VERSION);
    expect(evidence.files[0]).toMatchObject({ path: "src/app.ts", status: "TEXT" });
    expect(evidence.files[0]!.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("reports NOT_APPLICABLE without a git binding", () => {
    const root = repo();
    const evidence = scanCandidate({ root, paths: [], candidateTreeOid: null, gitBound: false, allowRemoteDeps: false });
    expect(evidence.result).toBe("NOT_APPLICABLE");
  });
});

describe("protected paths", () => {
  it("blocks a committed .env but not .env.example", () => {
    const root = repo();
    write(root, { ".env": "SECRET=1\n", ".env.example": "SECRET=\n" });
    const evidence = scan(root, [".env", ".env.example"]);
    expect(evidence.result).toBe("BLOCK");
    expect(evidence.findings.map(f => f.path)).toEqual([".env"]);
    expect(evidence.findings[0]!.rule).toBe("protected-control-or-secret-file");
  });

  it("waives a protected path under a fixture directory, recording the waiver", () => {
    const root = repo();
    write(root, { "tests/fixtures/.env": "SECRET=1\n" });
    const evidence = scan(root, ["tests/fixtures/.env"]);
    expect(evidence.result).toBe("CLEAN");
    expect(evidence.waivers[0]).toMatchObject({ adapter: "protected-paths", reason: "fixture-path" });
  });

  it("blocks credential files at any depth, not only at the repository root", () => {
    const root = repo();
    write(root, {
      "apps/web/.env": "DATABASE_URL=postgres://u:p@h/db\n",
      "packages/app/.npmrc": "//registry.example.invalid/:_authToken=abc\n",
      "deploy/credentials.json": "{}\n",
    });
    const evidence = scan(root, ["apps/web/.env", "packages/app/.npmrc", "deploy/credentials.json"]);
    expect(evidence.result).toBe("BLOCK");
    expect(evidence.findings.map(f => f.path).sort())
      .toEqual(["apps/web/.env", "deploy/credentials.json", "packages/app/.npmrc"]);
  });

  it("still allows nested placeholder env files", () => {
    const root = repo();
    write(root, { "apps/web/.env.example": "DATABASE_URL=\n" });
    expect(scan(root, ["apps/web/.env.example"]).result).toBe("CLEAN");
  });
});

describe("secret signatures", () => {
  it("blocks a live-shaped token in source and records only its digest", () => {
    const root = repo();
    write(root, { "src/config.ts": `export const token = "${LIVE_TOKEN}";\n` });
    const evidence = scan(root, ["src/config.ts"]);
    expect(evidence.result).toBe("BLOCK");
    expect(evidence.findings[0]).toMatchObject({ rule: "github-token", severity: "CRITICAL", line: 1 });
    expect(JSON.stringify(evidence)).not.toContain(LIVE_TOKEN);
    expect(evidence.findings[0]!.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("blocks live-shaped credentials even inside fixtures", () => {
    const root = repo();
    write(root, { "tests/fixtures/creds.ts": `const k = "${LIVE_AWS}";\n` });
    const evidence = scan(root, ["tests/fixtures/creds.ts"]);
    expect(evidence.result).toBe("BLOCK");
    expect(evidence.findings[0]!.rule).toBe("aws-access-key");
  });

  it("waives shape-only matches in fixtures but not in shipped source", () => {
    const root = repo();
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    write(root, { "tests/fixtures/token.ts": `const t = "${jwt}";\n`, "src/token.ts": `const t = "${jwt}";\n` });
    const fixture = scan(root, ["tests/fixtures/token.ts"]);
    expect(fixture.result).toBe("CLEAN");
    expect(fixture.waivers[0]).toMatchObject({ rule: "jwt", reason: "fixture-path" });
    expect(scan(root, ["src/token.ts"]).result).toBe("BLOCK");
  });

  it("waives a match that announces itself as a placeholder", () => {
    const root = repo();
    write(root, { "src/config.ts": `const k = "sk-EXAMPLE-000000000000000000";\n` });
    const evidence = scan(root, ["src/config.ts"]);
    expect(evidence.result).toBe("CLEAN");
    expect(evidence.waivers[0]!.reason).toBe("placeholder-marker");
  });

  it("reports the correct line number for a later match", () => {
    const root = repo();
    write(root, { "src/x.ts": `const a = 1;\nconst b = 2;\nconst k = "${LIVE_TOKEN}";\n` });
    expect(scan(root, ["src/x.ts"]).findings[0]!.line).toBe(3);
  });

  it("scans every file independently (no shared regex state)", () => {
    const root = repo();
    write(root, { "a.ts": `const k = "${LIVE_TOKEN}";\n`, "b.ts": `const k = "${LIVE_TOKEN}";\n` });
    const evidence = scan(root, ["a.ts", "b.ts"]);
    expect(evidence.findings.map(f => f.path)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("dependency sources", () => {
  it("blocks a git specifier and waives it under the recorded env waiver", () => {
    const root = repo();
    write(root, { "package.json": JSON.stringify({ dependencies: { left: "git+https://example.invalid/x.git" } }) });
    expect(scan(root, ["package.json"]).findings[0]).toMatchObject({ rule: "unbounded-or-remote-dependency", severity: "HIGH" });
    const waived = scan(root, ["package.json"], true);
    expect(waived.result).toBe("CLEAN");
    expect(waived.waivers[0]!.reason).toBe("explicit-env-waiver");
  });

  it("blocks a wildcard version and malformed json", () => {
    const root = repo();
    write(root, { "package.json": JSON.stringify({ devDependencies: { a: "*" } }) });
    expect(scan(root, ["package.json"]).result).toBe("BLOCK");
    write(root, { "package.json": "{ not json" });
    expect(scan(root, ["package.json"]).findings[0]!.rule).toBe("malformed-package-json");
  });

  it("ignores pinned versions", () => {
    const root = repo();
    write(root, { "package.json": JSON.stringify({ dependencies: { a: "^1.2.3" } }) });
    expect(scan(root, ["package.json"]).result).toBe("CLEAN");
  });
});

describe("symlinks and non-regular files", () => {
  it("blocks a symlink pointing outside the repository", () => {
    const root = repo();
    symlinkSync("/etc/passwd", join(root, "escape"));
    const evidence = scan(root, ["escape"]);
    expect(evidence.result).toBe("BLOCK");
    expect(evidence.findings[0]!.rule).toBe("symlink-target-outside-repository");
    expect(evidence.files[0]!.status).toBe("SYMLINK");
  });

  it("allows an in-repository symlink", () => {
    const root = repo({ "README.md": "seed\n" });
    symlinkSync(join(root, "README.md"), join(root, "link.md"));
    expect(scan(root, ["link.md"]).result).toBe("CLEAN");
  });

  it("records a deleted path without scanning it", () => {
    const root = repo();
    const evidence = scan(root, [".env"]);
    expect(evidence.result).toBe("CLEAN");
    expect(evidence.files[0]).toMatchObject({ path: ".env", status: "DELETED", sha256: null });
  });

  it("marks binary files and does not scan their bytes", () => {
    const root = repo();
    writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));
    const evidence = scan(root, ["logo.png"]);
    expect(evidence.files[0]!.status).toBe("BINARY");
    expect(evidence.result).toBe("CLEAN");
  });

  it("fails closed when a candidate path escapes the repository", () => {
    const root = repo();
    expect(() => scan(root, ["../outside.txt"])).toThrow(ScannerEscapeError);
  });
});

describe("adapter status", () => {
  it("flips only the adapter that produced a finding", () => {
    const root = repo();
    write(root, { ".env": "x\n" });
    const evidence = scan(root, [".env"]);
    const byId = Object.fromEntries(evidence.adapters.map(a => [a.id, a.status]));
    expect(byId["protected-paths"]).toBe("FAIL");
    expect(byId["secret-signatures"]).toBe("PASS");
    expect(byId["escaping-symlinks"]).toBe("PASS");
  });
});
