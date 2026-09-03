/**
 * Git: worktree isolation, the candidate tree, and the commit path.
 *
 * Two invariants live here and nowhere else:
 *
 * 1. The user's checkout is never touched. Every run happens in an
 *    engine-owned worktree created from an immutable baseline commit; results
 *    land only as the run branch.
 * 2. A commit is created from the exact tree that was reviewed, with the
 *    immutable baseline as its parent, published by compare-and-swap. If the
 *    tree moved after review, or the ref moved under us, nothing is published.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface GitContext {
  /** Directory git commands run in. */
  cwd: string;
  /** Extra environment, e.g. the per-run core.excludesFile binding. */
  env: NodeJS.ProcessEnv;
}

export function git(ctx: GitContext, args: string[], opts: { input?: string; maxBuffer?: number } = {}): GitResult {
  const r = spawnSync("git", args, {
    cwd: ctx.cwd,
    env: { ...process.env, ...ctx.env },
    encoding: "utf8",
    input: opts.input,
    maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Run git and return trimmed stdout, or null when the command failed. */
export function gitOut(ctx: GitContext, args: string[]): string | null {
  const r = git(ctx, args);
  return r.status === 0 ? r.stdout.trim() : null;
}

export function isGitRepo(ctx: GitContext): boolean {
  return gitOut(ctx, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

export function headSha(ctx: GitContext): string | null {
  return gitOut(ctx, ["rev-parse", "HEAD"]);
}

export function treeOfCommit(ctx: GitContext, commit: string): string | null {
  return gitOut(ctx, ["rev-parse", `${commit}^{tree}`]);
}

export function isClean(ctx: GitContext): boolean {
  const r = git(ctx, ["status", "--porcelain"]);
  return r.status === 0 && r.stdout.trim() === "";
}

/**
 * Pathspec for the candidate set: everything, minus the artifacts directory
 * when it is not already ignored. Excluding an already-ignored path makes
 * `git add -A` fail, so the exclusion is conditional.
 */
export function candidatePathspec(ctx: GitContext): string[] {
  const ignored = git(ctx, ["check-ignore", "-q", ".claude/artifacts"]).status === 0;
  return ignored ? ["."] : [".", ":(exclude).claude/artifacts"];
}

/**
 * Build the candidate index in a temp index file: the baseline tree with every
 * working-tree change staged on top, including untracked files. The user's
 * real index is never involved.
 */
function withCandidateIndex<T>(ctx: GitContext, baseHead: string, pathspec: string[], fn: (indexFile: string) => T): T | null {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-index-"));
  const indexFile = join(dir, "index");
  try {
    const env = { ...ctx.env, GIT_INDEX_FILE: indexFile };
    const inner: GitContext = { cwd: ctx.cwd, env };
    if (git(inner, ["read-tree", baseHead]).status !== 0) return null;
    if (git(inner, ["add", "-A", "--", ...pathspec]).status !== 0) return null;
    return fn(indexFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** OID of the tree the run would commit right now, or null outside a repo. */
export function candidateTreeOid(ctx: GitContext, baseHead: string, pathspec: string[]): string | null {
  if (!isGitRepo(ctx)) return null;
  return withCandidateIndex(ctx, baseHead, pathspec, indexFile => {
    const inner: GitContext = { cwd: ctx.cwd, env: { ...ctx.env, GIT_INDEX_FILE: indexFile } };
    return gitOut(inner, ["write-tree"]);
  });
}

/** Repo-relative paths that differ from the baseline, including untracked. */
export function candidateChangedFiles(ctx: GitContext, baseHead: string, pathspec: string[]): string[] {
  if (!isGitRepo(ctx)) return [];
  const out = withCandidateIndex(ctx, baseHead, pathspec, indexFile => {
    const inner: GitContext = { cwd: ctx.cwd, env: { ...ctx.env, GIT_INDEX_FILE: indexFile } };
    return git(inner, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACDMRTUXB", baseHead, "--"]).stdout;
  });
  return (out ?? "").split("\0").filter(Boolean);
}

/** The unified diff the reviewer sees: baseline tree → candidate tree. */
export function candidateDiff(ctx: GitContext, baseHead: string, pathspec: string[]): string {
  if (!isGitRepo(ctx)) return "";
  const out = withCandidateIndex(ctx, baseHead, pathspec, indexFile => {
    const inner: GitContext = { cwd: ctx.cwd, env: { ...ctx.env, GIT_INDEX_FILE: indexFile } };
    return git(inner, ["diff", "--cached", "--no-color", baseHead, "--"]).stdout;
  });
  return out ?? "";
}

export interface Worktree {
  path: string;
  branch: string;
  baseHead: string;
  /** Environment every git call in this worktree must carry. */
  env: NodeJS.ProcessEnv;
  ctx: GitContext;
}

/**
 * Gitignored build state shared into the worktree by symlink, so a run does
 * not reinstall dependencies. A `dir/` gitignore pattern does not match a
 * SYMLINK of the same name, so the links are additionally excluded through a
 * per-run excludes file — otherwise the engine's own link shows up as an
 * untracked candidate and trips the escaping-symlink scanner.
 */
export const DEFAULT_LINK_PATHS = ["node_modules", ".venv", "venv", "vendor"];

/**
 * Create the run state directory and make it invisible to Git.
 *
 * The state directory usually lives inside the repository, so without this
 * every run would show its own scratch space as an untracked candidate change
 * (and sweep it into the reviewed tree). A self-ignoring directory is the one
 * form that works whether or not the project already ignores the path.
 */
export function ensureIgnoredStateDir(stateDir: string): void {
  mkdirSync(stateDir, { recursive: true });
  const marker = join(stateDir, ".gitignore");
  if (!existsSync(marker)) writeFileSync(marker, "*\n");
}

export function createRunWorktree(options: {
  originRoot: string;
  stateDir: string;
  runId: string;
  baseHead: string;
  linkPaths?: string[];
}): Worktree {
  const { originRoot, stateDir, runId, baseHead } = options;
  const linkPaths = options.linkPaths ?? DEFAULT_LINK_PATHS;
  const worktreePath = join(stateDir, "worktrees", runId);
  const branch = `pipeline/${runId}`;
  const origin: GitContext = { cwd: originRoot, env: {} };

  ensureIgnoredStateDir(stateDir);
  mkdirSync(dirname(worktreePath), { recursive: true });
  const created = git(origin, ["worktree", "add", "-b", branch, worktreePath, baseHead]);
  if (created.status !== 0) {
    throw new Error(
      `could not create the run worktree at ${worktreePath}: ${created.stderr.trim()}\n` +
      `Check 'git worktree list' for stale entries ('git worktree prune' clears them).`,
    );
  }

  const linked: string[] = [];
  for (const link of linkPaths) {
    const source = join(originRoot, link);
    const target = join(worktreePath, link);
    if (!existsSync(source) || existsSync(target)) continue;
    if (git(origin, ["check-ignore", "-q", link]).status !== 0) continue;
    try {
      symlinkSync(source, target);
      linked.push(link);
    } catch {
      // A link we cannot create is not fatal; the run just reinstalls.
    }
  }

  const env = excludeEnvFor(stateDir, runId, linked);
  return { path: worktreePath, branch, baseHead, env, ctx: { cwd: worktreePath, env } };
}

/**
 * Per-run excludes file for the symlinks above. `info/exclude` is shared by
 * every worktree of a repository, so it must not be used for run-scoped state.
 */
export function excludeEnvFor(stateDir: string, runId: string, linked: string[]): NodeJS.ProcessEnv {
  const excludeFile = join(stateDir, "worktrees", `${basename(runId)}.exclude`);
  if (linked.length === 0) {
    try { unlinkSync(excludeFile); } catch { /* nothing to clear */ }
    return {};
  }
  mkdirSync(dirname(excludeFile), { recursive: true });
  writeFileSync(excludeFile, linked.map(l => `/${l}`).join("\n") + "\n");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.excludesFile",
    GIT_CONFIG_VALUE_0: excludeFile,
  };
}

export function removeRunWorktree(originRoot: string, worktreePath: string): void {
  const origin: GitContext = { cwd: originRoot, env: {} };
  git(origin, ["worktree", "remove", "--force", worktreePath]);
  git(origin, ["worktree", "prune"]);
}

export type CommitOutcome =
  | { kind: "committed"; commit: string; tree: string; parent: string; branch: string }
  | { kind: "noop"; commit: string }
  | { kind: "refused"; reason: string };

/**
 * Create a commit from the exact reviewed tree and publish it by
 * compare-and-swap. Every step is verified before the next one runs: a
 * mismatch refuses rather than publishing something that was not reviewed.
 */
export function commitReviewedTree(options: {
  worktree: Worktree;
  reviewedTree: string;
  reviewedDiffSha: string;
  baseTree: string;
  task: string;
  runId: string;
}): CommitOutcome {
  const { worktree, reviewedTree, baseTree } = options;
  const baseHeadRef = worktree.baseHead;
  const ctx = worktree.ctx;
  const branchRef = `refs/heads/${worktree.branch}`;

  const symbolicHead = gitOut(ctx, ["symbolic-ref", "-q", "HEAD"]);
  const currentRef = gitOut(ctx, ["rev-parse", branchRef]);
  if (symbolicHead !== branchRef || currentRef !== baseHeadRef) {
    return { kind: "refused", reason: "the run branch moved before the atomic commit" };
  }

  if (reviewedTree === baseTree) {
    return { kind: "noop", commit: baseHeadRef };
  }

  const created = git(ctx, [
    "-c", "commit.gpgSign=false", "commit-tree", reviewedTree,
    "-p", baseHeadRef,
    "-m", `pipeline: ${options.task}`,
    "-m", `Auto-committed exact reviewed tree (run ${options.runId})`,
    "-m", `Reviewed-Diff-SHA256: ${options.reviewedDiffSha}`,
  ]);
  const newCommit = created.stdout.trim();
  if (created.status !== 0 || !newCommit) {
    return { kind: "refused", reason: "could not create the reviewed commit object" };
  }

  const commitTree = gitOut(ctx, ["rev-parse", `${newCommit}^{tree}`]);
  const commitParent = gitOut(ctx, ["rev-parse", `${newCommit}^`]);
  if (commitTree !== reviewedTree || commitParent !== baseHeadRef) {
    return { kind: "refused", reason: "the created commit failed tree/parent verification" };
  }

  // Compare-and-swap: the update only lands if the ref is still at the
  // baseline, so a competing writer is preserved rather than overwritten.
  const updated = git(ctx, ["update-ref", "--no-deref", "-m", `pipeline run ${options.runId}`, branchRef, newCommit, baseHeadRef]);
  if (updated.status !== 0) {
    return { kind: "refused", reason: "atomic branch update failed; a competing ref change was preserved" };
  }
  if (gitOut(ctx, ["rev-parse", branchRef]) !== newCommit) {
    return { kind: "refused", reason: "branch publication could not be verified" };
  }

  // Normalize the worktree index to the published tree, but only while this
  // checkout still points at the run branch.
  if (gitOut(ctx, ["symbolic-ref", "-q", "HEAD"]) === branchRef) {
    git(ctx, ["read-tree", reviewedTree]);
  }
  return { kind: "committed", commit: newCommit, tree: commitTree, parent: commitParent, branch: worktree.branch };
}

export function pushBranch(ctx: GitContext, remote: string, branch: string): GitResult {
  return git(ctx, ["push", "-u", remote, `${branch}:${branch}`]);
}

/** Recent history for the context pack. */
export function recentHistory(ctx: GitContext, count = 20): string {
  return git(ctx, ["log", `-${count}`, "--stat", "--no-color"]).stdout;
}

export function trackedFiles(ctx: GitContext, limit = 300): string[] {
  const out = gitOut(ctx, ["ls-files"]) ?? "";
  return out.split("\n").filter(Boolean).slice(0, limit);
}
