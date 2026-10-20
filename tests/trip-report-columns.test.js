import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const storedColumns = ["number", "time", "species"];
const reads = [];
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) {
      reads.push(key);
      return key === "fishing-logbook-v2-trip-report-columns-v6" ? JSON.stringify(storedColumns) : null;
    },
    setItem() {
      assert.fail("Reading report columns must not migrate or rewrite stored preferences.");
    },
  },
});

const { setup, reportColumnDefinitions, reportColumns, reportRelevantColumnDefinitions } = await import("../static/js/trip-report.js");
setup();

const actual = reportColumns();
assert.deepEqual(Array.from(actual), storedColumns);
assert.deepEqual(reads, ["fishing-logbook-v2-trip-report-columns-v6"]);
assert.equal(reportColumnDefinitions.some(([key]) => key === "method"), false, "Method is never offered as a timeline column");

const trip = { method: "Trolling", catches: [
  { species: "Lake trout", time: "2026-09-23T08:00:00Z", leadcoreColors: "", shaker: false, deepestRigger: false, photos: [] },
  { species: "Lake trout", time: "2026-09-23T09:00:00Z", leadcoreColors: "", shaker: false, deepestRigger: false, photos: [] },
] };
const relevantKeys = reportRelevantColumnDefinitions(trip, trip.catches);
assert.equal(relevantKeys.some(([key]) => key === "leadcoreColors"), false);
assert.equal(relevantKeys.some(([key]) => key === "shaker"), false);
assert.equal(relevantKeys.some(([key]) => key === "deepestRigger"), false);

trip.catches[1].leadcoreColors = "5";
trip.catches[1].shaker = "Yes";
const populatedKeys = reportRelevantColumnDefinitions(trip, trip.catches).map(([key]) => key);
assert.equal(populatedKeys.includes("leadcoreColors"), true);
assert.equal(populatedKeys.includes("shaker"), true);
