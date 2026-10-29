import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const conditions = await import("../static/js/great-lakes-conditions.js");
const animation = await import("../static/js/great-lakes-animation.js");
const palette = await import("../static/js/great-lakes-palette.js");
const { setup: setupApi } = await import("../static/js/noaa-api.js");
const { setHtml } = await import("../static/js/html.js");
setState({ settings: { units: { depth: "m", waterTemperature: "C" } } });

assert.ok(conditions.GREAT_LAKES_LAYER_OPTIONS.some(([value, label]) => value === "air-temperature" && label === "Air temperature"));
localStorage.setItem(conditions.GREAT_LAKES_LAYER_STORAGE_KEY, "air-temperature");
assert.equal(conditions.savedGreatLakesLayer(), "air-temperature");
document.body.innerHTML = '<div id="greatLakesConditions"></div>';
const host = document.querySelector("#greatLakesConditions");
setHtml(host, conditions.greatLakesConditionsHtml());
host.querySelector("[data-gl-forecast]").value = "history";
host.querySelector("[data-gl-depth]").value = "500";
conditions.syncGreatLakesLayerControls();
assert.ok(host.classList.contains("has-temperature-layer"));
assert.ok(host.classList.contains("has-air-temperature-layer"));
assert.equal(host.querySelector("[data-gl-forecast]").value, "0");
assert.equal(host.querySelector("[data-gl-forecast-slider]").max, "48");
assert.ok(host.querySelector('option[value="history"]').disabled);
assert.equal(conditions.greatLakesShownDepth(), "0");
assert.equal(host.querySelector("[data-gl-air-coverage-control]").hidden, false);
assert.equal(host.querySelector("[data-gl-air-coverage]").value, "region");
conditions.syncAirTemperatureForecast({ maxForecastHour: 7, forecastHours: [0, 2, 7, 48, 49] });
assert.equal(host.querySelector("[data-gl-forecast-slider]").max, "7");
assert.ok(host.querySelector('[data-gl-forecast] option[value="1"]').disabled);
assert.ok(host.querySelector('[data-gl-forecast-choices] input[value="12"]').disabled);
host.querySelector("[data-gl-forecast]").value = "48";
conditions.syncGreatLakesLayerControls();
assert.equal(host.querySelector("[data-gl-forecast]").value, "7");
conditions.syncAirTemperatureForecast({ maxForecastHour: 120, forecastHours: [0, 48, 49, 120] });
assert.equal(host.querySelector("[data-gl-forecast-slider]").max, "48");
conditions.syncAirTemperatureForecast(null);
conditions.syncAirTemperatureForecast({ maxForecastHour: 46, forecastHours: [0, 6, 12, 24, 46] });
assert.equal(host.querySelector("[data-gl-forecast-slider]").max, "46");
assert.equal(host.querySelector('[data-gl-forecast] option[value="46"]').disabled, false);
assert.equal(conditions.greatLakesDataVersion({ version: "glofs", wavesVersion: "waves", airTemperatureVersion: "hrrr" }, "air-temperature"), "hrrr");
assert.equal(conditions.greatLakesDataVersion({ version: "glofs" }, "air-temperature"), "");
conditions.syncAirTemperatureForecast(null);

const histogram = new Array(512).fill(0);
histogram[120] = 100;
assert.deepEqual(palette.fitRange(histogram, 90 / 512, -40, "air-temperature", "fixed"), [-40, 50]);
const fitted = palette.fitRange(histogram, 90 / 512, -40, "air-temperature", "dynamic");
assert.ok(fitted[0] < 0 && fitted[1] < 0);
assert.equal(fitted[1] - fitted[0], 3);
assert.deepEqual(palette.fitRange(histogram, 30 / 512, 0, "temperature", "fixed"), [0, 30]);

const bounds = [[41, -84], [43, -78]];
const regionalRaster = { imageUrl: "/api/v1/images/air-region.webp", valueUrl: "/api/v1/values/air-region.png", valueRange: [-40, 50], bounds };
const lakeRaster = { imageUrl: "/api/v1/images/air-lakes.webp", valueUrl: "/api/v1/values/air-lakes.png", valueRange: [-40, 50], bounds };
const rawPayload = { rasters: [regionalRaster], lakeRasters: [lakeRaster], metadata: {} };
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return { ok: true, json: async () => rawPayload };
};
document.documentElement.dataset.greatLakesApi = "https://lakes.example.test";
setupApi();
const payload = await window.noaaGreatLakesApi.conditions({ layer: "air-temperature", forecastHour: 2, depth: 100 });
await window.noaaGreatLakesApi.animation({ layer: "air-temperature", depth: 100 });
await window.noaaGreatLakesApi.airTemperatureValue({ forecastHour: 2, latitude: 43, longitude: -78, frame: "air-2", inputs: "snapshot" });
const normalizedFrame = await window.noaaGreatLakesApi.animationFrame({ url: "/api/v1/frames/air-2" });
assert.deepEqual(requested, [
  "https://lakes.example.test/api/v1/layers/air-temperature?forecastHour=2",
  "https://lakes.example.test/api/v1/animation/air-temperature",
  "https://lakes.example.test/api/v1/point/air-temperature?latitude=43&longitude=-78&forecastHour=2&frame=air-2&inputs=snapshot",
  "https://lakes.example.test/api/v1/frames/air-2"
]);
for (const result of [payload, normalizedFrame]) {
  assert.equal(result.rasters[0].imageUrl, "https://lakes.example.test/api/v1/images/air-region.webp");
  assert.equal(result.rasters[0].valueUrl, "https://lakes.example.test/api/v1/values/air-region.png");
  assert.equal(result.lakeRasters[0].imageUrl, "https://lakes.example.test/api/v1/images/air-lakes.webp");
  assert.equal(result.lakeRasters[0].valueUrl, "https://lakes.example.test/api/v1/values/air-lakes.png");
}
globalThis.fetch = async (url) => {
  assert.equal(String(url), "https://lakes.example.test/api/v1/status");
  return { ok: true, json: async () => ({ version: "glofs", airTemperatureVersion: "hrrr", airTemperature: { available: true, maxForecastHour: 46 } }) };
};
const airStatus = await window.noaaGreatLakesApi.status({ layer: "air-temperature" });
assert.equal(airStatus.airTemperatureVersion, "hrrr");
assert.equal(airStatus.airTemperature.maxForecastHour, 46);

