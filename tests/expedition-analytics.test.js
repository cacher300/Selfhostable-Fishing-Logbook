const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/expedition-analytics.js", "utf8"));

assert.equal(ExpeditionAnalytics.inclusiveDays("2026-08-01", "2026-08-07"), 7);
assert.equal(ExpeditionAnalytics.inclusiveDays("2026-08-07", "2026-08-01"), 0);

const expeditions = [
  { id: "older", name: "Alpha Week", startDate: "2025-06-01", endDate: "2025-06-07" },
  { id: "newer", name: "Zebra Week", startDate: "2026-07-10", endDate: "2026-07-15" },
];
assert.deepEqual(ExpeditionAnalytics.sortedExpeditions(expeditions).map((item) => item.id), ["newer", "older"]);
assert.deepEqual(ExpeditionAnalytics.sortedExpeditions(expeditions, "name-asc").map((item) => item.id), ["older", "newer"]);

const trips = [
  {
    id: "trip-2",
    expeditionId: "newer",
    date: "2026-07-12",
    title: "Second",
    hours: 3,
    catches: [{ species: "Walleye", quantity: 2 }, { species: "Perch" }],
  },
  {
    id: "trip-1",
    expeditionId: "newer",
    date: "2026-07-11",
    title: "First",
    hours: 2,
    catches: [{ species: "Walleye" }],
  },
  { id: "other", expeditionId: "older", date: "2025-06-02", hours: 4, catches: [] },
];
const summary = ExpeditionAnalytics.summarize(expeditions[1], trips);
assert.equal(summary.tripCount, 2);
assert.equal(summary.days, 6);
assert.equal(summary.hours, 5);
assert.equal(summary.fish, 4);
assert.equal(summary.catchRate, 0.8);
assert.equal(summary.species, 2);
assert.deepEqual(summary.trips.map((trip) => trip.id), ["trip-1", "trip-2"]);

assert.equal(ExpeditionAnalytics.tripOutsideRange({ date: "2026-07-10" }, expeditions[1]), false);
assert.equal(ExpeditionAnalytics.tripOutsideRange({ date: "2026-07-16" }, expeditions[1]), true);
const unassigned = ExpeditionAnalytics.unassignTrips(trips, "newer");
assert.deepEqual(unassigned.slice(0, 2).map((trip) => trip.expeditionId), ["", ""]);
assert.equal(unassigned[2].expeditionId, "older");
console.log("expedition analytics tests passed");
