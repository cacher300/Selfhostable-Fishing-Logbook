const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/photo-queue-autofill.js", "utf8"));

const groups = photoQueueCatchGroups([
  { filename: "later", captureDate: "2026-08-23", captureTime: "06:10", capturedAt: "2026-08-23T06:10:00" },
  { filename: "first", captureDate: "2026-08-23", captureTime: "06:00", capturedAt: "2026-08-23T06:00:00" },
  { filename: "same-catch", captureDate: "2026-08-23", captureTime: "06:03", capturedAt: "2026-08-23T06:03:00" },
  { filename: "different-day", captureDate: "2026-08-24", captureTime: "06:01", capturedAt: "2026-08-24T06:01:00" },
  { filename: "no-time", captureDate: "2026-08-23" }
], "2026-08-23");

assert.deepEqual(groups.map((group) => group.map((photo) => photo.filename)), [
  ["first", "same-catch"],
  ["later"]
]);

const exactCutoff = photoQueueCatchGroups([
  { filename: "a", captureDate: "2026-08-23", captureTime: "06:00", capturedAt: "2026-08-23T06:00:00" },
  { filename: "b", captureDate: "2026-08-23", captureTime: "06:03", capturedAt: "2026-08-23T06:03:00" }
], "2026-08-23");
assert.equal(exactCutoff.length, 1);

console.log("photo queue autofill grouping tests passed");
