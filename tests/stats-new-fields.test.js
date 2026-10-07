import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { saneStatsNumber, summarizeDownriggerCatchPositions, summarizeSpeedDelta, tripThermoclineDepth } = await import("../static/js/stats-performance.js");

assert.equal(saneStatsNumber("", { min: 0 }), null);
assert.equal(saneStatsNumber("33 mph", { min: 0.1, max: 15 }), null);
assert.equal(saneStatsNumber("2.4 mph", { min: 0.1, max: 15 }), 2.4);

const deltaRows = summarizeSpeedDelta([
  { gpsSpeed: "2.4", ballSpeed: "2.0", trip: { id: "a" } },
  { gpsSpeed: "2.2", ballSpeed: "2.3", trip: { id: "b" } },
  { gpsSpeed: "2.0", ballSpeed: "2.5", trip: { id: "c" } },
  { gpsSpeed: "2.0", ballSpeed: "33", trip: { id: "bad" } },
]);
assert.deepEqual(deltaRows.map((row) => row[0]), ["Ball slower", "Matched", "Ball faster"]);

const thermocline = tripThermoclineDepth({
  probeTemperatureProfile: [
    { depthFeet: 0, temperature: 68 },
    { depthFeet: 20, temperature: 66 },
    { depthFeet: 40, temperature: 54 },
    { depthFeet: 60, temperature: 52 },
  ],
});
assert.equal(thermocline, 30);

const riggerPositions = summarizeDownriggerCatchPositions([
  { presentation: "Downrigger", deepestRigger: true, trip: { id: "rigger" } },
  { presentation: "Cheater", deepestRigger: false, trip: { id: "cheater" } },
], [], 2);
assert.deepEqual(riggerPositions.map((item) => item.name), ["Deepest rigger"]);
assert.equal(riggerPositions[0].fish, 1);
