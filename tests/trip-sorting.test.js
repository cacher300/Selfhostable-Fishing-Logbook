import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { compareTripsByDateTime } = await import("../static/js/dashboard.js");

const laterTrip = { id: "later", date: "2026-09-13", launchTime: "14:30" };
const earlierTrip = { id: "earlier", date: "2026-09-13", launchTime: "06:15" };

assert.deepEqual(
  [earlierTrip, laterTrip].sort((a, b) => compareTripsByDateTime(a, b, "desc")).map((trip) => trip.id),
  ["later", "earlier"],
);

assert.deepEqual(
  [laterTrip, earlierTrip].sort((a, b) => compareTripsByDateTime(a, b, "asc")).map((trip) => trip.id),
  ["earlier", "later"],
);

assert.deepEqual(
  [
    { id: "early-start", date: "2026-09-13", launchTime: "05:00" },
    laterTrip,
  ].sort((a, b) => compareTripsByDateTime(a, b, "desc")).map((trip) => trip.id),
  ["later", "early-start"],
);
