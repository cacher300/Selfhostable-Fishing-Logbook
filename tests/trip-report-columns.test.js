const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storedColumns = ["number", "time", "species"];
const reads = [];
const context = {
  localStorage: {
    getItem(key) {
      reads.push(key);
      return JSON.stringify(storedColumns);
    },
    setItem() {
      assert.fail("Reading report columns must not migrate or rewrite stored preferences.");
    },
  },
  isTrollingTripRecord() {
    return true;
  },
};
vm.createContext(context);
vm.runInContext(`let activeReportTimelineColumns = null; const storageKey = "fishing-logbook-v2";\n${fs.readFileSync("static/js/trip-report.js", "utf8")}\nthis.readReportColumns = reportColumns; this.relevantColumns = reportRelevantColumnDefinitions;`, context);

const actual = context.readReportColumns();
assert.deepEqual(Array.from(actual), storedColumns);
assert.deepEqual(reads, ["fishing-logbook-v2-trip-report-columns-v6"]);

const trip = { method: "Trolling", catches: [
  { species: "Lake trout", time: "2026-09-23T08:00:00Z", leadcoreColors: "", shaker: false, deepestRigger: false, photos: [] },
  { species: "Lake trout", time: "2026-09-23T09:00:00Z", leadcoreColors: "", shaker: false, deepestRigger: false, photos: [] },
] };
const relevantKeys = context.relevantColumns(trip, trip.catches);
assert.equal(relevantKeys.some(([key]) => key === "leadcoreColors"), false);
assert.equal(relevantKeys.some(([key]) => key === "shaker"), false);
assert.equal(relevantKeys.some(([key]) => key === "deepestRigger"), false);

trip.catches[1].leadcoreColors = "5";
trip.catches[1].shaker = "Yes";
const populatedKeys = context.relevantColumns(trip, trip.catches).map(([key]) => key);
assert.equal(populatedKeys.includes("leadcoreColors"), true);
assert.equal(populatedKeys.includes("shaker"), true);

console.log("trip report columns load only the current preference without conversion");
