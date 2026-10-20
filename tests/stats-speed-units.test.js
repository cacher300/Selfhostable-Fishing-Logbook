import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { summarizeBestSpeedByDirection, summarizeFishingSpeed, summarizeShakers, summarizeSpeedDelta } = await import("../static/js/stats-performance.js");
const { convertUnitValue } = await import("../static/js/app-units.js");

for (const unit of ["mph", "kph", "kn"]) {
  setState({ settings: { units: { speed: unit } } });
  const speed = String(convertUnitValue(2.4, "mph", unit));
  const records = [{ direction: "North", gpsSpeed: speed, ballSpeed: String(convertUnitValue(2, "mph", unit)), quantity: 5, trip: { id: "trip" } }];
  const best = summarizeBestSpeedByDirection(records);
  assert.equal(best[0][1], `${Math.round(convertUnitValue(2.4, "mph", unit) * 10) / 10} ${unit}`);
  assert.equal(best[0][2], 5);
  assert.equal(summarizeFishingSpeed(records, "gpsSpeed")[0][1], 5);
  assert.match(summarizeFishingSpeed(records, "gpsSpeed")[0][0], new RegExp(` ${unit}$`));
  assert.equal(summarizeSpeedDelta(records)[0][0], "Ball slower", "unit changes preserve the physical relationship");
  assert.equal(summarizeBestSpeedByDirection([{ ...records[0], gpsSpeed: String(convertUnitValue(16, "mph", unit)) }]).length, 0);
  assert.equal(summarizeFishingSpeed([{ ...records[0], gpsSpeed: "depth 4 ft" }], "gpsSpeed").length, 0);
  assert.equal(summarizeBestSpeedByDirection([{ ...records[0], gpsSpeed: "2.4 mph" }])[0][1], best[0][1], "explicit units are converted");
}

assert.deepEqual(summarizeShakers([{ shaker: true, quantity: 5 }, { shaker: false, quantity: 1 }, { shaker: true, quantity: 0 }]), [
  ["Shaker", 5, "83.33%"], ["Standard size", 1, "16.67%"]
]);
