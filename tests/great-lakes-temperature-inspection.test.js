import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const conditions = await import("../static/js/great-lakes-conditions.js");
const { setHtml } = await import("../static/js/html.js");
setState({ settings: { units: { depth: "m", waterTemperature: "C" } } });
localStorage.setItem(conditions.GREAT_LAKES_LAYER_STORAGE_KEY, "temperature");
document.body.innerHTML = '<div id="fishMap"></div><div id="greatLakesConditions"></div>';
const host = document.querySelector("#greatLakesConditions");
setHtml(host, conditions.greatLakesConditionsHtml());
globalThis.Image = class {
  set src(value) { this.url = value; setTimeout(() => this.onload?.(), 0); }
  get src() { return this.url; }
};

const location = { latitude: 43.2483, longitude: -79.0556 };
const raster = { imageUrl: "/temperature.webp", bounds: [[41, -84], [45, -76]] };
const metadata = { minC: 0, maxC: 30, models: [{ model: "LOOFS", available: true }] };
let inspectedPoint;
window.noaaGreatLakesApi = {
  status: async () => ({ version: "temperature-v1", models: {} }),
  conditions: async ({ layer }) => {
    assert.equal(layer, "temperature");
    return { rasters: [raster], metadata };
  },
  temperatureValue: async (params) => {
    inspectedPoint = params;
    return { available: false };
  },
  profile: async () => ({
    available: true,
    model: "LOOFS",
    modelLocation: { latitude: 43.26, longitude: -79.06 },
    validTime: "2026-11-24T06:00:00Z",
    values: [{ depthMeters: 0, temperatureC: 6.0619 }]
  })
};

const { L } = await import("../static/js/vendor.js");
const map = L.map("fishMap", { zoomAnimation: false, fadeAnimation: false }).setView([43.3, -79.2], 8);
conditions.ensureGreatLakesConditions(map);
const layer = document.querySelector("[data-gl-layer]");
layer.value = "temperature";
layer.dispatchEvent(new Event("change", { bubbles: true }));
for (let attempt = 0; attempt < 100 && !document.querySelector("img.great-lakes-temperature-raster"); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.ok(document.querySelector("img.great-lakes-temperature-raster"), "temperature layer should load");

const reading = String(await conditions.greatLakesMapInspection(location));
assert.match(reading, /Surface temperature/);
assert.match(reading, /<strong>6\.1<\/strong><span>°C<\/span>/);
assert.match(reading, /Nearest wet LOOFS model point/);
assert.match(reading, /43\.260, -79\.060/);
assert.deepEqual([inspectedPoint.latitude, inspectedPoint.longitude], [location.latitude, location.longitude]);

window.noaaGreatLakesApi.temperatureValue = async () => ({ available: true, temperatureC: null });
const invalidReading = String(await conditions.greatLakesMapInspection(location));
assert.match(invalidReading, /<strong>6\.1<\/strong><span>°C<\/span>/);

window.noaaGreatLakesApi.profile = async () => ({ available: false });
window.noaaGreatLakesApi.temperatureValue = async () => { throw new Error("Offline"); };
const failedRequest = String(await conditions.greatLakesMapInspection(location));
assert.match(failedRequest, /Unavailable/);
assert.match(failedRequest, /NOAA water-temperature data is temporarily unavailable/);

clearTimeout(conditions.greatLakesRasterReloadTimer);
map.remove();
process.exit(0);
