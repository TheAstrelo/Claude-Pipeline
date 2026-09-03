import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo, write, cleanup } from "./helpers.js";
import {
  CHECK_NAMES, DetectionError, VerificationDriftError, applyBaselineTag, assertPlanUnchanged,
  bindTree, classifyExit, commandDisplay, detectVerificationCommands, gatesRelease, planDigest,
  runBaseline, runCommand, runVerified,
} from "../src/checks.js";
import { candidatePathspec, headSha } from "../src/git.js";

const roots: string[] = [];
function repo(files?: Record<string, string>): string {
  const root = makeRepo(files ?? { "README.md": "seed\n" }); roots.push(root); return root;
}
function plainDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pipeline-detect-")); roots.push(root);
  write(root, files); return root;
}
afterEach(() => cleanup(...roots.splice(0)));

const pkg = (body: Record<string, unknown>) => JSON.stringify(body, null, 2);

describe("detection: node", () => {
  it("maps scripts to package-manager argv, using the bare test form", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run", build: "tsc", lint: "eslint ." } }) });
    const plan = detectVerificationCommands(root, 900);
    expect(plan.commands.test).toEqual(["npm", "test"]);
    expect(plan.commands.build).toEqual(["npm", "run", "build"]);
    expect(plan.commands.lint).toEqual(["npm", "run", "lint"]);
    expect(plan.commands.typecheck).toEqual([]);
    expect(plan.commands.docs).toEqual([]);
  });

  it("honours a declared packageManager over the default", () => {
    const root = plainDir({ "package.json": pkg({ packageManager: "pnpm@9.1.0", scripts: { test: "vitest" } }) });
    expect(detectVerificationCommands(root, 900).commands.test).toEqual(["pnpm", "test"]);
  });

  it("infers the manager from a lockfile, and bun always uses run", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "bun test" } }), "bun.lockb": "" });
    expect(detectVerificationCommands(root, 900).commands.test).toEqual(["bun", "run", "test"]);
  });

  it("tries typecheck aliases in order", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { "check-types": "tsc --noEmit" } }) });
    const plan = detectVerificationCommands(root, 900);
    expect(plan.commands.typecheck).toEqual(["npm", "run", "check-types"]);
    expect(plan.packagePolicy.selectedScripts.typecheck).toBe("check-types");
  });

  it("ignores npm's placeholder test script", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) });
    expect(detectVerificationCommands(root, 900).commands.test).toEqual([]);
  });

  it("fails closed on a malformed manifest rather than falling back", () => {
    const root = plainDir({ "package.json": "{ not json" });
    expect(() => detectVerificationCommands(root, 900)).toThrow(DetectionError);
    const bad = plainDir({ "package.json": pkg({ scripts: ["test"] }) });
    expect(() => detectVerificationCommands(bad, 900)).toThrow(DetectionError);
  });

  it("refuses ambiguous or contradictory manager signals", () => {
    const two = plainDir({ "package.json": pkg({ scripts: { test: "x" } }), "yarn.lock": "", "pnpm-lock.yaml": "" });
    expect(() => detectVerificationCommands(two, 900)).toThrow(/ambiguous/);
    const clash = plainDir({ "package.json": pkg({ packageManager: "yarn@4", scripts: { test: "x" } }), "pnpm-lock.yaml": "" });
    expect(() => detectVerificationCommands(clash, 900)).toThrow(/disagree/);
    const unsupported = plainDir({ "package.json": pkg({ packageManager: "hamster@1" }) });
    expect(() => detectVerificationCommands(unsupported, 900)).toThrow(/unsupported/);
  });

  it("records every script body that could weaken a gate", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run", pretest: "echo hi" } }) });
    const policy = detectVerificationCommands(root, 900).packagePolicy;
    expect(policy.recognizedScripts["test"]).toBe("vitest run");
    expect(policy.recognizedScripts["pretest"]).toBe("echo hi");
    expect(policy.recognizedScripts["posttest"]).toBeNull();
  });
});

