import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";
installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
function setUnitSystem(system) { setState({ settings: { units: system === "metric" ? { waterTemperature: "C", speed: "kph" } : system === "nautical" ? { waterTemperature: "F", speed: "kn" } : { waterTemperature: "F", speed: "mph" } } }); }
const { windSpeedLabel, windReading, windParticleFields } = await import("../static/js/wind.js");
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
assert.deepEqual(windParticleFields([{latitude:43,longitude:-78,u:5,v:-2},{latitude:44,longitude:-77,u:NaN,v:1}]), [{points:[{latitude:43,longitude:-78,u:0.3,v:-0.12}]}]);
const windGrid = windParticleFields([
  { latitude: 43, longitude: -78, u: 0, v: 0 }, { latitude: 43, longitude: -77.75, u: 10, v: 0 },
  { latitude: 43.25, longitude: -78, u: 0, v: 20 }, { latitude: 43.25, longitude: -77.75, u: 10, v: 20 }
]);
const sampleWind = createCurrentFieldSampler(windGrid);
assert.equal(windGrid[0].rows, 2);
assert.equal(windGrid[0].columns, 2);
assert.ok(Math.abs(sampleWind(43.125, -77.875).u - 0.3) < 1e-6);
assert.ok(Math.abs(sampleWind(43.125, -77.875).v - 0.6) < 1e-6);
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
