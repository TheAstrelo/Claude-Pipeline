import { describe, expect, it, afterEach } from "vitest";
import { existsSync, readFileSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, write, cleanup, sh } from "./helpers.js";
import {
  candidateChangedFiles, candidateDiff, candidatePathspec, candidateTreeOid,
  commitReviewedTree, createRunWorktree, git, gitOut, headSha, isClean,
  removeRunWorktree, treeOfCommit,
} from "../src/git.js";

const roots: string[] = [];
function repo(files?: Record<string, string>): string {
  const root = makeRepo(files);
  roots.push(root);
  return root;
}
afterEach(() => { cleanup(...roots.splice(0)); });

describe("candidate tree", () => {
  it("includes untracked files and deletions without touching the real index", () => {
    const root = repo({ "README.md": "seed\n", "src/a.ts": "export const a = 1;\n" });
    const ctx = { cwd: root, env: {} };
    const base = headSha(ctx)!;
    const spec = candidatePathspec(ctx);

    write(root, { "src/b.ts": "export const b = 2;\n" });
    sh(root, "rm", ["src/a.ts"]);

    const files = candidateChangedFiles(ctx, base, spec).sort();
    expect(files).toEqual(["src/a.ts", "src/b.ts"]);

    // The real index is untouched: nothing is staged.
    expect(gitOut(ctx, ["diff", "--cached", "--name-only"])).toBe("");

    const tree = candidateTreeOid(ctx, base, spec);
    expect(tree).toMatch(/^[0-9a-f]{40}$/);
    expect(tree).not.toBe(treeOfCommit(ctx, base));

    const diff = candidateDiff(ctx, base, spec);
    expect(diff).toContain("src/b.ts");
    expect(diff).toContain("export const b = 2;");
  });

  it("is stable: the same working tree yields the same OID", () => {
    const root = repo();
    const ctx = { cwd: root, env: {} };
    const base = headSha(ctx)!;
    const spec = candidatePathspec(ctx);
    write(root, { "new.txt": "hello\n" });
    expect(candidateTreeOid(ctx, base, spec)).toBe(candidateTreeOid(ctx, base, spec));
  });
});

