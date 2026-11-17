const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReport } = require("./validation");

test("validates report reason and bounds evidence text", () => {
  const report = parseReport({ targetUid: "target", reason: "harassment", details: "x".repeat(600) }, "reporter");
  assert.equal(report.details.length, 500);
});
test("rejects self-reports and unsupported reasons", () => {
  assert.throws(() => parseReport({ targetUid: "reporter", reason: "spam" }, "reporter"));
  assert.throws(() => parseReport({ targetUid: "target", reason: "unknown" }, "reporter"));
});
test("rejects malformed report payloads", () => {
  assert.throws(() => parseReport(null, "reporter"));
  assert.throws(() => parseReport({ targetUid: "", reason: "spam" }, "reporter"));
});