document.body.innerHTML = '<div id="fishMap"></div><div id="greatLakesConditions"></div>';
globalThis.Image = class {
  set src(value) { this.url = value; setTimeout(() => this.onload?.(), 0); }
  get src() { return this.url; }
};
const { L } = await import("../static/js/vendor.js");
const frames = [0, 2, 7].map((hour) => ({
  forecastHour: hour, validTime: new Date(Date.now() + hour * 3600000).toISOString(),
  url: `/api/v1/layers/air-temperature?forecastHour=${hour}&frame=air-${hour}&inputs=forecast-snapshot`
}));
const metadata = {
  source: "NOAA HRRR · 2 m air temperature", run: "20261029t12z", runTime: "2026-10-29T12:00:00Z",
  validTime: frames[0].validTime, forecastHour: 0, minC: -40, maxC: 50, heightMeters: 2,
  available: true, maxForecastHour: 7, forecastHours: [0, 2, 7]
};
const readingParams = [];
let failPinnedPoint = false;
let layerLoads = 0;
let hrrrVersion = "air-v1";
let glofsVersion = "water-v1";
const loadedFrames = [];
window.noaaGreatLakesApi = {
  status: async () => ({ version: glofsVersion, airTemperatureVersion: hrrrVersion, airTemperature: metadata, models: {} }),
  conditions: async ({ layer, depth }) => {
    assert.equal(layer, "air-temperature");
    assert.equal(depth, "0");
    layerLoads += 1;
    return { ...rawPayload, metadata };
  },
  airTemperatureValue: async (params) => {
    readingParams.push(params);
    if (failPinnedPoint) throw new Error("Pinned frame expired");
    return { available: true, temperatureC: -5, heightMeters: 2, model: "HRRR", validTime: frames[0].validTime };
  },
  animation: async ({ layer, depth }) => {
    assert.equal(layer, "air-temperature");
    assert.equal(depth, "0");
    return { ready: true, frames: [...frames, { forecastHour: 49, url: "/must-not-fetch" }] };
  },
  animationFrame: async ({ url }) => {
    loadedFrames.push(url);
    return { ...rawPayload, metadata };
  }
};
const waitFor = async (check) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Air layer did not load: ${document.querySelector("[data-gl-status]")?.textContent}`);
};
let surfaceTemperatureMetadata = "not loaded";
let rangeKind = null;
document.addEventListener("great-lakes-layer-loaded", (event) => {
  if (event.detail.layer === "air-temperature") surfaceTemperatureMetadata = event.detail.temperatureMetadata;
});
document.addEventListener("great-lakes-palette-range", (event) => { rangeKind = event.detail.kind; });
palette.setTemperatureColorMode("fixed");
const map = L.map("fishMap", { zoomAnimation: false, fadeAnimation: false }).setView([42.5, -81], 7);
conditions.ensureGreatLakesConditions(map);
const layer = document.querySelector("[data-gl-layer]");
layer.value = "air-temperature";
layer.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => conditions.greatLakesActiveLayer === "air-temperature");
assert.match(document.querySelector("img.great-lakes-temperature-raster").src, /air-region\.png$/);
assert.equal(document.querySelector("[data-gl-temperature-min]").textContent, "-40 °C");
assert.equal(document.querySelector("[data-gl-temperature-max]").textContent, "50 °C");
assert.equal(rangeKind, "air-temperature");
assert.equal(surfaceTemperatureMetadata, null);
assert.match(document.querySelector("[data-gl-status]").textContent, /NOAA HRRR · 2 m air temperature/);
let reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /Air temperature/);
assert.match(reading, /<strong>-5<\/strong><span>°C<\/span>/);
assert.match(reading, /Height above ground/);
assert.match(reading, /2 m/);
assert.doesNotMatch(reading, /profile|Model depth/i);

setState({ settings: { units: { depth: "ft", waterTemperature: "F" } } });
conditions.setTemperatureLegendRange({ minC: -40, maxC: 50 });
assert.equal(document.querySelector("[data-gl-temperature-max]").textContent, "122 °F");
reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /<strong>23<\/strong><span>°F<\/span>/);
const coverage = document.querySelector("[data-gl-air-coverage]");
coverage.value = "lakes";
coverage.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => /air-lakes\.png$/.test(document.querySelector("img.great-lakes-temperature-raster")?.src || ""));
assert.equal(layerLoads, 1, "Coverage changes reuse both arrays in the cached payload");
assert.deepEqual(conditions.airTemperatureRasters({ rasters: [regionalRaster] }), [], "Missing lake coverage must not expose regional rasters");
const forecastSlider = document.querySelector("[data-gl-forecast-slider]");
forecastSlider.value = "5";
forecastSlider.dispatchEvent(new Event("input", { bubbles: true }));
assert.equal(forecastSlider.value, "7", "Sparse UI offsets snap to an available hour");

document.querySelector("[data-gl-play]").click();
await waitFor(() => document.querySelectorAll("img.great-lakes-animation-frame").length === 3);
document.querySelector("[data-gl-play]").click();
assert.equal(document.querySelector("[data-gl-frame]").max, "2", "Only actual frames are played, without padding the last frame");
assert.equal(loadedFrames.length, 3);
assert.ok(loadedFrames.every((url) => !url.includes("must-not-fetch")));
assert.ok([...document.querySelectorAll("img.great-lakes-animation-frame")].every((image) => /air-lakes\.png$/.test(image.src)));
assert.equal(surfaceTemperatureMetadata, null);
const frameSlider = document.querySelector("[data-gl-frame]");
frameSlider.value = "2";
frameSlider.dispatchEvent(new Event("input", { bubbles: true }));
assert.deepEqual(animation.greatLakesAnimationPointParams(), { frame: "air-7", inputs: "forecast-snapshot" });
reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.equal(readingParams.at(-1).forecastHour, "7");
assert.equal(readingParams.at(-1).frame, "air-7");
assert.equal(readingParams.at(-1).inputs, "forecast-snapshot");
assert.match(reading, /Air temperature/);
failPinnedPoint = true;
const pointCalls = readingParams.length;
reading = String(await conditions.greatLakesMapInspection({ latitude: 43, longitude: -78 }));
assert.match(reading, /Unavailable/);
assert.equal(readingParams.length, pointCalls + 1, "Pinned failures must not retry a live reading");

coverage.value = "region";
coverage.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => [...document.querySelectorAll("img.great-lakes-animation-frame")].length === 3 && [...document.querySelectorAll("img.great-lakes-animation-frame")].every((image) => /air-region\.png$/.test(image.src)));
assert.equal(loadedFrames.length, 3, "Animation coverage changes reuse raw cached frame payloads");
animation.stopGreatLakesAnimation();
metadata.lakeCoverageAvailable = false;
coverage.value = "lakes";
await conditions.loadGreatLakesConditions(map);
assert.match(document.querySelector("[data-gl-status]").textContent, /lake coverage is unavailable.*Choose Region/);
assert.equal(document.querySelector("[data-gl-status]").classList.contains("is-error"), true);
assert.equal(document.querySelectorAll("img.great-lakes-temperature-raster").length, 0);
assert.throws(() => conditions.airTemperatureRasters({ ...rawPayload, metadata }), /lake coverage is unavailable/);
document.querySelector("[data-gl-play]").click();
await waitFor(() => /lake coverage is unavailable/.test(document.querySelector("[data-gl-status]").textContent) && document.querySelector("[data-gl-play]").getAttribute("aria-pressed") === "false");
assert.equal(document.querySelectorAll("img.great-lakes-animation-frame").length, 0);
animation.stopGreatLakesAnimation();
metadata.lakeCoverageAvailable = true;
coverage.value = "region";
await conditions.loadGreatLakesConditions(map);
const previousLoads = layerLoads;
glofsVersion = "water-v2";
assert.equal(await conditions.refreshGreatLakesIfStale(map), false, "Water updates do not refresh air imagery");
assert.equal(layerLoads, previousLoads);
hrrrVersion = "air-v2";
assert.equal(await conditions.refreshGreatLakesIfStale(map), true, "Independent HRRR updates refresh air imagery");
assert.equal(layerLoads, previousLoads + 1);
conditions.syncAirTemperatureForecast({ maxForecastHour: 0, forecastHours: [] });
assert.equal(document.querySelector("[data-gl-forecast-slider]").disabled, true);
layer.value = "temperature";
conditions.syncGreatLakesLayerControls();
assert.equal(document.querySelector("[data-gl-forecast-slider]").max, "120");
assert.equal(document.querySelector("[data-gl-air-coverage-control]").hidden, true);
assert.equal(document.querySelector('[data-gl-forecast] option[value="history"]').disabled, false);
clearTimeout(conditions.greatLakesRasterReloadTimer);
map.remove();
process.exit(0);
