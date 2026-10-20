import assert from "node:assert/strict";
import { tripConditionsTime } from "../static/js/trip-condition-time.js";

const trip = { date: "2026-10-05", launchTime: "06:30" };
assert.equal(tripConditionsTime(trip), new Date(2026, 9, 5, 6, 30).toISOString());
assert.equal(tripConditionsTime(trip, { time: "07:15" }), new Date(2026, 9, 5, 7, 15).toISOString());
assert.equal(
  tripConditionsTime({ date: "2026-10-05", launchTime: "22:00" }, { time: "00:30" }),
  new Date(2026, 9, 6, 0, 30).toISOString(),
  "a catch time before launch is treated as after midnight",
);
assert.equal(tripConditionsTime(trip, { timeUnknown: true, time: "" }), new Date(2026, 9, 5, 6, 30).toISOString());
assert.equal(tripConditionsTime({ date: "2026-10-05" }), new Date(2026, 9, 5, 12, 0).toISOString());
assert.throws(() => tripConditionsTime({}), /valid trip date/);
