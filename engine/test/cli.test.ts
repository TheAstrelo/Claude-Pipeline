import { describe, expect, it } from "vitest";
import { makeRunId, parseArgs } from "../src/cli.js";

describe("argument parsing", () => {
  it("defaults to an uncapped max-quality standard run that commits", () => {
    const { config } = parseArgs(["add a feature"]);
    expect(config.task).toBe("add a feature");
    expect(config.quality).toBe("max");
    expect(config.profile).toBe("standard");
    expect(config.commit).toBe(true);
    expect(config.budget.runUsd).toBeNull();
    expect(config.budget.perCallUsd).toBeNull();
  });

  it("turns budgeting on only when a run cap is given", () => {
    const { config } = parseArgs(["--max-run-budget-usd=30", "a task"]);
    expect(config.budget.runUsd).toBe(30);
    expect(config.budget.perCallUsd).toBe(4);
  });

  it("rejects a typo instead of silently running at the default", () => {
    const { error } = parseArgs(["--quailty=cheap", "a task"]);
    expect(error).toMatch(/unknown option\(s\): --quailty/);
  });

  it("rejects an invalid enum value and a bad budget", () => {
    expect(parseArgs(["--profile=reckless", "a task"]).error).toMatch(/--profile must be one of/);
    expect(parseArgs(["--max-run-budget-usd=lots", "a task"]).error).toMatch(/non-negative numbers/);
  });

  it("requires a task", () => {
    expect(parseArgs(["--profile=fast"]).error).toMatch(/task description is required/);
  });

  it("treats --pr as --push plus pull-request guidance", () => {
    const { config } = parseArgs(["--pr", "a task"]);
    expect(config.push).toBe(true);
    expect(config.openPr).toBe(true);
  });

  it("builds a sortable, readable run id", () => {
    const id = makeRunId("add a GET /api/version endpoint", new Date("2026-09-03T22:24:50Z"));
    expect(id).toBe("20260903222450-add-a-get-api-version-endpoint");
  });
});