describe("run worktree", () => {
  it("leaves the origin checkout untouched and links ignored build state", () => {
    const root = repo({ "README.md": "seed\n", ".gitignore": "node_modules/\n" });
    mkdirSync(join(root, "node_modules", "left-pad"), { recursive: true });
    writeFileSync(join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
    const ctx = { cwd: root, env: {} };
    const base = headSha(ctx)!;
    const stateDir = join(root, ".pipeline");
    const beforeBranch = gitOut(ctx, ["symbolic-ref", "--short", "HEAD"]);

    const wt = createRunWorktree({ originRoot: root, stateDir, runId: "run1", baseHead: base });
    try {
      expect(existsSync(join(wt.path, "README.md"))).toBe(true);
      expect(existsSync(join(wt.path, "node_modules", "left-pad", "index.js"))).toBe(true);

      // The engine's own symlink must not appear as a candidate change.
      const spec = candidatePathspec(wt.ctx);
      const changed = candidateChangedFiles(wt.ctx, base, spec);
      expect(changed).not.toContain("node_modules");
      expect(git(wt.ctx, ["status", "--porcelain"]).stdout).not.toContain("node_modules");

      // Origin checkout: same branch, still clean, exclude file untouched.
      expect(gitOut(ctx, ["symbolic-ref", "--short", "HEAD"])).toBe(beforeBranch);
      expect(isClean(ctx)).toBe(true);
      expect(existsSync(join(root, ".git", "info", "exclude"))
        ? readFileSync(join(root, ".git", "info", "exclude"), "utf8")
        : "").not.toContain("node_modules");
    } finally {
      removeRunWorktree(root, wt.path);
    }
  });
});

describe("commit path", () => {
  function setup() {
    const root = repo({ "README.md": "seed\n" });
    const ctx = { cwd: root, env: {} };
    const base = headSha(ctx)!;
    const baseTree = treeOfCommit(ctx, base)!;
    const wt = createRunWorktree({ originRoot: root, stateDir: join(root, ".pipeline"), runId: "run1", baseHead: base });
    return { root, ctx, base, baseTree, wt };
  }

  it("commits the exact reviewed tree onto the immutable baseline", () => {
    const { root, base, baseTree, wt } = setup();
    write(wt.path, { "src/feature.ts": "export const feature = true;\n" });
    const spec = candidatePathspec(wt.ctx);
    const reviewedTree = candidateTreeOid(wt.ctx, base, spec)!;

    const outcome = commitReviewedTree({
      worktree: wt, reviewedTree, reviewedDiffSha: "sha256:test", baseTree,
      task: "add a feature", runId: "run1",
    });
    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.tree).toBe(reviewedTree);
    expect(outcome.parent).toBe(base);
    expect(gitOut(wt.ctx, ["rev-parse", `refs/heads/${wt.branch}`])).toBe(outcome.commit);
    // The committed tree really contains the change.
    expect(git(wt.ctx, ["show", `${outcome.commit}:src/feature.ts`]).stdout).toContain("feature = true");
    removeRunWorktree(root, wt.path);
  });

  it("refuses when the tree moved after review", () => {
    const { root, base, baseTree, wt } = setup();
    write(wt.path, { "src/feature.ts": "reviewed\n" });
    const spec = candidatePathspec(wt.ctx);
    const reviewedTree = candidateTreeOid(wt.ctx, base, spec)!;
    // Someone edits after the review: the reviewed OID no longer matches.
    write(wt.path, { "src/feature.ts": "tampered\n" });
    const nowTree = candidateTreeOid(wt.ctx, base, spec)!;
    expect(nowTree).not.toBe(reviewedTree);
    // The caller is responsible for that comparison; committing the stale tree
    // still must not publish the tampered bytes.
    const outcome = commitReviewedTree({
      worktree: wt, reviewedTree, reviewedDiffSha: "sha256:test", baseTree,
      task: "t", runId: "run1",
    });
    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(git(wt.ctx, ["show", `${outcome.commit}:src/feature.ts`]).stdout).toContain("reviewed");
    removeRunWorktree(root, wt.path);
  });

  it("refuses to publish when the branch ref moved (compare-and-swap)", () => {
    const { root, base, baseTree, wt } = setup();
    write(wt.path, { "a.txt": "x\n" });
    const reviewedTree = candidateTreeOid(wt.ctx, base, candidatePathspec(wt.ctx))!;
    // A competing writer advances the run branch first.
    const competing = git(wt.ctx, ["-c", "commit.gpgSign=false", "commit-tree", baseTree, "-p", base, "-m", "competing"]).stdout.trim();
    git(wt.ctx, ["update-ref", `refs/heads/${wt.branch}`, competing]);

    const outcome = commitReviewedTree({
      worktree: wt, reviewedTree, reviewedDiffSha: "sha256:test", baseTree,
      task: "t", runId: "run1",
    });
    expect(outcome.kind).toBe("refused");
    expect(gitOut(wt.ctx, ["rev-parse", `refs/heads/${wt.branch}`])).toBe(competing);
    removeRunWorktree(root, wt.path);
  });

  it("reports a no-op when the reviewed tree equals the baseline", () => {
    const { root, baseTree, wt, base } = setup();
    const outcome = commitReviewedTree({
      worktree: wt, reviewedTree: baseTree, reviewedDiffSha: "sha256:empty", baseTree,
      task: "t", runId: "run1",
    });
    expect(outcome.kind).toBe("noop");
    expect(gitOut(wt.ctx, ["rev-parse", `refs/heads/${wt.branch}`])).toBe(base);
    removeRunWorktree(root, wt.path);
  });
});
