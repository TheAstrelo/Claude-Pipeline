/**
 * Append-only run log.
 *
 * One JSON object per line, in order, with a sequence number. No hash chain:
 * the ledger is an operator's record of what happened, not the thing that
 * makes the commit safe — that is the reviewed tree OID, checked at commit
 * time (see git.ts). Anything that gates reads evidence files, never this.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type LedgerEvent =
  | "run_started" | "run_finished"
  | "stage_started" | "stage_finished"
  | "model_call" | "model_retry" | "budget_extended" | "budget_exhausted"
  | "check_run" | "baseline_recorded"
  | "gate" | "blocker_demoted" | "blocker_refuted" | "waiver"
  | "recovery" | "checkpoint" | "commit" | "publish" | "note";

export interface LedgerRecord {
  seq: number;
  at: string;
  event: LedgerEvent;
  [key: string]: unknown;
}

export class Ledger {
  private seq = 0;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) this.seq = countLines(path);
  }

  append(event: LedgerEvent, fields: Record<string, unknown> = {}): LedgerRecord {
    const record: LedgerRecord = { seq: ++this.seq, at: new Date().toISOString(), event, ...fields };
    appendFileSync(this.path, JSON.stringify(record) + "\n");
    return record;
  }

  read(): LedgerRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as LedgerRecord);
  }

  /** Events of one kind, oldest first. */
  select(event: LedgerEvent): LedgerRecord[] {
    return this.read().filter(r => r.event === event);
  }
}

function countLines(path: string): number {
  const text = readFileSync(path, "utf8");
  if (!text) return 0;
  return text.split("\n").filter(l => l.trim().length > 0).length;
}
