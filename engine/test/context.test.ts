import { describe, expect, it } from "vitest";
import { describeTestLayout } from "../src/context.js";

describe("test placement convention", () => {
  it("recognizes tests colocated with their source", () => {
    const files = ["src/routes/items.js", "src/routes/items.test.js", "src/routes/health.js", "src/routes/health.test.js", "src/index.js"];
    const described = describeTestLayout(files);
    expect(described).toMatch(/beside the file they cover/);
    expect(described).toContain("src/routes/items.test.js");
    // The point of saying it: a test for scripts/release.js goes beside it.
    expect(described).toMatch(/mirror that relationship/);
    // The convention must not become a reason to move code.
    expect(described).toMatch(/Never move or duplicate code/);
  });

  it("recognizes a separate mirrored test tree", () => {
    const files = ["src/a.ts", "src/b.ts", "tests/a.test.ts", "tests/b.test.ts"];
    expect(describeTestLayout(files)).toMatch(/separate tree/);
  });

  it("says nothing when the project has no clear convention", () => {
    expect(describeTestLayout(["src/a.ts", "README.md"])).toBeNull();
    expect(describeTestLayout([])).toBeNull();
  });

  it("recognizes go and python conventions", () => {
    expect(describeTestLayout(["pkg/x.go", "pkg/x_test.go", "pkg/y.go", "pkg/y_test.go"])).toMatch(/beside/);
    expect(describeTestLayout(["app/m.py", "app/test_m.py", "app/n.py", "app/test_n.py"])).toMatch(/beside/);
  });
});
