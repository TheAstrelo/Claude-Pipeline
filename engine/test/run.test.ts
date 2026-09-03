/**
 * Whole-run scenarios, re-expressed from the shell battery against an
 * in-process adapter. Each drives the real stage machine over a real git
 * repository; only the model is fake.
 */
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, write, cleanup, sh } from "./helpers.js";
import { FakeAdapter } from "../src/providers/fake.js";
import { resolveBudget, type EngineConfig, type Profile, type Quality } from "../src/config.js";
import { Runner } from "../src/run.js";
import type { ExecuteRequest, ExecuteResult } from "../src/providers/types.js";

const roots: string[] = [];
afterEach(() => cleanup(...roots.splice(0)));

/** A Node project whose test command passes only once src/feature.js exists. */
function project(extra: Record<string, string> = {}): string {
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "fixture", scripts: { test: "node test/run.js" } }, null, 2) + "\n",
    "test/run.js": `const fs = require("fs");
if (!fs.existsSync(__dirname + "/../src/feature.js")) { console.error("feature missing"); process.exit(1); }
console.log("ok");
`,
    "src/index.js": "module.exports = {};\n",
    ...extra,
  });
  roots.push(root);
  return root;
}

function config(root: string, over: Partial<EngineConfig> = {}): EngineConfig {
  return {
    task: "add the feature",
    provider: "claude",
    quality: "max" as Quality,
    profile: "standard" as Profile,
    budget: resolveBudget({ policy: "elastic", perCallUsd: null, runUsd: null }),
    models: { strong: null, balanced: null, review: null },
    commit: true,
    allowUntestedCommit: false,
    push: false,
    openPr: false,
    callTimeoutMs: 30_000,
    commandTimeoutMs: 30_000,
    stateDir: join(root, ".pipeline"),
    repoRoot: root,
    resumeRunId: null,
    baselineChecks: true,
    ...over,
  };
}

const PLAN = {
  precheck: { matches: [], recommendation: "BUILD_NEW", reasoning: "nothing similar exists" },
  brief: {
    verdict: "CLEAR", problem: "the feature is missing",
    criteria: [{ id: "SC1", statement: "src/feature.js exists and exports feature", verification: "npm test" }],
    outOfScope: [], assumptions: [],
  },
  design: { decisions: [{ decision: "add a module", rationale: "smallest change", source: "src/index.js:1" }], risks: [] },
  steps: [{ file: "src/feature.js", action: "CREATE", anchor: null, intent: "add the feature module", test: "npm test", criteria: ["SC1"] }],
};

/** The default happy-path script: plan, approve, build the file, approve. */
function goodHandler(over: Partial<Record<string, (r: ExecuteRequest) => Partial<ExecuteResult>>> = {}) {
  return (request: ExecuteRequest): Partial<ExecuteResult> => {
    const custom = over[request.label];
    if (custom) return custom(request);
    switch (request.label) {
      case "plan": return { structured: PLAN };
      case "critique": return { structured: { verdict: "APPROVED", findings: [] } };
      case "build": {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "done", blockedReason: null } };
      }
      case "qafix": return { structured: { verdict: "FIXED", notes: "" } };
      case "security": return { structured: { verdict: "PASS", findings: [] } };
      case "review": return { structured: { verdict: "APPROVE", findings: [], coverage: [{ id: "SC1", satisfied: true, evidence: "src/feature.js" }] } };
      default: return { structured: { confirmed: false, reason: "not reproducible" } };
    }
  };
}

async function runWith(root: string, handler: Parameters<typeof FakeAdapter.prototype.execute> extends never ? never : ConstructorParameters<typeof FakeAdapter>[0], over: Partial<EngineConfig> = {}) {
  const adapter = new FakeAdapter(handler);
  const runner = new Runner(config(root, over), adapter, "testrun");
  const result = await runner.execute();
  return { result, adapter };
}

