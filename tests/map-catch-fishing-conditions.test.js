import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
setState({ settings: { units: { depth: "ft", speed: "mph", waterTemperature: "F" } } });
const { bindCatchFishingConditions } = await import("../static/js/map-catch-fishing-conditions.js");

const host = document.createElement("div");
host.dataset.catchFishingConditions = "";
const popupElement = document.createElement("div");
popupElement.append(host);
document.body.append(popupElement);
let onOpen;
const marker = {
  on(event, callback) { assert.equal(event, "popupopen"); onOpen = callback; return this; },
  getPopup() { return { getElement: () => popupElement }; },
};
const record = {
  type: "catch",
  trip: { date: "2026-10-05", launchTime: "06:30" },
  catchItem: { time: "07:15", estimatedLureDepth: "30 ft" },
  coordinates: { latitude: 43.6, longitude: -77.2 },
};
const requests = [];
window.noaaGreatLakesApi = {
  async fishingConditions(options) {
    requests.push(options);
    return {
      available: true,
      time: "2026-10-05T11:00:00Z",
      temperatureProfile: {
        available: true,
        historyTime: "2026-10-05T12:00:00Z",
        thermocline: { topDepthMeters: 12 },
      },
      currentProfile: {
        available: true,
        historyTime: "2026-10-05T12:00:00Z",
        modelLocation: { latitude: 43.61, longitude: -77.21 },
        sampleDistanceKm: 1.2,
        values: [
          { depthMeters: 0, speedMetersPerSecond: 0.5, directionDegrees: 0 },
          { depthMeters: 10, speedMetersPerSecond: 0.2, directionDegrees: 90 },
        ],
      },
    };
  },
};

bindCatchFishingConditions(marker, record);
onOpen();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.deepEqual(requests, [{
  time: new Date(2026, 9, 5, 7, 15).toISOString(),
  latitude: 43.6,
  longitude: -77.2,
}]);
assert.match(host.textContent, /Thermocline/);
assert.match(host.textContent, /Current near catch depth/);
assert.match(host.textContent, /Toward E/);
assert.match(host.textContent, /Model cell 1.2 km away/);
assert.equal(host.dataset.loaded, "true");
