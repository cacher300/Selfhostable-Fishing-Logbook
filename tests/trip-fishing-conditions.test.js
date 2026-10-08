import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
setState({ settings: { units: { depth: "ft", speed: "mph", waterTemperature: "F" } } });
const {
  catchCurrentDisplayValues,
  isGreatLakesFishingTrip,
  loadSavedFishingConditions,
  thermoclineDisplayValue
} = await import("../static/js/trip-fishing-conditions.js");

const locations = [{ id: "erie", name: "Lake Erie" }, { id: "claire", name: "Lake St. Clair" }];
assert.equal(isGreatLakesFishingTrip({ locationId: "erie", method: "Trolling" }, locations), true);
assert.equal(isGreatLakesFishingTrip({ location: "Lake Michigan", method: "jigging" }), true);
assert.equal(isGreatLakesFishingTrip({ locationId: "erie", method: "casting" }, locations), false);
assert.equal(isGreatLakesFishingTrip({ locationId: "claire", method: "trolling" }, locations), false);
assert.equal(isGreatLakesFishingTrip({ location: "Lake St. Clair", method: "trolling" }), false);

assert.match(thermoclineDisplayValue({ temperatureProfile: { available: true, thermocline: { topDepthMeters: 12 } } }), /ft$/);
assert.equal(thermoclineDisplayValue({ temperatureProfile: { available: true, thermocline: null } }), "Not identified");
assert.equal(thermoclineDisplayValue({ temperatureProfile: { available: false, thermocline: null } }), "Unavailable");
assert.equal(thermoclineDisplayValue({ temperatureProfile: { available: true, noThermocline: "mixed" } }), "No distinct thermocline");

assert.deepEqual(catchCurrentDisplayValues({
  currentProfile: {
    values: [
      { depthMeters: 0, speedMetersPerSecond: 0.2, directionDegrees: 0 },
      { depthMeters: 10, speedMetersPerSecond: 0.4, directionDegrees: 230 }
    ]
  }
}, { estimatedLureDepth: "33 ft" }), {
  speed: "0.9 mph",
  direction: "Toward SW (230°)",
  note: "Current near 32.8 ft"
});
assert.deepEqual(catchCurrentDisplayValues({ currentProfile: { values: [], surfaceOnly: true } }), {
  speed: "Unavailable", direction: "Unavailable", note: ""
});

let requested;
window.noaaGreatLakesApi = {
  async fishingConditions(options) {
    requested = options;
    return { available: true };
  }
};
const conditions = await loadSavedFishingConditions(
  { date: "2026-10-05", launchTime: "06:30" },
  { latitude: 43.6, longitude: -77.2 },
  { time: "07:15" }
);
assert.equal(conditions.available, true);
assert.deepEqual(requested, {
  time: new Date(2026, 9, 5, 7, 15).toISOString(),
  latitude: 43.6,
  longitude: -77.2
});
