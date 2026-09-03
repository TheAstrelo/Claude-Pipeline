/**
 * Claude adapter: one phase per `query()` call on the Agent SDK.
 *
 * Isolation is the point. Every call runs with no user settings, no project
 * instruction files, no MCP config and no session persistence, so a phase sees
 * exactly the prompt and the worktree — never the operator's ambient
 * configuration or a repository's own instructions to the model.
 */

import { query, type Options, type SDKResultMessage, type PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { spawnSync } from "node:child_process";
import type {
  Adapter, Capabilities, DenyRule, Effort, ExecuteRequest, ExecuteResult, ExitClass,
  Lane, PreflightReport, ToolScope,
} from "./types.js";
import { clampEffort } from "./types.js";
import { redact } from "../redact.js";

export const CLAUDE_DEFAULT_MODELS: Record<Lane, string> = {
  strong: "claude-opus-5",
  balanced: "claude-sonnet-5",
  review: "claude-fable-5-1",
};

/**
 * Fallback order when a lane's model is not usable on this account (not
 * released to it, out of credits, a typo). Falling back loudly beats failing
 * the first real phase after startup.
 */
const FALLBACK: Record<string, string> = {
  "claude-fable-5-1": "claude-opus-5",
  "claude-opus-5": "claude-opus-4-8",
  "claude-opus-4-8": "claude-sonnet-5",
};

const READ_TOOLS = ["Read", "Grep", "Glob"];
const WEB_TOOLS = ["WebSearch", "WebFetch"];
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit", "Bash", "TodoWrite"];
const NEVER = ["Task", "KillShell", "BashOutput"];

/**
 * `allowedTools` pre-approves; it does not restrict. The hard restriction is
 * the CLI's own `--tools`, which is what keeps a read-only reviewer from
 * writing at all rather than merely being asked not to.
 */
function toolsFor(scope: ToolScope): { tools: string[]; allowed: string[]; disallowed: string[] } {
  switch (scope) {
    case "read":
      return { tools: READ_TOOLS, allowed: READ_TOOLS, disallowed: [...WRITE_TOOLS, ...WEB_TOOLS, ...NEVER] };
    case "read-web":
      return { tools: [...READ_TOOLS, ...WEB_TOOLS], allowed: [...READ_TOOLS, ...WEB_TOOLS], disallowed: [...WRITE_TOOLS, ...NEVER] };
    case "read-exec":
      return { tools: [...READ_TOOLS, "Bash"], allowed: READ_TOOLS, disallowed: ["Edit", "Write", "NotebookEdit", ...WEB_TOOLS, ...NEVER] };
    case "write-exec":
      return { tools: [...READ_TOOLS, ...WRITE_TOOLS], allowed: [...READ_TOOLS, ...WRITE_TOOLS], disallowed: [...WEB_TOOLS, ...NEVER] };
  }
}

function commandOf(input: unknown): string {
  if (input && typeof input === "object" && "command" in input) return String((input as { command: unknown }).command ?? "");
  return "";
}

function pathOf(input: unknown): string {
  if (input && typeof input === "object" && "file_path" in input) return String((input as { file_path: unknown }).file_path ?? "");
  return "";
}

function denyDecision(reason: string) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: reason } };
}

export interface ClaudeAdapterOptions {
  models?: Partial<Record<Lane, string>>;
  /** Set false to skip preflight probes (tests, offline runs). */
  preflightEnabled?: boolean;
}

export class ClaudeAdapter implements Adapter {
  readonly id = "claude";
  readonly effortCeiling: Effort = "max";
  models: Record<Lane, string>;
  readonly capabilities: Capabilities = {
    contextIsolation: true,
    toolScoping: true,
    costReporting: true,
    structuredOutput: true,
    commandGuards: true,
  };
  private readonly preflightEnabled: boolean;

