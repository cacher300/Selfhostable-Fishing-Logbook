import { readingHtml } from "./cards.js";
import { formatMapUnitValue } from "./app-units.js";
import { createParticleLayer, savedWindParticleColor, windParticleColorParts } from "./great-lakes-conditions.js";
import { windParticleFields } from "./wind-fields.js";

export { windParticleFields } from "./wind-fields.js";

let activeMap = null, payload = null, request = null, revision = 0, particleLayer = null;
let lastKey = "";
let forecastState = () => ({ hour: 0, history: false, animation: false });
const cache = new Map();

export function windEnabled() {
  return document.querySelector("[data-gl-layer]")?.value === "wind";
}

export function windSpeedLabel(value) {
  return formatMapUnitValue(value * 3.6, "speed", "kph", { decimals: 1 });
}

export function windReading(value) {
  if (!value?.available) return readingHtml({ label: "Wind", value: "Unavailable" });
  const direction = value.directionDegrees;
  const cardinal = direction === null ? "Calm" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(direction / 45) % 8];
  return readingHtml({ label: "Wind at 10 m", value: windSpeedLabel(value.speedMetersPerSecond),
    note: direction === null ? cardinal : `From ${cardinal} (${Math.round(direction)}°)`,
    rows: [["Gusts", windSpeedLabel(value.gustMetersPerSecond)], ["Forecast time", new Date(value.validTime).toLocaleString()]] });
}

function draw() {
  particleLayer?.remove();
  particleLayer = null;
  if (!payload || !activeMap || !windEnabled() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const fields = windParticleFields(payload.points || []);
  if (fields.length) particleLayer = createParticleLayer(activeMap, fields, {
    clipToGreatLakesWater: true,
    particleColor: windParticleColorParts(savedWindParticleColor())
  }).addTo(activeMap);
}

export function setupWind(map, getState) {
  activeMap = map;
  forecastState = getState;
  document.addEventListener("great-lakes-animation-state", () => refreshWind());
  document.addEventListener("great-lakes-wind-color-changed", (event) => {
    particleLayer?.setParticleColor(windParticleColorParts(event.detail?.color));
  });
}

export async function refreshWind() {
  const state = forecastState();
  const status = document.querySelector("[data-gl-wind-status]");
  const setStatus = (text) => { if (status) status.textContent = text; };
  if (!windEnabled() || state.history || state.animation) {
    ++revision;
    request?.abort();
    request = null;
    particleLayer?.remove();
    particleLayer = null;
    payload = null;
    lastKey = "";
    setStatus(windEnabled() && state.history ? "Wind forecast is available outside Past 90 days." : "");
    return null;
  }
  const key = `${state.hour}:${Math.floor(Date.now() / 600000)}`;
  if (payload && lastKey === key) { draw(); return payload; }
  const version = ++revision;
  request?.abort();
  request = new AbortController();
  particleLayer?.remove();
  particleLayer = null;
  payload = null;
  setStatus("Loading NOAA wind forecast…");
  try {
    const result = cache.get(key) || await window.noaaGreatLakesApi.conditions({ layer: "wind", forecastHour: state.hour, signal: request.signal });
    if (version !== revision) return null;
    cache.set(key, result);
    while (cache.size > 6) cache.delete(cache.keys().next().value);
    payload = result;
    lastKey = key;
    draw();
    setStatus(`NOAA GFS · 10 m wind · ${new Date(result.metadata.validTime).toLocaleString()}`);
    return result;
  } catch (error) {
    if (version === revision && error.name !== "AbortError") setStatus("NOAA wind forecast unavailable. Try again shortly.");
    return null;
  }
}