describe("detection: other ecosystems", () => {
  it("detects go, and package.json wins outright when both exist", () => {
    const go = plainDir({ "go.mod": "module example.com/x\n" });
    const plan = detectVerificationCommands(go, 900);
    expect(plan.commands.test).toEqual(["go", "test", "./..."]);
    expect(plan.commands.typecheck).toEqual(["go", "vet", "./..."]);

    const both = plainDir({ "go.mod": "module x\n", "package.json": pkg({ scripts: { test: "vitest" } }) });
    expect(detectVerificationCommands(both, 900).commands.test).toEqual(["npm", "test"]);
  });

  it("detects cargo and python", () => {
    const rust = plainDir({ "Cargo.toml": "[package]\nname='x'\n" });
    expect(detectVerificationCommands(rust, 900).commands.test).toEqual(["cargo", "test"]);
    expect(detectVerificationCommands(rust, 900).commands.lint).toContain("clippy");

    const py = plainDir({ "pyproject.toml": "[tool.pytest.ini_options]\n" });
    const plan = detectVerificationCommands(py, 900);
    expect(plan.commands.test.slice(1)).toEqual(["-m", "pytest", "-q"]);
    expect(plan.commands.typecheck).toEqual([]);
  });

  it("reports nothing for a bare directory", () => {
    const plan = detectVerificationCommands(plainDir({ "README.md": "hi\n" }), 900);
    for (const name of CHECK_NAMES) expect(plan.commands[name]).toEqual([]);
  });
});

describe("plan freezing and drift", () => {
  it("accepts an unchanged tree", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run" } }) });
    const plan = detectVerificationCommands(root, 900);
    expect(() => assertPlanUnchanged(root, plan, planDigest(plan))).not.toThrow();
  });

  it("halts when the run weakens the script its own gate calls", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run" } }) });
    const plan = detectVerificationCommands(root, 900);
    const digest = planDigest(plan);
    write(root, { "package.json": pkg({ scripts: { test: "exit 0" } }) });
    expect(() => assertPlanUnchanged(root, plan, digest)).toThrow(VerificationDriftError);
  });

  it("halts when a pretest hook appears mid-run", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run" } }) });
    const plan = detectVerificationCommands(root, 900);
    const digest = planDigest(plan);
    write(root, { "package.json": pkg({ scripts: { test: "vitest run", pretest: "rm -rf tests" } }) });
    expect(() => assertPlanUnchanged(root, plan, digest)).toThrow(/changed during the run/);
  });

  it("halts when re-derivation itself becomes impossible", () => {
    const root = plainDir({ "package.json": pkg({ scripts: { test: "vitest run" } }) });
    const plan = detectVerificationCommands(root, 900);
    const digest = planDigest(plan);
    write(root, { "package.json": "{ broken" });
    expect(() => assertPlanUnchanged(root, plan, digest)).toThrow(/could not be re-derived/);
  });
});

describe("the trusted runner", () => {
  it("captures exit codes and output", async () => {
    const root = repo();
    const ok = await runCommand(["node", "-e", "console.log('hello'); process.exit(0)"], { cwd: root, timeoutMs: 20_000 });
    expect(ok.status).toBe("PASS");
    expect(ok.output).toContain("hello");

    const bad = await runCommand(["node", "-e", "console.error('boom'); process.exit(3)"], { cwd: root, timeoutMs: 20_000 });
    expect(bad.status).toBe("FAIL");
    expect(bad.exitCode).toBe(3);
    expect(bad.output).toContain("boom");
  });

  it("reports a missing tool as unavailable, not as a failing test", async () => {
    const outcome = await runCommand(["definitely-not-a-real-binary-xyz"], { cwd: repo(), timeoutMs: 20_000 });
    expect(outcome.status).toBe("UNAVAILABLE");
  });

  it("does not interpret shell metacharacters", async () => {
    const root = repo();
    // If this were passed to a shell, the redirect would create a file.
    const outcome = await runCommand(["node", "-e", "console.log(process.argv[1])", "> pwned.txt"], { cwd: root, timeoutMs: 20_000 });
    expect(outcome.output).toContain("> pwned.txt");
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(root, "pwned.txt"))).toBe(false);
  });

  it("times out a runaway command and reports it as TIMEOUT", async () => {
    const outcome = await runCommand(["node", "-e", "setInterval(() => {}, 1000)"], { cwd: repo(), timeoutMs: 1_000 });
    expect(outcome.status).toBe("TIMEOUT");
    expect(outcome.timedOut).toBe(true);
    expect(outcome.output).toContain("timed out");
  });

  it("redacts credentials before they reach an artifact", async () => {
    const token = "ghp_" + "B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9";
    const outcome = await runCommand(["node", "-e", `console.log("token=${token}")`], { cwd: repo(), timeoutMs: 20_000 });
    expect(outcome.output).not.toContain(token);
    expect(outcome.output).toContain("REDACTED");
  });

  it("classifies a signalled death as SIGNALED on any platform", () => {
    expect(classifyExit(137, "SIGKILL")).toBe("SIGNALED");
    expect(classifyExit(1, null)).toBe("FAIL");
    expect(classifyExit(-1, null)).toBe("NOT_CONFIGURED");
  });
});

