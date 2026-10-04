import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv('<!doctype html><html><body><div id="fishMap"></div><div id="greatLakesConditions"></div></body></html>');
// Images "load" as soon as they are asked for.
globalThis.Image = class {
  set src(value) { this.url = value; setTimeout(() => this.onload?.(), 0); }
  get src() { return this.url; }
};
const { L } = await import("../static/js/vendor.js");
const { setState } = await import("../static/js/app-state.js");
setState({ settings: { units: { waterTemperature: "F" } } });
const conditions = await import("../static/js/great-lakes-conditions.js");
const animation = await import("../static/js/great-lakes-animation.js");

// Labels short enough for the slider; a reload keeps the time on screen.
const frames = [
  { forecastHour: 0, validTime: "2026-10-03T23:00:00Z", url: "/api/v1/layers/temperature?forecastHour=0&animation=1" },
  { forecastHour: 1, validTime: "2026-10-04T00:00:00Z", url: "/api/v1/layers/temperature?forecastHour=1&animation=1" },
  { forecastHour: 4, validTime: "2026-10-04T03:00:00Z", url: "/api/v1/layers/temperature?forecastHour=4&animation=1" }
];
assert.match(animation.animationFrameLabel(frames[0].validTime, 0), /^Now · \d{1,2}\s?[AP]M$/);
assert.match(animation.animationFrameLabel(frames[2].validTime, 2), /^[A-Z][a-z]{2} \d{1,2}\s?[AP]M$/);
assert.equal(animation.animationFrameLabel("not a time", 0), "Now");
assert.equal(animation.nearestFrameIndex(frames, "2026-10-04T02:00:00Z"), 2);
assert.equal(animation.nearestFrameIndex(frames, undefined), 0);

// The player against a stubbed API: progress first, then the frames.
const calls = { animation: 0, conditions: 0, frames: [] };
window.noaaGreatLakesApi = {
  status: async () => ({ version: "v1", wavesVersion: "w1", models: {} }),
  conditions: async () => { calls.conditions += 1; return { rasters: [], metadata: { models: [] } }; },
  animation: async ({ layer, depth }) => {
    calls.animation += 1;
    assert.equal(layer, "temperature");
    assert.equal(depth, "0");
    return calls.animation === 1
      ? { ready: false, progress: { done: 3, total: 6 } }
      : { ready: true, scale: { min: 10, max: 16 }, frames };
  },
  animationFrame: async ({ url }) => {
    calls.frames.push(url);
    const frame = frames.find((item) => item.url === url);
    return {
      rasters: [{ imageUrl: `${url}.webp`, bounds: [[41, -84], [43, -78]] }],
      metadata: { minC: 10, maxC: 16, models: [{ model: "LEOFS", available: true, validTime: frame.validTime }] }
    };
  }
};

// Fast: frames every 0.7 s, each fading in over 0.5 s.
localStorage.setItem("glc.AnimationSpeed", "fast");
const map = L.map("fishMap", { zoomAnimation: false, fadeAnimation: false }).setView([42.5, -81], 7);
conditions.ensureGreatLakesConditions(map);
// The fishing map opens with no layer.
const layerSelect = document.querySelector("[data-gl-layer]");
layerSelect.value = "temperature";
layerSelect.dispatchEvent(new Event("change", { bubbles: true }));
const waitFor = async (check, label) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${label}: ${document.querySelector("[data-gl-status]")?.textContent}`);
};
await waitFor(() => calls.conditions === 1, "the normal layer");
const status = () => document.querySelector("[data-gl-status]").textContent;
const play = document.querySelector("[data-gl-play]");
const slider = document.querySelector("[data-gl-frame]");
assert.equal(slider.disabled, true);
assert.equal(document.querySelector("[data-gl-frame-label]").textContent, animation.ANIMATION_IDLE_LABEL);

let shown = null;
document.addEventListener("great-lakes-frame-shown", (event) => { shown = event.detail; });
play.click();
assert.equal(play.getAttribute("aria-pressed"), "true");
await waitFor(() => /Preparing the forecast animation… 50%/.test(status()), "progress");
await waitFor(() => /Showing the forecast for/.test(status()), "the first frame");
assert.equal(calls.frames.length, 3);
const overlays = [...document.querySelectorAll(".great-lakes-animation-frame")];
assert.equal(overlays.length, 3);
// Frames are opaque inside a pane that carries the layer opacity, so a frame
// fading in over another never lets the map show through.
assert.deepEqual(overlays.map((image) => image.style.opacity), ["1", "0", "0"]);
assert.equal(overlays[0].parentElement.style.opacity, "0.9");
assert.equal(document.querySelector("[data-gl-animation-speed-choice]").value, "fast");
assert.equal(slider.disabled, false);
assert.equal(slider.max, "2");
assert.equal(shown.metadata.validTime, frames[0].validTime);
assert.equal(document.querySelector("[data-gl-temperature-max]").textContent, "60.8 °F");
assert.equal(conditions.greatLakesForecastHour(), "0");

// Scrubbing pauses on the chosen frame, and readings follow it.
slider.value = "2";
slider.dispatchEvent(new Event("input", { bubbles: true }));
assert.equal(play.getAttribute("aria-pressed"), "false");
// The new frame fades in over the old one, which stays drawn until the fade is done.
assert.deepEqual(overlays.map((image) => image.style.opacity), ["1", "0", "1"]);
assert.ok(Number(overlays[2].style.zIndex) > Number(overlays[0].style.zIndex));
await waitFor(() => overlays[0].style.opacity === "0", "the old frame to be hidden after the fade");
assert.deepEqual(overlays.map((image) => image.style.opacity), ["0", "0", "1"]);
assert.equal(conditions.greatLakesForecastHour(), "4");
assert.equal(shown.metadata.validTime, frames[2].validTime);
assert.match(document.querySelector("[data-gl-frame-label]").textContent, /^[A-Z][a-z]{2} /);

// Playing moves on by itself.
play.click();
await waitFor(() => conditions.greatLakesForecastHour() === "0", "the loop back to the first frame");
play.click();

// Choosing a forecast time ends the animation and shows that time as usual.
const forecast = document.querySelector("[data-gl-forecast]");
forecast.value = "6";
forecast.dispatchEvent(new Event("change", { bubbles: true }));
assert.equal(animation.greatLakesAnimationActive(), false);
assert.equal(document.querySelector("[data-gl-animation-stop]").hidden, true);
await waitFor(() => calls.conditions === 2, "the forecast choice");
assert.equal(document.querySelectorAll(".great-lakes-animation-frame").length, 0);
assert.equal(conditions.greatLakesForecastHour(), "6");
map.remove();
process.exit(0);