describe("happy path", () => {
  it("commits the exact reviewed tree and leaves the checkout untouched", async () => {
    const root = project();
    const before = sh(root, "git", ["rev-parse", "HEAD"]).trim();
    const { result, adapter } = await runWith(root, goodHandler());

    expect(result.status).toBe("COMPLETED");
    expect(result.exitCode).toBe(0);
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);

    // The commit contains the built file and sits on the immutable baseline.
    expect(sh(root, "git", ["show", `${result.commit}:src/feature.js`])).toContain("feature");
    expect(sh(root, "git", ["rev-parse", `${result.commit}^`]).trim()).toBe(before);
    // The user's checkout never moved.
    expect(sh(root, "git", ["rev-parse", "HEAD"]).trim()).toBe(before);
    expect(sh(root, "git", ["status", "--porcelain"]).trim()).toBe("");

    // Six roles, not thirteen phases.
    expect(new Set(adapter.labels())).toEqual(new Set(["plan", "critique", "build", "security", "review"]));
    expect(existsSync(join(result.artifactsDir, "review.diff"))).toBe(true);
    expect(existsSync(join(result.artifactsDir, "security-scanners.json"))).toBe(true);
  });

  it("skips the quality model call when the deterministic checks are clean", async () => {
    const root = project();
    const { adapter } = await runWith(root, goodHandler());
    expect(adapter.countOf("qafix")).toBe(0);
  });

  it("calls the quality fixer only when there is something to fix", async () => {
    const root = project();
    const { adapter } = await runWith(root, goodHandler({
      build: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "console.log('debugging');\nmodule.exports.feature = () => true;\n");
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "", blockedReason: null } };
      },
      qafix: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        return { structured: { verdict: "FIXED", notes: "removed debug output" } };
      },
    }));
    expect(adapter.countOf("qafix")).toBe(1);
  });
});

describe("the test gate cannot be talked around", () => {
  it("does not commit a build that claims success without doing the work", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      build: request => {
        // Writes something, but not what the tests require, and claims success.
        writeFileSync(join(request.cwd, "src/unrelated.js"), "module.exports = {};\n");
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/unrelated.js"], notes: "all green, trust me", blockedReason: null } };
      },
    }));
    // The claim is worthless: the orchestrator ran the real test command, and
    // the tests were red at baseline, so this is the TDD path — the work did
    // not turn them green, so nothing is committed.
    expect(result.status).toBe("REVIEW_ONLY");
    expect(result.commit).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/not green/);
    expect(sh(root, "git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });

  it("halts before security and review when the run breaks tests that were green", async () => {
    // Baseline green: the test only needs the file that already exists.
    const root = project({
      "test/run.js": `const fs = require("fs");
if (!fs.existsSync(__dirname + "/../src/index.js")) { console.error("index missing"); process.exit(1); }
console.log("ok");
`,
    });
    const { result, adapter } = await runWith(root, goodHandler({
      build: request => {
        rmSync(join(request.cwd, "src/index.js"));
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "", blockedReason: null } };
      },
    }));
    expect(result.status).toBe("HALTED");
    expect(result.exitCode).toBe(3);
    expect(result.message).toMatch(/verification failed/);
    // Security and review never saw a broken tree.
    expect(adapter.countOf("security")).toBe(0);
    expect(adapter.countOf("review")).toBe(0);
  });

  it("halts when the build changes nothing at all", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      build: () => ({ structured: { verdict: "SUCCESS", filesChanged: [], notes: "nothing to do", blockedReason: null } }),
    }));
    expect(result.status).toBe("HALTED");
    expect(result.message).toMatch(/no change to the tree/);
  });

  it("halts when a check changes the tree it is measuring", async () => {
    const root = project({
      "package.json": JSON.stringify({ name: "fixture", scripts: { test: "node test/mutate.js" } }, null, 2) + "\n",
      "test/mutate.js": "require('fs').writeFileSync(__dirname + '/../generated.txt', String(Date.now()));\n",
    });
    const { result } = await runWith(root, goodHandler());
    expect(result.status).toBe("HALTED");
    expect(result.message).toMatch(/changed the tree|modify the working tree/);
  });
});