  constructor(options: ClaudeAdapterOptions = {}) {
    this.models = { ...CLAUDE_DEFAULT_MODELS, ...options.models };
    this.preflightEnabled = options.preflightEnabled ?? true;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const started = Date.now();
    const scope = toolsFor(request.toolScope);
    const denials: string[] = [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    const options: Options = {
      model: request.model,
      effort: clampEffort(request.effort, this.effortCeiling),
      cwd: request.cwd,
      // No user settings, no project CLAUDE.md, no MCP: the prompt and the
      // worktree are the whole context.
      settingSources: [],
      strictMcpConfig: true,
      permissionMode: "dontAsk" as PermissionMode,
      allowedTools: [...scope.allowed, ...(request.allowRules ?? [])],
      disallowedTools: scope.disallowed,
      extraArgs: { tools: scope.tools.join(",") },
      abortController: controller,
      includePartialMessages: false,
      ...(request.addDirs?.length ? { additionalDirectories: request.addDirs } : {}),
      ...(request.budgetUsd != null ? { maxBudgetUsd: request.budgetUsd } : {}),
      ...(request.schema ? { outputFormat: { type: "json_schema" as const, schema: request.schema } } : {}),
      hooks: this.hooksFor(request, denials),
    };

    let result: SDKResultMessage | null = null;
    let thrown: Error | null = null;
    try {
      for await (const message of query({ prompt: request.prompt, options })) {
        if (message.type === "result") result = message;
      }
    } catch (error) {
      thrown = error as Error;
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - started;
    // The SDK yields the result message before it throws, so a budget stop or
    // a model error still carries real cost and a classifiable subtype.
    if (!result) {
      return {
        report: "", structured: null, denials, durationMs,
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: null },
        exit: classifyThrow(thrown, controller.signal.aborted),
        errorMessage: thrown ? redact(thrown.message) : "the provider returned no result",
      };
    }

    const usage = {
      inputTokens: numberOf(result.usage?.input_tokens),
      outputTokens: numberOf(result.usage?.output_tokens),
      cachedTokens: numberOf(result.usage?.cache_read_input_tokens),
      costUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : null,
    };
    const exit = classifyResult(result, thrown, controller.signal.aborted);
    const structured = result.subtype === "success" ? (result.structured_output ?? null) : null;
    const report = result.subtype === "success" ? redact(String(result.result ?? "")) : "";

    return {
      report, structured, usage, denials, durationMs, exit,
      ...(exit === "ok" ? {} : { errorMessage: redact(errorTextOf(result, thrown)) }),
    };
  }

  /**
   * Guards run before the tool does, so a forbidden command or a protected-file
   * edit never happens — rather than being discovered by a scanner afterwards.
   */
  private hooksFor(request: ExecuteRequest, denials: string[]): Options["hooks"] {
    const hooks: NonNullable<Options["hooks"]> = {};
    const deny = request.denyCommands ?? [];
    const protectedPaths = request.protectedPaths ?? [];

    const pre: Array<(input: unknown) => Promise<unknown>> = [];
    if (deny.length) {
      pre.push(async (input: unknown) => {
        const record = input as { tool_name?: string; tool_input?: unknown };
        if (record.tool_name !== "Bash") return {};
        const command = commandOf(record.tool_input);
        const rule = deny.find((r: DenyRule) => r.pattern.test(command));
        if (!rule) return {};
        denials.push(`Bash: ${command.slice(0, 120)}`);
        return denyDecision(rule.reason);
      });
    }
    if (protectedPaths.length) {
      pre.push(async (input: unknown) => {
        const record = input as { tool_name?: string; tool_input?: unknown };
        if (!["Edit", "Write", "NotebookEdit"].includes(record.tool_name ?? "")) return {};
        const target = pathOf(record.tool_input);
        if (!target || !protectedPaths.some(p => target === p || target.endsWith(`/${p}`))) return {};
        denials.push(`${record.tool_name}: ${target}`);
        return denyDecision("this file is protected for the duration of the run");
      });
    }
    if (pre.length) hooks.PreToolUse = [{ hooks: pre as never }];

    if (request.formatCommand?.length) {
      const format = request.formatCommand;
      hooks.PostToolUse = [{
        matcher: "Edit|Write",
        hooks: [async (input: unknown) => {
          const target = pathOf((input as { tool_input?: unknown }).tool_input);
          if (target) {
            spawnSync(format[0]!, [...format.slice(1), target], { cwd: request.cwd, timeout: 30_000, shell: false });
          }
          return {};
        }] as never,
      }];
    }
    return hooks;
  }

  /** One probe per distinct routed model, with a recorded fallback chain. */
  async preflight(): Promise<PreflightReport> {
    if (!this.preflightEnabled) return { ok: true, models: this.models, fallbacks: [] };
    const fallbacks: string[] = [];
    const usable = new Set<string>();
    const unusable = new Map<string, string>();

    for (const lane of ["balanced", "strong", "review"] as Lane[]) {
      let model = this.models[lane];
      for (;;) {
        if (usable.has(model)) break;
        const known = unusable.get(model);
        if (known === undefined) {
          const probe = await this.probe(model);
          if (probe === null) { usable.add(model); break; }
          unusable.set(model, probe);
          if (usable.size === 0 && unusable.size === 1 && isAuthFailure(probe)) {
            return { ok: false, models: this.models, fallbacks, error: probe };
          }
        }
        const next = FALLBACK[model];
        if (!next) {
          return { ok: false, models: this.models, fallbacks, error: `no usable model for the ${lane} lane (tried ${model}: ${unusable.get(model)})` };
        }
        fallbacks.push(`${lane}: ${model} → ${next} (${(unusable.get(model) ?? "").slice(0, 80)})`);
        this.models = { ...this.models, [lane]: next };
        model = next;
      }
    }
    return { ok: true, models: this.models, fallbacks };
  }

  /** Returns null when the model is usable, else the error text. */
  private async probe(model: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      let result: SDKResultMessage | null = null;
      for await (const message of query({
        prompt: "Reply with exactly: OK",
        options: {
          model, effort: "low", settingSources: [], strictMcpConfig: true,
          permissionMode: "dontAsk" as PermissionMode, allowedTools: ["Read"],
          extraArgs: { tools: "Read" }, maxTurns: 2, maxBudgetUsd: 0.25,
          abortController: controller,
        },
      })) {
        if (message.type === "result") result = message;
      }
      if (result && !result.is_error) return null;
      return errorTextOf(result, null);
    } catch (error) {
      return (error as Error).message;
    } finally {
      clearTimeout(timer);
    }
  }
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function errorTextOf(result: SDKResultMessage | null, thrown: Error | null): string {
  if (result && "result" in result && typeof result.result === "string" && result.result) return result.result;
  if (result?.subtype) return String(result.subtype);
  return thrown?.message ?? "unknown provider error";
}

function isAuthFailure(message: string): boolean {
  return /not logged in|authentication|unauthorized|invalid api key|no credentials|401/i.test(message);
}

function classifyResult(result: SDKResultMessage, thrown: Error | null, aborted: boolean): ExitClass {
  if (result.subtype === "success" && !result.is_error) return "ok";
  const text = errorTextOf(result, thrown);
  if (result.subtype === "error_max_budget_usd" || /maximum budget/i.test(text)) return "budget";
  if (aborted) return "timeout";
  return classifyMessage(text);
}

function classifyThrow(thrown: Error | null, aborted: boolean): ExitClass {
  if (aborted) return "timeout";
  if (!thrown) return "error";
  return classifyMessage(thrown.message);
}

function classifyMessage(text: string): ExitClass {
  if (/maximum budget/i.test(text)) return "budget";
  if (/out of usage credits|issue with the selected model|may not exist|do not have access|model_not_found/i.test(text)) return "model-unavailable";
  if (/overloaded|rate.?limit|timeout|timed out|ECONNRESET|ETIMEDOUT|socket hang up|502|503|529/i.test(text)) return "transient";
  return "error";
}
