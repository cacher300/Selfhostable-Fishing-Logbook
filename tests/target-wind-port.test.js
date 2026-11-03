import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";
installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { setMapUnitSystem } = await import("../static/js/app-units.js");
function setUnitSystem(system) {
  const units = system === "metric"
    ? { depth: "m", waterTemperature: "C", speed: "kph" }
    : system === "nautical"
      ? { waterTemperature: "F", speed: "kn" }
      : { waterTemperature: "F", speed: "mph" };
  setState({ settings: { units } });
  setMapUnitSystem(system);
}
const { windSpeedLabel, windReading, windParticleFields } = await import("../static/js/wind.js");
const { currentPixelsPerFrame, dramaticParticleSpeed } = await import("../static/js/particle-speed.js");
const { WIND_FULL_SPEED_METERS_PER_SECOND } = await import("../static/js/wind-fields.js");
const {
  DEFAULT_WIND_PARTICLE_COLOR, WIND_PARTICLE_COLOR_OPTIONS, WIND_PARTICLE_COLOR_STORAGE_KEY,
  greatLakesConditionsHtml, syncGreatLakesLayerControls, setTargetTemperature, setTargetTemperatureSurfaceRange,
  syncTargetTemperatureUnits, createCurrentFieldSampler, normalizedWindParticleColor, savedWindParticleColor,
  setWindParticleColor, windParticleColorParts
} = await import("../static/js/great-lakes-conditions.js");
const { setHtml } = await import("../static/js/html.js");
document.body.innerHTML = '<div id="greatLakesConditions"></div>';
setHtml(document.querySelector("#greatLakesConditions"), greatLakesConditionsHtml());
assert.equal(DEFAULT_WIND_PARTICLE_COLOR, "#67e8f9");
assert.equal(normalizedWindParticleColor("#EF4444"), "#ef4444");
assert.equal(normalizedWindParticleColor("speed"), DEFAULT_WIND_PARTICLE_COLOR);
assert.deepEqual(windParticleColorParts("#ef4444"), { rgb: "239, 68, 68", halo: "255, 255, 255" });
assert.equal(WIND_PARTICLE_COLOR_OPTIONS.some(([value]) => value === "speed"), false);
assert.deepEqual(WIND_PARTICLE_COLOR_OPTIONS.slice(-3), [["#ffd700", "Gold"], ["#a855f7", "Purple"], ["#ec4899", "Pink"]]);
assert.equal(normalizedWindParticleColor("#a855f7"), "#a855f7");
assert.deepEqual(windParticleColorParts("#ffd700"), { rgb: "255, 215, 0", halo: "6, 16, 34" });
assert.equal(savedWindParticleColor(), DEFAULT_WIND_PARTICLE_COLOR);
let changedWindColor = "";
document.addEventListener("great-lakes-wind-color-changed", (event) => { changedWindColor = event.detail.color; });
assert.equal(setWindParticleColor("#ef4444"), "#ef4444");
assert.equal(savedWindParticleColor(), "#ef4444");
assert.equal(localStorage.getItem(WIND_PARTICLE_COLOR_STORAGE_KEY), "#ef4444");
assert.equal(changedWindColor, "#ef4444");
setUnitSystem("imperial");
assert.equal(windSpeedLabel(10), "22.4 mph");
setUnitSystem("nautical");
assert.equal(windSpeedLabel(10), "19.4 kn");
setUnitSystem("metric");
assert.equal(windSpeedLabel(10), "36 kph");
const [{ points: [windPoint] }] = windParticleFields([{latitude:43,longitude:-78,u:5,v:-2},{latitude:44,longitude:-77,u:NaN,v:1}]);
assert.ok(Math.abs(windPoint.u / windPoint.v - 5 / -2) < 1e-9, "wind particles keep the wind's direction");
assert.ok(Math.abs(Math.hypot(windPoint.u, windPoint.v) - dramaticParticleSpeed(Math.hypot(5, 2), WIND_FULL_SPEED_METERS_PER_SECOND)) < 1e-9);
// Still air does not move; light air creeps; full speed from 25 kn up.
const windPixels = (metersPerSecond) => {
  const [{ points: [point] }] = windParticleFields([{ latitude: 43, longitude: -78, u: metersPerSecond, v: 0 }]);
  return currentPixelsPerFrame(Math.hypot(point.u, point.v));
};
assert.equal(windPixels(0), 0);
assert.ok(windPixels(1) > 0 && windPixels(1) < 0.1);
assert.ok(windPixels(10 * 0.514444) * 3.9 < windPixels(20 * 0.514444), "doubling the wind about quadruples the motion");
assert.ok(Math.abs(windPixels(WIND_FULL_SPEED_METERS_PER_SECOND) - 2.6) < 1e-6);
const windGrid = windParticleFields([
  { latitude: 43, longitude: -78, u: 0, v: 0 }, { latitude: 43, longitude: -77.75, u: 10, v: 0 },
  { latitude: 43.25, longitude: -78, u: 0, v: 20 }, { latitude: 43.25, longitude: -77.75, u: 10, v: 20 }
]);
const sampleWind = createCurrentFieldSampler(windGrid);
assert.equal(windGrid[0].rows, 2);
assert.equal(windGrid[0].columns, 2);
const expectedWind = [[10, 0], [0, 20], [10, 20]].map(([u, v]) => {
  const scale = dramaticParticleSpeed(Math.hypot(u, v), WIND_FULL_SPEED_METERS_PER_SECOND) / Math.hypot(u, v);
  return [u * scale, v * scale];
});
assert.ok(Math.abs(sampleWind(43.125, -77.875).u - expectedWind.reduce((sum, [u]) => sum + u, 0) / 4) < 1e-6);
assert.ok(Math.abs(sampleWind(43.125, -77.875).v - expectedWind.reduce((sum, [, v]) => sum + v, 0) / 4) < 1e-6);
setTargetTemperature(10);
assert.equal(document.querySelector("[data-gl-target-temperature]").value, "10");
setUnitSystem("imperial");
syncTargetTemperatureUnits();
setTargetTemperatureSurfaceRange({ minSurfaceTemperatureC: 0, maxSurfaceTemperatureC: 10 });
assert.equal(document.querySelector("[data-gl-target-surface-range]").textContent, "Great Lakes surface: min 32 °F · max 50 °F");
setUnitSystem("metric");
syncTargetTemperatureUnits();
assert.equal(document.querySelector("[data-gl-target-surface-range]").textContent, "Great Lakes surface: min 0 °C · max 10 °C");
const layer = document.querySelector("[data-gl-layer]");
layer.value = "target-temperature";
document.querySelector("[data-gl-forecast]").value = "history";
syncGreatLakesLayerControls();
assert.equal(document.querySelector("[data-gl-forecast]").value, "0");
assert.equal(document.querySelector(".gl-target-controls").hidden, false);
layer.value = "wind";
syncGreatLakesLayerControls();
assert.equal(document.querySelector(".gl-target-controls").hidden, true);
const windColor = document.querySelector("[data-gl-wind-color]");
assert.equal(windColor.value, DEFAULT_WIND_PARTICLE_COLOR);
assert.equal(windColor.selectedOptions[0].textContent, "Cyan");
assert.doesNotMatch(windColor.innerHTML, /value="speed"/);
assert.equal(document.querySelector("#greatLakesConditions").classList.contains("has-wind-layer"), true);