describe("plan lint", () => {
  it("re-plans when an anchor does not occur in the file, then proceeds", async () => {
    const root = project();
    let planCalls = 0;
    const { result, adapter } = await runWith(root, request => {
      if (request.label === "plan") {
        planCalls++;
        const steps = planCalls === 1
          ? [{ file: "src/index.js", action: "MODIFY", anchor: "function thatDoesNotExist()", intent: "x", test: "npm test", criteria: ["SC1"] }]
          : PLAN.steps;
        return { structured: { ...PLAN, steps } };
      }
      return goodHandler()(request);
    });
    expect(planCalls).toBe(2);
    expect(result.status).toBe("COMPLETED");
    void adapter;
  });

  it("passes the findings to the builder rather than halting when lint will not converge", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, request => {
      if (request.label === "plan") {
        return { structured: { ...PLAN, steps: [{ file: "src/index.js", action: "MODIFY", anchor: "never present", intent: "x", test: "npm test", criteria: ["SC1"] }] } };
      }
      return goodHandler()(request);
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.warnings.join(" ")).toMatch(/plan lint did not converge/);
    const buildPrompt = adapter.calls.find(c => c.label === "build")!.prompt;
    expect(buildPrompt).toContain("Anchors the pre-build lint could not confirm");
  });
});

describe("the BLOCKER lane", () => {
  it("demotes a blocking review that cites no evidence", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, goodHandler({
      review: () => ({ structured: {
        verdict: "REQUEST_CHANGES",
        findings: [{ severity: "BLOCKER", location: "src/feature.js", summary: "I do not like this", evidence: "-" }],
        coverage: [],
      } }),
    }));
    expect(result.status).toBe("COMPLETED");
    expect(result.warnings.join(" ")).toMatch(/demoted/);
    expect(adapter.countOf("heal")).toBe(0);
  });

  it("strips a blocker citing a file the change never touched", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      review: () => ({ structured: {
        verdict: "REQUEST_CHANGES",
        findings: [{ severity: "BLOCKER", location: "src/untouched.js:4", summary: "bug over there", evidence: "line 4 divides by zero" }],
        coverage: [],
      } }),
    }));
    expect(result.status).toBe("COMPLETED");
  });

  it("heals a real blocker, then re-verifies and re-scans before re-reviewing", async () => {
    const root = project();
    let reviews = 0;
    const order: string[] = [];
    const { result, adapter } = await runWith(root, request => {
      order.push(request.label);
      if (request.label === "review") {
        reviews++;
        if (reviews === 1) {
          return { structured: {
            verdict: "REQUEST_CHANGES",
            findings: [{ severity: "BLOCKER", location: "src/feature.js:1", summary: "returns true unconditionally", evidence: "line 1 always returns true regardless of input" }],
            coverage: [],
          } };
        }
        return { structured: { verdict: "APPROVE", findings: [], coverage: [] } };
      }
      if (request.label === "refute:review") return { structured: { confirmed: true, reason: "reproduced" } };
      if (request.label === "heal") {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = (x) => Boolean(x);\n");
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "fixed", blockedReason: null } };
      }
      return goodHandler()(request);
    });

    expect(result.status).toBe("COMPLETED");
    expect(adapter.countOf("heal")).toBe(1);
    // A heal invalidates every prior approval: security runs again before the
    // second review, not after it.
    const healAt = order.indexOf("heal");
    const secondSecurity = order.indexOf("security", healAt);
    const secondReview = order.lastIndexOf("review");
    expect(secondSecurity).toBeGreaterThan(healAt);
    expect(secondReview).toBeGreaterThan(secondSecurity);
    // The committed tree carries the healed version.
    expect(sh(root, "git", ["show", `${result.commit}:src/feature.js`])).toContain("Boolean(x)");
  });

  it("drops a blocker the refuter cannot reproduce", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, goodHandler({
      review: () => ({ structured: {
        verdict: "REQUEST_CHANGES",
        findings: [{ severity: "BLOCKER", location: "src/feature.js:1", summary: "race condition", evidence: "two callers could interleave" }],
        coverage: [],
      } }),
    }));
    expect(result.status).toBe("COMPLETED");
    expect(adapter.countOf("refute:review")).toBe(1);
    expect(adapter.countOf("heal")).toBe(0);
  });
});

