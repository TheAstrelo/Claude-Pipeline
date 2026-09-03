import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests drive a whole run against an in-process fake adapter;
    // they are still far under a second each, but git work is not free.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["default"],
  },
});
