/**
 * Codex adapter: `codex exec` as a subprocess.
 *
 * Codex has no per-tool allowlist, so isolation rests on its sandbox: review
 * phases run read-only, build phases workspace-write. Production calls refuse
 * a repository-supplied config, because a repo that can configure the executor
 * can undo every restriction the orchestrator set.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Adapter, Capabilities, Effort, ExecuteRequest, ExecuteResult, ExitClass, Lane, PreflightReport,
} from "./types.js";
import { clampEffort } from "./types.js";
import { redact } from "../redact.js";

export const CODEX_DEFAULT_MODELS: Record<Lane, string> = {
  strong: "gpt-5.6-sol",
  balanced: "gpt-5.6-terra",
  review: "gpt-5.6-sol",
};

export class CodexAdapter implements Adapter {
  readonly id = "codex";
  readonly effortCeiling: Effort = "xhigh";
  models: Record<Lane, string>;
  readonly capabilities: Capabilities = {
    contextIsolation: true,
    // No general per-tool allowlist; the sandbox is the boundary.
    toolScoping: false,
    costReporting: false,
    structuredOutput: true,
    commandGuards: false,
  };

  constructor(options: { models?: Partial<Record<Lane, string>> } = {}) {
    this.models = { ...CODEX_DEFAULT_MODELS, ...options.models };
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const started = Date.now();
    const scratch = mkdtempSync(join(tmpdir(), "pipeline-codex-"));
    const lastMessage = join(scratch, "last-message.txt");
    const schemaFile = join(scratch, "schema.json");

    const args = [
      "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
      "--model", request.model,
      "--sandbox", request.sandbox === "read-only" ? "read-only" : "workspace-write",
      "--cd", request.cwd,
      "--output-last-message", lastMessage,
      "--config", `model_reasoning_effort=${clampEffort(request.effort, this.effortCeiling)}`,
    ];
    if (request.schema) {
      writeFileSync(schemaFile, JSON.stringify(request.schema));
      args.push("--output-schema", schemaFile);
    }

    try {
      const run = await spawnCollect("codex", args, request.prompt, request.cwd, request.timeoutMs);
      const report = existsSync(lastMessage) ? redact(readFileSync(lastMessage, "utf8")) : "";
      const usage = parseUsage(run.stdout);
      let structured: unknown = null;
      if (request.schema && report.trim()) {
        try { structured = JSON.parse(report); } catch { structured = null; }
      }
      const exit: ExitClass = run.timedOut ? "timeout"
        : run.code === 0 ? (report.trim() ? "ok" : "error")
        : classifyCodex(run.stdout + run.stderr);
      return {
        report, structured, usage, denials: [], durationMs: Date.now() - started, exit,
        ...(exit === "ok" ? {} : { errorMessage: redact((run.stderr || run.stdout).slice(-2000)) }),
      };
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  async preflight(): Promise<PreflightReport> {
    const probe = await spawnCollect("codex", ["exec", "--help"], "", process.cwd(), 60_000);
    if (probe.code !== 0) {
      return { ok: false, models: this.models, fallbacks: [], error: "codex CLI is not available" };
    }
    if (!/--ignore-user-config/.test(probe.stdout + probe.stderr)) {
      return {
        ok: false, models: this.models, fallbacks: [],
        error: "this codex CLI cannot isolate user config (--ignore-user-config missing); upgrade it or run with --no-commit",
      };
    }
    return { ok: true, models: this.models, fallbacks: [] };
  }
}

interface Collected { code: number; stdout: string; stderr: string; timedOut: boolean }

function spawnCollect(command: string, args: string[], input: string, cwd: string, timeoutMs: number): Promise<Collected> {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: false, detached: true });
    const out: Buffer[] = []; const err: Buffer[] = [];
    let timedOut = false; let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ }
    }, timeoutMs);
    child.stdout?.on("data", (b: Buffer) => out.push(b));
    child.stderr?.on("data", (b: Buffer) => err.push(b));
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ }
      resolve({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), timedOut });
    };
    child.on("error", error => { err.push(Buffer.from(String((error as Error).message))); finish(127); });
    child.on("close", code => finish(code ?? 1));
    if (input) child.stdin?.end(input); else child.stdin?.end();
  });
}

/** Codex reports token usage as JSONL events; cost is not reported. */
function parseUsage(stdout: string) {
  let inputTokens = 0, outputTokens = 0, cachedTokens = 0;
  for (const line of stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const event = JSON.parse(line) as { usage?: Record<string, unknown> };
      const usage = event.usage;
      if (!usage) continue;
      inputTokens += num(usage["input_tokens"]);
      outputTokens += num(usage["output_tokens"]);
      cachedTokens += num(usage["cached_input_tokens"]);
    } catch { /* not an event line */ }
  }
  return { inputTokens, outputTokens, cachedTokens, costUsd: null };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function classifyCodex(text: string): ExitClass {
  if (/rate.?limit|overloaded|timeout|timed out|502|503|529/i.test(text)) return "transient";
  if (/model .*not found|unknown model|no access/i.test(text)) return "model-unavailable";
  return "error";
}