describe("security", () => {
  it("blocks a leaked credential before any security model call", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, goodHandler({
      build: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        writeFileSync(join(request.cwd, "src/config.js"), `module.exports.token = "ghp_${"C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0"}";\n`);
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js", "src/config.js"], notes: "", blockedReason: null } };
      },
    }));
    expect(result.status).toBe("HALTED");
    expect(result.haltedAt).toBe("security-scanner");
    expect(result.message).toMatch(/not waivable/);
    expect(adapter.countOf("security")).toBe(0);
    // Nothing was committed.
    expect(sh(root, "git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });

  it("halts on a confirmed security blocker", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      security: () => ({ structured: {
        verdict: "FAIL",
        findings: [{ severity: "BLOCKER", location: "src/feature.js:1", summary: "unsanitized input reaches exec", evidence: "line 1 passes req.query.cmd to child_process.exec" }],
      } }),
      "refute:security": () => ({ structured: { confirmed: true, reason: "the path is reachable from the route" } }),
    }));
    expect(result.status).toBe("HALTED");
    expect(result.haltedAt).toBe("security");
  });
});

describe("budgets", () => {
  it("is uncapped by default", async () => {
    const root = project();
    const { adapter } = await runWith(root, goodHandler());
    expect(adapter.calls[0]!.budgetUsd).toBeNull();
  });

  it("caps each call and extends it once under a run cap", async () => {
    const root = project();
    let planCalls = 0;
    const { result, adapter } = await runWith(root, request => {
      if (request.label === "plan") {
        planCalls++;
        if (planCalls === 1) return { exit: "budget", errorMessage: "Reached maximum budget", usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0, costUsd: 0.05 } };
        return { structured: PLAN };
      }
      return goodHandler()(request);
    }, { budget: resolveBudget({ policy: "elastic", perCallUsd: null, runUsd: 50 }) });

    expect(result.status).toBe("COMPLETED");
    expect(adapter.calls[0]!.budgetUsd).toBe(4);
    expect(adapter.calls[1]!.budgetUsd).toBe(8);
  });

  it("stops rather than extending under a strict policy", async () => {
    const root = project();
    const { result } = await runWith(root, request => {
      if (request.label === "plan") return { exit: "budget", errorMessage: "Reached maximum budget", usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.05 } };
      return goodHandler()(request);
    }, { budget: resolveBudget({ policy: "strict", perCallUsd: 4, runUsd: 20 }) });
    expect(result.exitCode).toBe(4);
  });
});

