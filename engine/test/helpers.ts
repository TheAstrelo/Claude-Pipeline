import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8" });
}

/** A throwaway git repository with one commit. */
export function makeRepo(files: Record<string, string> = { "README.md": "seed\n" }): string {
  const root = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  sh(root, "git", ["init", "-q", "-b", "main"]);
  sh(root, "git", ["config", "user.email", "test@example.invalid"]);
  sh(root, "git", ["config", "user.name", "Pipeline Test"]);
  sh(root, "git", ["config", "commit.gpgSign", "false"]);
  write(root, files);
  sh(root, "git", ["add", "-A"]);
  sh(root, "git", ["commit", "-q", "-m", "seed"]);
  return root;
}

export function write(root: string, files: Record<string, string>): void {
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}

export function cleanup(...roots: string[]): void {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
