const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/dashboard.js", "utf8"), context);

const laterTrip = { id: "later", date: "2026-09-13", launchTime: "14:30" };
const earlierTrip = { id: "earlier", date: "2026-09-13", launchTime: "06:15" };

assert.deepEqual(
  [earlierTrip, laterTrip].sort((a, b) => context.compareTripsByDateTime(a, b, "desc")).map((trip) => trip.id),
  ["later", "earlier"]
);

assert.deepEqual(
  [laterTrip, earlierTrip].sort((a, b) => context.compareTripsByDateTime(a, b, "asc")).map((trip) => trip.id),
  ["earlier", "later"]
);

assert.deepEqual(
  [
    { id: "legacy", date: "2026-09-13", startTime: "05:00", launchTime: "23:00" },
    laterTrip
  ].sort((a, b) => context.compareTripsByDateTime(a, b, "desc")).map((trip) => trip.id),
  ["later", "legacy"]
);

console.log("trip sorting tests passed");