describe("provider failures", () => {
  it("retries a transient failure once, then gives up cleanly", async () => {
    const root = project();
    let attempts = 0;
    const { result, adapter } = await runWith(root, request => {
      if (request.label === "plan") {
        attempts++;
        if (attempts === 1) return { exit: "transient", errorMessage: "API overloaded" };
        return { structured: PLAN };
      }
      return goodHandler()(request);
    });
    expect(result.status).toBe("COMPLETED");
    expect(adapter.countOf("plan")).toBe(2);
  });

  it("halts on a hard provider failure without committing", async () => {
    const root = project();
    const { result } = await runWith(root, request => {
      if (request.label === "plan") return { exit: "error", errorMessage: "malformed response" };
      return goodHandler()(request);
    });
    expect(result.status).toBe("HALTED");
    expect(sh(root, "git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });
});

describe("profiles", () => {
  it("yolo skips critique and quality entirely", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, goodHandler(), { profile: "yolo" });
    expect(result.status).toBe("COMPLETED");
    expect(adapter.countOf("critique")).toBe(0);
    expect(adapter.countOf("qafix")).toBe(0);
  });

  it("review-only mode never commits", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler(), { commit: false });
    expect(result.status).toBe("REVIEW_ONLY");
    expect(result.exitCode).toBe(0);
    expect(sh(root, "git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });
});

describe("routing", () => {
  it("sends review to the review lane and quality fixes to the balanced lane", async () => {
    const root = project();
    const { adapter } = await runWith(root, goodHandler({
      build: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "console.log('x');\nmodule.exports.feature = () => true;\n");
        return { structured: { verdict: "SUCCESS", filesChanged: [], notes: "", blockedReason: null } };
      },
      qafix: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        return { structured: { verdict: "FIXED", notes: "" } };
      },
    }));
    const byLabel = Object.fromEntries(adapter.calls.map(c => [c.label, c]));
    expect(byLabel["plan"]!.model).toBe("fake-strong");
    expect(byLabel["review"]!.model).toBe("fake-review");
    expect(byLabel["qafix"]!.model).toBe("fake-balanced");
    expect(byLabel["review"]!.effort).toBe("max");
  });
});

describe("resume", () => {
  it("re-enters a halted run, keeps the built tree, and does not re-plan", async () => {
    const root = project();
    // First attempt: the review fails hard after the build succeeded.
    const first = await runWith(root, goodHandler({
      review: () => ({ exit: "error", errorMessage: "provider fell over" }),
    }));
    expect(first.result.status).toBe("HALTED");

    // The worktree and its work survive for the resume.
    const worktree = join(root, ".pipeline", "worktrees", "testrun");
    expect(existsSync(join(worktree, "src/feature.js"))).toBe(true);

    const second = await runWith(root, goodHandler(), { resumeRunId: "testrun" });
    expect(second.result.status).toBe("COMPLETED");
    // Plan, critique and build were not paid for again.
    expect(second.adapter.countOf("plan")).toBe(0);
    expect(second.adapter.countOf("critique")).toBe(0);
    expect(second.adapter.countOf("build")).toBe(0);
    expect(second.adapter.countOf("review")).toBe(1);
    expect(sh(root, "git", ["show", `${second.result.commit}:src/feature.js`])).toContain("feature");
  });

  it("refuses to resume under a different task, naming the reason", async () => {
    const root = project();
    await runWith(root, goodHandler({ review: () => ({ exit: "error", errorMessage: "fell over" }) }));
    const { result } = await runWith(root, goodHandler(), { resumeRunId: "testrun", task: "a completely different task" });
    expect(result.status).toBe("HALTED");
    expect(result.message).toMatch(/resume needs the same task/);
  });

  it("refuses to resume when the verification descriptors changed", async () => {
    const root = project();
    await runWith(root, goodHandler({ review: () => ({ exit: "error", errorMessage: "fell over" }) }));
    write(root, { "package.json": JSON.stringify({ name: "fixture", scripts: { test: "node test/run.js", pretest: "echo sneaky" } }, null, 2) + "\n" });
    sh(root, "git", ["add", "-A"]);
    sh(root, "git", ["commit", "-q", "-m", "change scripts"]);
    const { result } = await runWith(root, goodHandler(), { resumeRunId: "testrun" });
    expect(result.status).toBe("HALTED");
    expect(result.message).toMatch(/cannot resume/);
  });

  it("restores a worktree left mid-write", async () => {
    const root = project();
    await runWith(root, goodHandler({ review: () => ({ exit: "error", errorMessage: "fell over" }) }));
    // Simulate an interrupted write inside the engine-owned worktree.
    writeFileSync(join(root, ".pipeline", "worktrees", "testrun", "src/feature.js"), "half-writ");
    const { result } = await runWith(root, goodHandler(), { resumeRunId: "testrun" });
    expect(result.warnings.join(" ")).toMatch(/mid-write|does not match the checkpoint/);
    expect(result.status).toBe("COMPLETED");
  });
});

describe("run budget", () => {
  it("clamps a call to what is left of the run budget rather than only warning", async () => {
    const root = project();
    const { result, adapter } = await runWith(root, request => {
      if (request.label === "plan") {
        // Spend most of the run budget on the first call.
        return { structured: PLAN, usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0, costUsd: 4.5 } };
      }
      return goodHandler()(request);
    }, { budget: resolveBudget({ policy: "elastic", perCallUsd: 4, runUsd: 5 }) });

    const afterPlan = adapter.calls.find(c => c.label === "critique")!;
    expect(afterPlan.budgetUsd).toBeCloseTo(0.5, 5);
    expect(result.warnings.join(" ")).toMatch(/remaining run budget/);
  });

  it("stops once the run budget is spent", async () => {
    const root = project();
    const { result } = await runWith(root, request => {
      if (request.label === "plan") return { structured: PLAN, usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 6 } };
      return goodHandler()(request);
    }, { budget: resolveBudget({ policy: "elastic", perCallUsd: 4, runUsd: 5 }) });
    expect(result.exitCode).toBe(4);
    expect(result.message).toMatch(/run budget/);
  });

  it("records every stage it finished in the run summary", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler());
    expect(result.stages["plan"]).toBe("DONE");
    expect(result.stages["build"]).toBe("DONE");
    expect(result.stages["verify"]).toBe("DONE");
    expect(result.stages["security"]).toBe("DONE");
    expect(result.stages["review"]).toBe("DONE");
  });

  it("marks the stage that halted", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      build: () => ({ exit: "error", errorMessage: "provider fell over" }),
    }));
    expect(result.haltedAt).toBe("build");
    expect(result.stages["build"]).toBe("HALTED");
  });
});

