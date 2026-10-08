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

// Fast: frames every 0.7 s, fading throughout the interval.
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
// The time shows on the timeline and in the panel summary, so the status line only carries warnings.
await waitFor(() => shown && document.querySelectorAll(".great-lakes-animation-frame").length === 3, "the first frame");
assert.equal(status(), "");
assert.equal(calls.frames.length, 3);
const overlays = [...document.querySelectorAll(".great-lakes-animation-frame")];
assert.equal(overlays.length, 3);
// Frames are opaque inside a pane that carries the layer opacity, so a frame
// fading in over another never lets the map show through.
// Playback starts fading toward the next frame immediately, without a hold.
await waitFor(() => Number(overlays[1].style.opacity) > 0 && Number(overlays[1].style.opacity) < 1, "the next frame to blend in");
assert.equal(overlays[0].style.opacity, "1");
assert.equal(overlays[2].style.opacity, "0");
play.click();
assert.deepEqual(overlays.map((image) => image.style.opacity), ["1", "0", "0"]);
assert.equal(overlays[0].parentElement.style.opacity, "0.9");
assert.equal(document.querySelector("[data-gl-animation-speed-choice]").value, "fast");
assert.equal(slider.disabled, false);
assert.equal(slider.max, "2");
assert.equal(shown.metadata.validTime, frames[0].validTime);
assert.equal(document.querySelector("[data-gl-temperature-max]").textContent, "60.8 °F");
assert.equal(conditions.greatLakesForecastHour(), "0");

assert.deepEqual(conditions.blendCurrentVectors({ u: 1, v: 0 }, { u: 0, v: 1 }, 0.5), { u: 0.5, v: 0.5 });
assert.deepEqual(conditions.blendCurrentVectors({ u: 1, v: 0 }, { u: -1, v: 0 }, 0.5), { u: 0, v: 0 });

// Scrubbing pauses on the chosen frame, and readings follow it.
slider.value = "2";
slider.dispatchEvent(new Event("input", { bubbles: true }));
assert.equal(play.getAttribute("aria-pressed"), "false");
// The new frame fades in over the old one, which stays drawn until the fade is done.
assert.equal(overlays[0].style.opacity, "1");
assert.equal(overlays[1].style.opacity, "0");
await waitFor(() => Number(overlays[2].style.opacity) > 0 && Number(overlays[2].style.opacity) < 1, "the scrubbed frame to blend in");
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
// Temperature backgrounds must follow the current forecast hour even when
// independently prepared indexes return their frames in a different order.
const currentFrames = frames.map((frame) => ({ ...frame, url: `${frame.url}&kind=currents` }));
const temperatureFrames = [frames[2], frames[0], frames[1]].map((frame) => ({ ...frame, url: `${frame.url}&background=1` }));
window.noaaGreatLakesApi.animation = async ({ layer }) => ({ ready: true, frames: layer === "currents" ? currentFrames : temperatureFrames });
window.noaaGreatLakesApi.animationFrame = async ({ url }) => {
  const frame = [...currentFrames, ...temperatureFrames].find((item) => item.url === url);
  return {
    rasters: [{ imageUrl: `${url}.webp`, bounds: [[41, -84], [43, -78]] }],
    metadata: { forecastHour: frame.forecastHour, minC: 10, maxC: 16, models: [] }
  };
};
document.querySelector("[data-gl-layer]").value = "currents";
document.querySelector("[data-gl-current-background]").value = "temperature";
document.querySelector("[data-gl-current-display]").value = "off";
animation.animationState.active = true;
assert.equal(await animation.loadGreatLakesAnimation(map, { layer: "currents", depth: "0", isCurrent: () => true }), true);
animation.syncTimelineControls();
const temperatureOverlays = [...document.querySelectorAll(".great-lakes-animation-frame")];
assert.deepEqual(temperatureOverlays.map((image) => image.getAttribute("src")), frames.map((frame) => `${frame.url}&background=1.webp`));
slider.value = "2";
slider.dispatchEvent(new Event("input", { bubbles: true }));
await waitFor(() => temperatureOverlays[0].style.opacity === "0", "the current temperature background to change");
assert.deepEqual(temperatureOverlays.map((image) => image.style.opacity), ["0", "0", "1"]);
assert.equal(shown.temperatureMetadata.forecastHour, 4);
play.click();
await waitFor(() => shown.temperatureMetadata.forecastHour === 0, "temperature playback to loop with currents");
animation.stopGreatLakesAnimation();
// Clear thermocline cells must reveal the map gradually, not keep the old
// colour until frame cleanup. Exercise both forward playback and the loop.
const thermoclineFrames = frames.slice(0, 2).map((frame) => ({ ...frame, url: `${frame.url}&kind=thermocline` }));
window.noaaGreatLakesApi.animation = async () => ({ ready: true, frames: thermoclineFrames });
window.noaaGreatLakesApi.animationFrame = async () => ({
  rasters: [{ imageUrl: "/thermocline-with-transparent-cells.webp", bounds: [[41, -84], [43, -78]] }],
  metadata: { minDepthMeters: 0, maxDepthMeters: 30, models: [] }
});
document.querySelector("[data-gl-layer]").value = "thermocline";
animation.animationState.active = true;
assert.equal(await animation.loadGreatLakesAnimation(map, { layer: "thermocline", depth: "0", isCurrent: () => true }), true);
animation.syncTimelineControls();
const thermoclineImages = animation.animationState.overlays.map(([overlay]) => overlay.getElement());
const opacity = (index) => Number(thermoclineImages[index].style.opacity);
play.click();
await waitFor(() => opacity(0) < 0.8 && opacity(0) > 0.2, "outgoing thermocline colours to fade during playback");
assert.ok(opacity(1) > 0.2 && opacity(1) < 0.8, "incoming colours blend at the same time");
assert.ok(Math.abs(opacity(0) + opacity(1) - 1) < 0.05);
await waitFor(() => animation.animationState.index === 1, "the second thermocline frame");
await waitFor(() => opacity(1) < 0.8 && opacity(1) > 0.2, "outgoing thermocline colours to fade on the loop");
assert.ok(opacity(0) > 0.2 && opacity(0) < 0.8);
play.click();
assert.deepEqual(thermoclineImages.map((image) => image.style.opacity), ["0", "1"]);
slider.value = "0";
slider.dispatchEvent(new Event("input", { bubbles: true }));
await waitFor(() => opacity(1) < 0.8 && opacity(1) > 0.2, "thermocline scrubbing to fade the old frame");
await waitFor(() => opacity(0) === 1 && opacity(1) === 0, "thermocline scrubbing to settle");
window.matchMedia = () => ({ matches: true });
slider.value = "1";
slider.dispatchEvent(new Event("input", { bubbles: true }));
assert.deepEqual(thermoclineImages.map((image) => image.style.opacity), ["0", "1"]);
animation.stopGreatLakesAnimation();
map.remove();
process.exit(0);
