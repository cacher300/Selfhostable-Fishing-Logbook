import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const conditions = await import("../static/js/great-lakes-conditions.js");
const animation = await import("../static/js/great-lakes-animation.js");
const { setup: setupApi } = await import("../static/js/noaa-api.js");
const { setHtml } = await import("../static/js/html.js");
setState({ settings: { units: { depth: "m", waterTemperature: "C" } } });

assert.ok(conditions.GREAT_LAKES_LAYER_OPTIONS.some(([value, label]) => value === "bottom-temperature" && label === "Bottom temperatures"));
localStorage.setItem(conditions.GREAT_LAKES_LAYER_STORAGE_KEY, "bottom-temperature");
assert.equal(conditions.savedGreatLakesLayer(), "bottom-temperature");
document.body.innerHTML = '<div id="greatLakesConditions"></div>';
const host = document.querySelector("#greatLakesConditions");
setHtml(host, conditions.greatLakesConditionsHtml());
host.querySelector("[data-gl-layer]").value = "bottom-temperature";
host.querySelector("[data-gl-forecast]").value = "history";
host.querySelector("[data-gl-depth]").value = "500";
conditions.syncGreatLakesLayerControls();
assert.ok(host.classList.contains("has-temperature-layer"));
assert.ok(host.classList.contains("has-bottom-temperature-layer"));
assert.ok(!host.classList.contains("has-forecast-only-layer"));
assert.equal(host.querySelector("[data-gl-forecast]").value, "0");
assert.ok(host.querySelector('option[value="history"]').disabled);
assert.equal(conditions.greatLakesShownDepth(), "0");
let paletteKind;
document.addEventListener("great-lakes-palette-range", (event) => { paletteKind = event.detail.kind; });
conditions.showPaletteRange("temperature", 3, 10);
assert.equal(paletteKind, "bottom-temperature");

const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return { ok: true, json: async () => ({ rasters: [{ imageUrl: "/api/v1/images/bottom.webp" }] }) };
};
document.documentElement.dataset.greatLakesApi = "https://lakes.example.test";
setupApi();
const payload = await window.noaaGreatLakesApi.conditions({ layer: "bottom-temperature", forecastHour: 6, depth: 100 });
await window.noaaGreatLakesApi.animation({ layer: "bottom-temperature", depth: 100 });
await window.noaaGreatLakesApi.bottomTemperatureValue({ forecastHour: 6, latitude: 43, longitude: -78, frame: "saved", inputs: "snapshot" });
assert.deepEqual(requested, [
  "https://lakes.example.test/api/v1/layers/bottom-temperature?forecastHour=6",
  "https://lakes.example.test/api/v1/animation/bottom-temperature",
  "https://lakes.example.test/api/v1/point/bottom-temperature?latitude=43&longitude=-78&forecastHour=6&frame=saved&inputs=snapshot"
]);
assert.equal(payload.rasters[0].imageUrl, "https://lakes.example.test/api/v1/images/bottom.webp");

document.body.innerHTML = '<div id="fishMap"></div><div id="greatLakesConditions"></div>';
globalThis.Image = class {
  set src(value) { this.url = value; setTimeout(() => this.onload?.(), 0); }
  get src() { return this.url; }
};
const { L } = await import("../static/js/vendor.js");
const frames = [0, 6].map((hour) => ({
  forecastHour: hour, validTime: new Date(Date.now() + hour * 3600000).toISOString(),
  url: `/api/v1/layers/bottom-temperature?forecastHour=${hour}&frame=bottom-${hour}&inputs=forecast-snapshot`
}));
const raster = { imageUrl: "/bottom.webp", bounds: [[41, -84], [43, -78]] };
const metadata = { minC: 0, maxC: 30, models: [{ model: "LEOFS", available: true, validTime: frames[0].validTime }] };
let pointParams = null;
window.noaaGreatLakesApi = {
  status: async () => ({ version: "bottom-v1", models: {} }),
  conditions: async ({ layer, depth }) => {
    assert.equal(layer, "bottom-temperature");
    assert.equal(depth, "0");
    return { rasters: [raster], metadata };
  },
  bottomTemperatureValue: async (params) => {
    pointParams = params;
    return { available: true, temperatureC: 6, depthMeters: 20 };
  },
  animation: async ({ layer, depth }) => {
    assert.equal(layer, "bottom-temperature");
    assert.equal(depth, "0");
    return { ready: true, frames };
  },
  animationFrame: async () => ({ rasters: [raster], metadata })
};
const waitFor = async (check) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Bottom layer did not load: ${document.querySelector("[data-gl-status]")?.textContent}`);
};
let surfaceTemperatureMetadata = "not loaded";
document.addEventListener("great-lakes-layer-loaded", (event) => {
  if (event.detail.layer === "bottom-temperature") surfaceTemperatureMetadata = event.detail.temperatureMetadata;
});
const map = L.map("fishMap", { zoomAnimation: false, fadeAnimation: false }).setView([42.5, -81], 7);
conditions.ensureGreatLakesConditions(map);
const layer = document.querySelector("[data-gl-layer]");
layer.value = "bottom-temperature";
layer.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => conditions.greatLakesActiveLayer === "bottom-temperature");
assert.ok(document.querySelector("img.great-lakes-temperature-raster"));
assert.equal(surfaceTemperatureMetadata, null);
let reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /Bottom temperature/);
assert.match(reading, /<strong>6<\/strong><span>°C<\/span>/);
assert.match(reading, /Model depth/);
assert.match(reading, /20 m/);
document.querySelector("[data-gl-play]").click();
await waitFor(() => document.querySelectorAll("img.great-lakes-animation-frame").length === 2);
document.querySelector("[data-gl-play]").click();
assert.equal(document.querySelector("img.great-lakes-animation-frame").parentElement.style.opacity, "0.9");
assert.equal(surfaceTemperatureMetadata, null);
assert.deepEqual(animation.greatLakesAnimationPointParams(), { frame: "bottom-0", inputs: "forecast-snapshot" });
reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /Bottom temperature/);
assert.equal(pointParams.frame, "bottom-0");
assert.equal(pointParams.inputs, "forecast-snapshot");
animation.stopGreatLakesAnimation();
window.noaaGreatLakesApi.bottomTemperatureValue = async () => { throw new Error("Offline"); };
reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /Unavailable/);
clearTimeout(conditions.greatLakesRasterReloadTimer);
map.remove();
process.exit(0);