describe("tree binding", () => {
  it("flags a command that changes the tree it is measuring", async () => {
    const root = repo({ "README.md": "seed\n", "package.json": pkg({ scripts: { test: "x" } }) });
    const ctx = { cwd: root, env: {} };
    const base = headSha(ctx)!;
    const spec = candidatePathspec(ctx);

    const clean = await runVerified(["node", "-e", "process.exit(0)"], { cwd: root, timeoutMs: 20_000, ctx, baseHead: base, pathspec: spec });
    expect(clean.integrityFailure).toBeNull();
    expect(clean.status).toBe("PASS");

    const dirty = await runVerified(["node", "-e", "require('fs').writeFileSync('side-effect.txt','x')"], {
      cwd: root, timeoutMs: 20_000, ctx, baseHead: base, pathspec: spec,
    });
    expect(dirty.integrityFailure).toBe("UNSTABLE");
    expect(dirty.status).toBe("UNSTABLE");
    expect(dirty.before.tree).not.toBe(dirty.after.tree);
  });

  it("returns an empty binding outside a repository", () => {
    const binding = bindTree({ cwd: plainDir({ "a.txt": "x" }), env: {} }, "HEAD", ["."]);
    expect(binding.tree).toBeNull();
  });
});

describe("baseline", () => {
  it("records per-check status and detects self-dirtying checks", async () => {
    const root = repo({ "README.md": "seed\n", "package.json": pkg({ scripts: { test: "node -e \"process.exit(1)\"" } }) });
    const plan = detectVerificationCommands(root, 900);
    const artifacts = join(root, ".pipeline", "artifacts");
    const result = await runBaseline({ plan, ctx: { cwd: root, env: {} }, cwd: root, timeoutMs: 30_000, artifactsDir: artifacts });
    expect(result.statuses.test).toBe("FAIL");
    expect(result.statuses.build).toBe("NOT_CONFIGURED");
    expect(result.selfDirtying).toEqual([]);

    const dirty = repo({ "README.md": "seed\n", "package.json": pkg({ scripts: { test: "node -e \"require('fs').writeFileSync('coverage.txt','x')\"" } }) });
    const dirtyPlan = detectVerificationCommands(dirty, 900);
    const dirtyResult = await runBaseline({
      plan: dirtyPlan, ctx: { cwd: dirty, env: {} }, cwd: dirty, timeoutMs: 30_000,
      artifactsDir: join(dirty, ".pipeline", "artifacts"),
    });
    expect(dirtyResult.selfDirtying.join(" ")).toContain("coverage.txt");
  });

  it("tags only a plain failure as pre-existing, and pre-existing does not gate", () => {
    expect(applyBaselineTag("FAIL", "FAIL")).toBe("FAIL_PREEXISTING");
    expect(applyBaselineTag("FAIL", "PASS")).toBe("FAIL");
    expect(applyBaselineTag("TIMEOUT", "TIMEOUT")).toBe("TIMEOUT");
    expect(gatesRelease("FAIL_PREEXISTING")).toBe(false);
    expect(gatesRelease("NOT_CONFIGURED")).toBe(false);
    expect(gatesRelease("PASS")).toBe(false);
    expect(gatesRelease("FAIL")).toBe(true);
    expect(gatesRelease("UNSTABLE")).toBe(true);
  });
});

describe("display", () => {
  it("quotes only what needs quoting", () => {
    expect(commandDisplay(["npm", "test"])).toBe("npm test");
    expect(commandDisplay(["go", "test", "./..."])).toBe("go test ./...");
    expect(commandDisplay(["sh", "-c", "a b"])).toBe('sh -c "a b"');
  });
});