describe("critique that will not converge", () => {
  const stubborn = () => goodHandler({
    critique: () => ({ structured: {
      verdict: "REVISE_DESIGN",
      findings: [{ severity: "BLOCKER", location: "src/feature.js:1", summary: "the whole approach is wrong", evidence: "the design creates a module where a function would do" }],
    } }),
    "refute:critique": () => ({ structured: { confirmed: true, reason: "agreed" } }),
  });

  it("halts in standard, where gates are strict", async () => {
    const root = project();
    const { result } = await runWith(root, stubborn(), { profile: "standard" });
    expect(result.status).toBe("HALTED");
    expect(result.haltedAt).toBe("critique");
  });

  it("proceeds with a note in fast, where the later gates still apply", async () => {
    const root = project();
    const { result } = await runWith(root, stubborn(), { profile: "fast" });
    expect(result.status).toBe("COMPLETED");
    expect(result.warnings.join(" ")).toMatch(/critique did not converge/);
  });
});

describe("the commit boundary", () => {
  it("refuses when a model commits on its own", async () => {
    const root = project();
    const before = sh(root, "git", ["rev-parse", "HEAD"]).trim();
    const { result } = await runWith(root, goodHandler({
      build: request => {
        writeFileSync(join(request.cwd, "src/feature.js"), "module.exports.feature = () => true;\n");
        // A model that takes the commit into its own hands.
        sh(request.cwd, "git", ["add", "-A"]);
        sh(request.cwd, "git", ["-c", "user.email=m@m", "-c", "user.name=m", "-c", "commit.gpgSign=false", "commit", "-q", "-m", "unauthorized"]);
        return { structured: { verdict: "SUCCESS", filesChanged: ["src/feature.js"], notes: "", blockedReason: null } };
      },
    }));
    // The run branch moved off the baseline, so the atomic commit refuses
    // rather than building on a commit nothing reviewed.
    expect(result.status).toBe("HALTED");
    expect(result.haltedAt).toBe("commit");
    expect(sh(root, "git", ["rev-parse", "HEAD"]).trim()).toBe(before);
  });

  it("refuses when the tree changes after the review", async () => {
    const root = project();
    const { result } = await runWith(root, goodHandler({
      // The reviewer is read-only in a real run; here it writes, standing in
      // for anything that touches the tree between approval and commit.
      review: request => {
        writeFileSync(join(request.cwd, "src/smuggled.js"), "module.exports = 'not reviewed';\n");
        return { structured: { verdict: "APPROVE", findings: [], coverage: [] } };
      },
    }));
    expect(result.status).toBe("HALTED");
    expect(result.haltedAt).toBe("commit");
    expect(result.message).toMatch(/changed after it was reviewed/);
    expect(sh(root, "git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });
});
