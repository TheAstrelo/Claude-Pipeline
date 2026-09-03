/**
 * Live adapter checks against the real provider. Skipped unless PIPELINE_LIVE=1
 * because they spend money; they are the only proof that the isolation and
 * guard settings actually hold end to end.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, write, cleanup } from "./helpers.js";
import { ClaudeAdapter } from "../src/providers/claude.js";

const live = process.env.PIPELINE_LIVE === "1";
const suite = live ? describe : describe.skip;

suite("claude adapter (live)", () => {
  const model = "claude-sonnet-5";
  const adapter = new ClaudeAdapter({ preflightEnabled: false });
  const base = { model, effort: "low" as const, timeoutMs: 240_000, budgetUsd: 0.6 };

  it("returns a report and real usage", async () => {
    const root = makeRepo({ "README.md": "the project is called Kestrel\n" });
    try {
      const result = await adapter.execute({
        ...base, label: "smoke", cwd: root, toolScope: "read", sandbox: "read-only",
        prompt: "Read README.md and reply with only the project name.",
      });
      expect(result.exit).toBe("ok");
      expect(result.report).toContain("Kestrel");
      expect(result.usage.costUsd).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
    } finally { cleanup(root); }
  }, 300_000);

  it("returns a typed verdict against a schema", async () => {
    const root = makeRepo();
    try {
      const result = await adapter.execute({
        ...base, label: "verdict", cwd: root, toolScope: "read", sandbox: "read-only",
        prompt: "A change removes the authentication check from login(). Give your verdict and one finding.",
        schema: {
          type: "object", additionalProperties: false, required: ["verdict", "findings"],
          properties: {
            verdict: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES"] },
            findings: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["severity", "summary"],
                properties: { severity: { type: "string", enum: ["BLOCKER", "WARN"] }, summary: { type: "string" } },
              },
            },
          },
        },
      });
      expect(result.exit).toBe("ok");
      const structured = result.structured as { verdict: string; findings: unknown[] };
      expect(structured.verdict).toBe("REQUEST_CHANGES");
      expect(Array.isArray(structured.findings)).toBe(true);
    } finally { cleanup(root); }
  }, 300_000);

  it("cannot write in a read-only scope", async () => {
    const root = makeRepo();
    try {
      const result = await adapter.execute({
        ...base, label: "readonly", cwd: root, toolScope: "read", sandbox: "read-only",
        prompt: "Create a file called breach.txt containing the word oops. Then reply DONE, or NOWRITE if you could not.",
      });
      expect(existsSync(join(root, "breach.txt"))).toBe(false);
      expect(result.report).toContain("NOWRITE");
    } finally { cleanup(root); }
  }, 300_000);

  it("blocks a denied command and a protected-file edit in a write scope", async () => {
    const root = makeRepo({ "README.md": "seed\n", "package.json": '{"name":"x"}\n' });
    try {
      const result = await adapter.execute({
        ...base, label: "guards", cwd: root, toolScope: "write-exec", sandbox: "workspace-write",
        prompt: "Do both, reporting what happened: (1) run `git commit --allow-empty -m nope` with Bash; (2) use Write to replace package.json with {}.",
        denyCommands: [{ pattern: /\bgit\s+commit\b/, reason: "commits are the orchestrator's job" }],
        protectedPaths: ["package.json"],
      });
      expect(result.denials.length).toBeGreaterThan(0);
      expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"name"');
      expect(gitLog(root)).toBe(1);
    } finally { cleanup(root); }
  }, 300_000);

  it("classifies a budget stop rather than losing the call", async () => {
    const root = makeRepo();
    try {
      const result = await adapter.execute({
        ...base, label: "budget", cwd: root, toolScope: "read", sandbox: "read-only",
        budgetUsd: 0.005, effort: "high",
        prompt: "Write a detailed 800-word essay about the history of version control systems.",
      });
      expect(result.exit).toBe("budget");
      expect(result.usage.costUsd).not.toBeNull();
    } finally { cleanup(root); }
  }, 300_000);

  it("classifies an unusable model", async () => {
    const root = makeRepo();
    try {
      const result = await adapter.execute({
        ...base, label: "badmodel", cwd: root, toolScope: "read", sandbox: "read-only",
        model: "claude-does-not-exist-9", prompt: "Reply with exactly: OK",
      });
      expect(result.exit).toBe("model-unavailable");
    } finally { cleanup(root); }
  }, 300_000);

  it("preflight leaves every lane on a model this account can actually use", async () => {
    const probing = new ClaudeAdapter();
    const report = await probing.preflight();
    expect(report.ok).toBe(true);
    // Either the default review model works, or the fallback chain moved the
    // lane and said so.
    if (report.models.review !== "claude-fable-5-1") {
      expect(report.fallbacks.join(" ")).toContain("review:");
    }
    for (const lane of ["strong", "balanced", "review"] as const) {
      expect(report.models[lane]).toMatch(/^claude-/);
    }
  }, 600_000);

  it("preflight refuses an explicitly named model it cannot use, rather than substituting one", async () => {
    const probing = new ClaudeAdapter({ models: { review: "claude-does-not-exist-9" } });
    const report = await probing.preflight();
    expect(report.ok).toBe(false);
    expect(report.error).toContain("review");
  }, 600_000);
});

function gitLog(root: string): number {
  return execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: root, encoding: "utf8" }).trim() === "1" ? 1 : 2;
}
