import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { greatLakesConditionsHtml, upwellingReading } = await import("../static/js/great-lakes-conditions.js");
const { fitRange } = await import("../static/js/great-lakes-palette.js");
const { setup: setupApi } = await import("../static/js/noaa-api.js");
setState({ settings: { units: { depth: "ft", waterTemperature: "F" } } });

assert.match(String(greatLakesConditionsHtml()), /<option value="upwelling">Upwelling &amp; downwelling<\/option>/);
assert.deepEqual(fitRange([1, 2, 3], 1, 0, "upwelling"), [-8, 8]);
const reading = upwellingReading({ kind: "upwelling", evidenceIndex: 7, confidence: "supported", assessment: "assessed", surfaceC: 12, surroundingC: 14, change24hC: null, relativeChange24hC: -1, thermoclineShiftMeters: null, openWater: true });
assert.equal(reading.label, "Upwelling");
assert.equal(reading.value, "Likely");
assert.equal(reading.rows[1][1], "3.6 °F colder");
assert.equal(reading.rows[4][0], "Change relative to nearby");
assert.equal(upwellingReading({ kind: null, assessment: "insufficient-stratification", openWater: true }).value, "Unable to assess");
assert.equal(upwellingReading({ kind: null, assessment: "assessed", openWater: true }).value, "No clear signal");

const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return { ok: true, json: async () => ({}) };
};
setupApi();
await window.noaaGreatLakesApi.conditions({ layer: "upwelling", forecastHour: 6, depth: 0, resolution: 512, models: "LOOFS" });
await window.noaaGreatLakesApi.upwellingValue({ forecastHour: 6, latitude: 43.5, longitude: -79.5, models: "LOOFS" });
await window.noaaGreatLakesApi.upwellingValue({ forecastHour: 0, latitude: 43.5, longitude: -79.5, time: "2026-10-05T03:00:00Z" });
assert.deepEqual(requested, [
  "https://greatlakestrolling.com/api/v1/layers/upwelling?forecastHour=6",
  "https://greatlakestrolling.com/api/v1/point?latitude=43.5&longitude=-79.5&forecastHour=6&depth=0",
  "https://greatlakestrolling.com/api/v1/history/point?latitude=43.5&longitude=-79.5&depth=0&time=2026-10-05T03%3A00%3A00Z"
]);
