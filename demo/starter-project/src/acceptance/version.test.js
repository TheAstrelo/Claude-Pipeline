// RED BY DESIGN — this is the demo's acceptance test.
// Run the pipeline with the canonical demo task:
//   "add a GET /api/version endpoint that returns the version from package.json"
// The pipeline's Phase 9 gates on this suite's real exit code: red before the
// endpoint exists, green once the task is actually done.
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const app = require("../index");

function get(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    request.on("error", reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error("request timed out"));
    });
  });
}

test("GET /api/version returns the package version", async () => {
  const server = app.listen(0);
  try {
    const response = await get(server.address().port, "/api/version");
    assert.strictEqual(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.strictEqual(payload.version, require("../../package.json").version);
  } finally {
    server.close();
  }
});
