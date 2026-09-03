/**
 * In-process adapter for tests.
 *
 * The shell engine tested provider behavior by putting fake `claude` binaries
 * on PATH, which made every scenario a subprocess and every suite minutes
 * long. Here a scenario is a function: it sees the request, can write into the
 * worktree exactly where a real build would, and returns a scripted result.
 */

import type {
  Adapter, Capabilities, Effort, ExecuteRequest, ExecuteResult, Lane, PreflightReport,
} from "./types.js";

export interface FakeCall {
  label: string;
  model: string;
  effort: Effort;
  toolScope: string;
  prompt: string;
  budgetUsd: number | null;
  schema: Record<string, unknown> | null;
}

export type FakeHandler = (
  request: ExecuteRequest,
  call: { index: number; countForLabel: number },
) => Partial<ExecuteResult> | Promise<Partial<ExecuteResult>>;

export class FakeAdapter implements Adapter {
  readonly id = "fake";
  readonly effortCeiling: Effort = "max";
  readonly models: Record<Lane, string> = { strong: "fake-strong", balanced: "fake-balanced", review: "fake-review" };
  readonly capabilities: Capabilities = {
    contextIsolation: true, toolScoping: true, costReporting: true,
    structuredOutput: true, commandGuards: true,
  };
  readonly calls: FakeCall[] = [];
  private readonly counts = new Map<string, number>();

  constructor(private readonly handler: FakeHandler) {}

  countOf(label: string): number {
    return this.counts.get(label) ?? 0;
  }

  labels(): string[] {
    return this.calls.map(c => c.label);
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const countForLabel = (this.counts.get(request.label) ?? 0) + 1;
    this.counts.set(request.label, countForLabel);
    this.calls.push({
      label: request.label, model: request.model, effort: request.effort,
      toolScope: request.toolScope, prompt: request.prompt,
      budgetUsd: request.budgetUsd ?? null, schema: request.schema ?? null,
    });
    const partial = await this.handler(request, { index: this.calls.length - 1, countForLabel });
    return {
      report: "", structured: null, denials: [], durationMs: 1, exit: "ok",
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0, costUsd: 0.01 },
      ...partial,
    };
  }

  async preflight(): Promise<PreflightReport> {
    return { ok: true, models: this.models, fallbacks: [] };
  }
}
