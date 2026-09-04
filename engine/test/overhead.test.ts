/**
 * Engine overhead: the wall clock a run spends on everything that is not a
 * model call.
 *
 * The roadmap's target is under five seconds, against 44-57 seconds for the
 * shell engine, which spent most of it re-deriving state it already had and
 * spawning subprocesses to read JSON. Guarding it here means a regression
 * shows up as a failing test rather than as a slower corpus six weeks later.
 */
import { describe, expect, it, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, cleanup } from "./helpers.js";
import { FakeAdapter } from "../src/providers/fake.js";
import { resolveBudget, type EngineConfig } from "../src/config.js";
import { Runner } from "../src/run.js";
import type { ExecuteRequest, ExecuteResult } from "../src/providers/types.js";

const roots: string[] = [];
afterEach(() => cleanup(...roots.splice(0)));

const OVERHEAD_BUDGET_MS = 5_000;

describe("engine overhead", () => {
  it(`completes a whole run in under ${OVERHEAD_BUDGET_MS / 1000}s of engine time`, async () => {
    const root = makeRepo({
      // A test command that is as close to free as a real one gets, so what is
      // measured is the engine rather than the project.
      "package.json": JSON.stringify({ name: "bench", scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2) + "\n",
      "src/index.js": "module.exports = {};\n",
    });
    roots.push(root);

    const PLAN = {
      precheck: { matches: [], recommendation: "BUILD_NEW", reasoning: "n/a" },
      brief: { verdict: "CLEAR", problem: "p", criteria: [{ id: "SC1", statement: "s", verification: "npm test" }], outOfScope: [], assumptions: [] },
      design: { decisions: [], risks: [] },
      steps: [{ file: "src/feature.js", action: "CREATE", anchor: null, intent: "i", test: "npm test", criteria: ["SC1"] }],
    };
    const adapter = new FakeAdapter((request: ExecuteRequest): Partial<ExecuteResult> => {
      switch (request.label) {
        case "plan": return { structured: PLAN };
        case "critique": return { structured: { verdict: "APPROVED", findings: [] } };
        case "build":
          writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
          return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "", blockedReason: null } };
        case "security": return { structured: { verdict: "PASS", findings: [] } };
        case "review": return { structured: { verdict: "APPROVE", findings: [], coverage: [] } };
        default: return { structured: { confirmed: false, reason: "" } };
      }
    });

    const config: EngineConfig = {
      task: "add the feature", provider: "claude", quality: "max", profile: "standard",
      budget: resolveBudget({ policy: "elastic", perCallUsd: null, runUsd: null }),
      models: { strong: null, balanced: null, review: null },
      commit: true, allowUntestedCommit: false, push: false, openPr: false,
      callTimeoutMs: 30_000, commandTimeoutMs: 30_000,
      stateDir: join(root, ".pipeline"), repoRoot: root, resumeRunId: null, baselineChecks: true,
    };

    const started = Date.now();
    const result = await new Runner(config, adapter, "bench").execute();
    const elapsed = Date.now() - started;

    expect(result.status).toBe("COMPLETED");
    // The fake adapter returns instantly, so the wall clock is engine time
    // plus the project's own (near-zero) test command.
    expect(elapsed).toBeLessThan(OVERHEAD_BUDGET_MS);
    process.stdout.write(`\n  engine overhead: ${elapsed} ms for a complete run\n`);
  }, 60_000);
});
