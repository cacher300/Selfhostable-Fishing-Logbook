import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { convertUnitValue, currentChopRanges, formatUnitValue, unitPreference } from "./app-units.js";
import { depthRangeLabel, showWaterColumnDialog, thermoclineBand, thicknessLabel } from "./water-column.js";
import { createPaletteFilter, fitPaletteToView, paletteOverlays } from "./great-lakes-palette.js";
import { currentProfileActionHtml, directionIconHtml, profileActionHtml, readingHtml } from "./cards.js";
import {
  clearGreatLakesAnimationVisuals,
  greatLakesAnimationActive,
  greatLakesAnimationForecastHour,
  greatLakesTimelineHtml,
  loadGreatLakesAnimation,
  setupGreatLakesTimeline,
  stopGreatLakesAnimation
} from "./great-lakes-animation.js";

// NOAA Great Lakes OFS map layers. Temperature, thermocline depth, current
// speed, and wave height are server-rendered rasters clipped to NOAA's water
// mask; currents add an animated particle flow (or static arrows) on top of
// the speed shading, and waves add direction arrows.
export let greatLakesConditionsControl = null;
export let greatLakesConditionsLayer = null;
export let greatLakesConditionsRequest = null;
export let greatLakesActiveLayer = "";
export let greatLakesRasterReloadTimer = null;
export let greatLakesParticleLayer = null;
export let greatLakesLoadedModelsKey = "";
export let greatLakesLoadRevision = 0;
export const GREAT_LAKES_CLIENT_CACHE_MS = 10 * 60 * 1000;
export const GREAT_LAKES_MAX_DEPTH_METERS = 500;
export const GREAT_LAKES_DEPTH_SLIDER_MAX = 1000;
export const greatLakesPayloadCache = new Map();
export const CURRENT_BACKGROUND_STORAGE_KEY = "logbook.greatLakesCurrentBackground";
export const FLOW_COLOR_STORAGE_KEY = "logbook.greatLakesFlowColor";
// "speed" colours each flow line by its current speed (the speed legend's palette).
export const FLOW_COLOR_BY_SPEED = "speed";
export const FLOW_COLOR_OPTIONS = Object.freeze([
  [FLOW_COLOR_BY_SPEED, "By current speed"], ["#ffffff", "White"], ["#111827", "Black"], ["#9ca3af", "Grey"],
  ["#ef4444", "Red"], ["#2563eb", "Blue"], ["#facc15", "Yellow"], ["#22c55e", "Green"]
]);
export const CURRENT_BACKGROUND_OPTIONS = Object.freeze([["speed", "Current speed"], ["temperature", "Water temperature"], ["none", "None (map only)"]]);
export const DEFAULT_FLOW_COLOR = "#ffffff";
export let greatLakesFlowColor = DEFAULT_FLOW_COLOR;
export const WAVE_DISPLAY_STORAGE_KEY = "logbook.greatLakesWaveDisplay";
export let greatLakesWaveArrowLayer = null;
// Currents use one fixed raster resolution, so a temperature background
// matches it and does not need reloading (and restarting the flow) on zoom.
export const CURRENT_BACKGROUND_RESOLUTION = 512;
// One drawing per layer, forecast time, and depth: every lake at full detail.
// The server draws exactly this ahead of time, and the map never has to ask
// again when the view changes.
export const GREAT_LAKES_ALL_MODELS = Object.freeze(["LSOFS", "LMHOFS", "LEOFS", "LOOFS"]);
export const GREAT_LAKES_LAYER_RESOLUTION = 512;

export const GREAT_LAKES_MODEL_BOUNDS = {
  LSOFS: [[46.0, -93.5], [49.4, -83.5]],
  LMHOFS: [[41.2, -88.5], [46.8, -80.0]],
  LEOFS: [[41.0, -84.8], [43.5, -78.3]],
  LOOFS: [[42.4, -80.4], [44.7, -75.3]]
};
export const GREAT_LAKE_VIEWS = {
  Superior: { center: [47.7, -87.5], zoom: 7, models: ["LSOFS"] },
  Michigan: { center: [43.8, -87.1], zoom: 7, models: ["LMHOFS"] },
  Huron: { center: [44.8, -82.8], zoom: 7, models: ["LMHOFS"] },
  Erie: { center: [42.2, -81.7], zoom: 8, models: ["LEOFS"] },
  Ontario: { center: [43.7, -77.9], zoom: 8, models: ["LOOFS"] }
};

// "Past 30 days": the server keeps each hour's "Now" (never forecasts) for 30
// days. The map then shows the saved surface maps of the chosen hour, and
// point readings and stations come from that hour too.
export const HISTORY_FORECAST_VALUE = "history";
const HOUR_MS = 3600 * 1000;
export let greatLakesHistoryIndex = null;
export let greatLakesHistoryMs = null;
let greatLakesHistoryIndexAt = 0;
// A new hour is saved every hour; a list this old is fetched again on entering "Past 30 days".
const HISTORY_INDEX_MAX_AGE_MS = 2 * 60 * 1000;

export function greatLakesHistoryHtml() {
  const step = (hours, label, symbol) => html`<button type="button" data-gl-history-step="${hours}" aria-label="${label}" title="${label}">${symbol}</button>`;
  return html`<div class="great-lakes-history" data-gl-history-controls>
    <div class="great-lakes-history-picker">
      ${step(-24, "One day earlier", "«")}${step(-1, "One hour earlier", "‹")}
      <input type="datetime-local" data-gl-history-time step="3600" aria-label="Date and time to show" />
      ${step(1, "One hour later", "›")}${step(24, "One day later", "»")}
    </div>
  </div>`;
}

export function greatLakesHistoryMode() {
  return greatLakesControlValue("forecast") === HISTORY_FORECAST_VALUE;
}

export function historyIso(milliseconds) {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// The past hour on the map (ISO 8601), or null when showing "Now" or a forecast.
export function greatLakesHistoryTime() {
  return greatLakesHistoryMode() && Number.isFinite(greatLakesHistoryMs) ? historyIso(greatLakesHistoryMs) : null;
}

// Spread into API calls: `{ time }` for a past hour, nothing otherwise.
export function greatLakesTimeParams() {
  const time = greatLakesHistoryTime();
  return time ? { time } : {};
}

// Saved hours (milliseconds, oldest first) that have a map of `layer`.
export function historyHours(index, layer = "") {
  return (index?.hours || [])
    .filter((hour) => !layer || (hour.layers || []).includes(layer))
    .map((hour) => Date.parse(hour.time))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
}

export function nearestHistoryHour(hours, target) {
  if (!hours.length) return null;
  return hours.reduce((best, hour) => Math.abs(hour - target) < Math.abs(best - target) ? hour : best, hours[0]);
}

// Move by `stepHours`, landing on the saved hour nearest that time (always moving, if there is anywhere to go).
export function stepHistoryHour(hours, current, stepHours) {
  const ahead = hours.filter((hour) => (stepHours > 0 ? hour > current : hour < current));
  if (!ahead.length) return current;
  return nearestHistoryHour(ahead, current + stepHours * HOUR_MS);
}

const pad = (value) => String(value).padStart(2, "0");

// <input type="datetime-local"> values are local time without a zone.
export function localInputValue(milliseconds) {
  const date = new Date(milliseconds);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function setGreatLakesHistoryTime(value) {
  const milliseconds = typeof value === "number" ? value : Date.parse(value);
  greatLakesHistoryMs = Number.isFinite(milliseconds) ? Math.round(milliseconds / HOUR_MS) * HOUR_MS : null;
  syncHistoryInput();
}

export function syncHistoryInput() {
  const input = document.querySelector("[data-gl-history-time]");
  if (!input) return;
  const hours = historyHours(greatLakesHistoryIndex);
  if (hours.length) {
    input.min = localInputValue(hours[0]);
    input.max = localInputValue(hours[hours.length - 1]);
  }
  input.value = Number.isFinite(greatLakesHistoryMs) ? localInputValue(greatLakesHistoryMs) : "";
  document.querySelectorAll("[data-gl-history-step]").forEach((button) => {
    const step = Number(button.dataset.glHistoryStep);
    button.disabled = !Number.isFinite(greatLakesHistoryMs) || stepHistoryHour(hours, greatLakesHistoryMs, step) === greatLakesHistoryMs;
  });
}

export async function loadGreatLakesHistoryIndex({ fresh = false } = {}) {
  if (!fresh && greatLakesHistoryIndex && Date.now() - greatLakesHistoryIndexAt < HISTORY_INDEX_MAX_AGE_MS) return greatLakesHistoryIndex;
  try {
    greatLakesHistoryIndex = await window.noaaGreatLakesApi.history();
    greatLakesHistoryIndexAt = Date.now();
  } catch {
    greatLakesHistoryIndex ||= null;
  }
  return greatLakesHistoryIndex;
}

// Pick an hour on entering "Past 30 days" (the newest saved one), and snap to a saved hour.
async function ensureGreatLakesHistoryTime(layer) {
  const index = await loadGreatLakesHistoryIndex();
  const hours = historyHours(index, layer);
  if (!hours.length) return false;
  const target = Number.isFinite(greatLakesHistoryMs) ? greatLakesHistoryMs : hours[hours.length - 1];
  greatLakesHistoryMs = nearestHistoryHour(hours, target);
  syncHistoryInput();
  return true;
}

function announceHistoryTime() {
  document.dispatchEvent(new CustomEvent("great-lakes-history-time", { detail: { time: greatLakesHistoryTime() } }));
}

// "Thursday, Oct 2 at 3 PM": a past hour, always with its date.
export function historyTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString([], date.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  return `${day} at ${time}`;
}

export function greatLakesConditionsHtml() {
  return html`<section class="great-lakes-control" aria-label="Great Lakes Conditions">
    <label>Layer<select data-gl-layer><option value="" selected>None</option><option value="temperature">Surface temperature</option><option value="thermocline">Thermocline depth</option><option value="currents">Underwater currents</option><option value="waves">Waves</option></select></label>
    <label>Forecast<select data-gl-forecast><option value="0">Now</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="${HISTORY_FORECAST_VALUE}">Past 30 days</option></select></label>
    ${greatLakesHistoryHtml()}
    ${greatLakesTimelineHtml()}
    <label class="great-lakes-depth-control">Depth <output data-gl-depth-label>Surface</output><input data-gl-depth type="range" min="0" max="${GREAT_LAKES_DEPTH_SLIDER_MAX}" step="1" value="0" aria-label="Model depth, logarithmic scale" aria-valuetext="Surface" /></label>
    <div class="great-lakes-wave-options">
      <label>Wave direction<select data-gl-wave-display><option value="arrows"${savedWaveDisplay() === "arrows" ? " selected" : ""}>Arrows</option><option value="off"${savedWaveDisplay() === "off" ? " selected" : ""}>Off</option></select></label>
    </div>
    <div class="great-lakes-current-options">
      <label>Background<select data-gl-current-background>${currentBackgroundOptionsHtml(savedCurrentBackground())}</select></label>
      <label>Current display<select data-gl-current-display><option value="flow">Animated flow</option><option value="arrows">Static arrows</option></select></label>
      <label class="great-lakes-flow-color">Flow colour<select data-gl-flow-color aria-label="Current flow colour">${flowColorOptionsHtml(savedFlowColor())}</select></label>
      <label>Particle density<select data-gl-density><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label>
      <label>Animation speed<select data-gl-animation-speed><option value="slow">Slow</option><option value="normal" selected>Normal</option><option value="fast">Fast</option></select></label>
    </div>
    <div class="great-lakes-current-legend"><span data-gl-current-min>—</span><i></i><span data-gl-current-max>—</span></div>
    <p data-gl-status>Loading NOAA forecast…</p>
    <div class="great-lakes-legend"><span data-gl-temperature-min>—</span><i></i><span data-gl-temperature-max>—</span></div>
    <div class="great-lakes-thermocline-legend"><span data-gl-thermocline-min>—</span><i></i><span data-gl-thermocline-max>—</span></div>
    <div class="great-lakes-thermocline-mixed"><b aria-hidden="true"></b>Clear: no thermocline</div>
    <div class="great-lakes-wave-legend"><span data-gl-wave-min>—</span><i></i><span data-gl-wave-max>—</span></div>
    <fieldset class="great-lakes-points-options">
      <legend>Data points</legend>
      <label><input type="checkbox" data-gl-stations /> <span>Measurement stations</span></label>
      <label><input type="checkbox" data-gl-model-points /> <span>Model calculation points</span></label>
      <p data-gl-points-status role="status" aria-live="polite"></p>
    </fieldset>
  </section>`;
}

export function ensureGreatLakesLoadingIndicator() {
  const mapNode = document.querySelector("#fishMap");
  if (!mapNode || mapNode.querySelector("[data-gl-map-loading]")) return;
  insertHtml(mapNode, "beforeend", html`<div class="great-lakes-map-loading" data-gl-map-loading role="status" aria-live="polite" aria-hidden="true"><div class="great-lakes-map-loading-card"><span class="great-lakes-map-spinner" aria-hidden="true"></span><span data-gl-map-loading-text>Loading NOAA forecast…</span></div></div>`);
}

// A card in the middle of the map while data loads; it shows the same progress
// as the panel's status line ("Preparing the forecast animation… 40%").
export function setGreatLakesMapLoading(isLoading, message = "Loading NOAA forecast…") {
  setMapLoadingReason("layer", isLoading, message);
}

// Everything the map is waiting for (lake data, the first map tiles), with the
// message for each; the card stays up until all of them are done.
const mapLoadingReasons = new Map();

export function setMapLoadingReason(reason, isLoading, message) {
  ensureGreatLakesLoadingIndicator();
  const mapNode = document.querySelector("#fishMap");
  const indicator = mapNode?.querySelector("[data-gl-map-loading]");
  const text = indicator?.querySelector("[data-gl-map-loading-text]");
  const started = isLoading && !mapLoadingReasons.has(reason);
  if (isLoading) { if (started) mapLoadingReasons.set(reason, message); }
  else mapLoadingReasons.delete(reason);
  const busy = mapLoadingReasons.size > 0;
  if (text && started) text.textContent = message;
  else if (text && !isLoading && busy) text.textContent = [...mapLoadingReasons.values()].at(-1);
  mapNode?.classList.toggle("is-great-lakes-loading", busy);
  mapNode?.setAttribute("aria-busy", String(busy));
  indicator?.setAttribute("aria-hidden", String(!busy));
}

export function greatLakesHomeLake() {
  return typeof state !== "undefined" && GREAT_LAKE_VIEWS[state.settings?.defaultHomeLake] ? state.settings.defaultHomeLake : "";
}

export function greatLakesDepthLabel(meters) {
  if (!Number.isFinite(Number(meters)) || Number(meters) <= 0.25) return "Surface";
  return typeof formatUnitValue === "function" ? formatUnitValue(meters, "depth", "m", { decimals: 0 }) : `${meters} m`;
}

export function greatLakesDepthValueLabel(meters) {
  if (!Number.isFinite(Number(meters))) return "—";
  return typeof formatUnitValue === "function" ? formatUnitValue(meters, "depth", "m", { decimals: 0 }) : `${Math.round(meters)} m`;
}

// The slider is logarithmic, flattened near the surface by this many metres so
// shallow water does not take up most of the bar: a quarter of the way along is
// about 12 m (40 ft), halfway about 49 m, and the end 500 m.
export const GREAT_LAKES_DEPTH_SLIDER_CURVE_METERS = 6;

export function greatLakesDepthFromSlider(value) {
  const position = Math.max(0, Math.min(GREAT_LAKES_DEPTH_SLIDER_MAX, Number(value) || 0));
  if (position <= 0) return 0;
  const curve = GREAT_LAKES_DEPTH_SLIDER_CURVE_METERS;
  const meters = curve * Math.expm1(Math.log1p(GREAT_LAKES_MAX_DEPTH_METERS / curve) * position / GREAT_LAKES_DEPTH_SLIDER_MAX);
  return Math.round(meters * 10) / 10;
}

export function waterTemperatureLabel(temperatureC) {
  return typeof formatUnitValue === "function" ? formatUnitValue(temperatureC, "waterTemperature", "C", { decimals: 1 }) : `${temperatureC.toFixed(1)} °C`;
}

export function thermoclineGradientLabel(gradientCPerMeter) {
  const temperatureUnit = typeof unitPreference === "function" ? unitPreference("waterTemperature") : "C";
  const depthUnit = typeof unitPreference === "function" ? unitPreference("depth") : "m";
  const temperatureFactor = temperatureUnit === "F" ? 1.8 : 1;
  const depthFactor = depthUnit === "ft" ? 3.28084 : 1;
  return `${(gradientCPerMeter * temperatureFactor / depthFactor).toFixed(2)} °${temperatureUnit}/${depthUnit}`;
}

export function currentSpeedLabel(metersPerSecond) {
  if (!Number.isFinite(Number(metersPerSecond))) return "—";
  const unit = typeof unitPreference === "function" ? unitPreference("speed") : "m/s";
  const factors = { kph: 3.6, mph: 2.236936, kn: 1.943844 };
  const value = Number(metersPerSecond) * (factors[unit] || 1);
  // Rounded values just under 0.1 would otherwise show as "0.10" next to "0.1".
  const decimals = value === 0 ? 0 : value < 0.095 ? 2 : value < 9.95 ? 1 : 0;
  return `${value.toFixed(decimals)} ${unit}`;
}

export function greatLakesDepthAxisUnit() {
  return greatLakesDepthLabel(1).match(/(ft|m)$/i)?.[1] || "m";
}

export function greatLakesDepthAxisTick(depth) {
  if (depth <= 0.25) return "Surface";
  return greatLakesDepthLabel(depth).replace(/\s*(?:ft|m)$/i, "");
}

export function ensureGreatLakesConditions(map) {
  if (greatLakesConditionsControl) return;
  greatLakesConditionsLayer = L.layerGroup().addTo(map);
  ensureGreatLakesLoadingIndicator();
  const host = document.querySelector("#greatLakesConditions");
  if (!host) return;
  setHtml(host, greatLakesConditionsHtml());
  applyFlowColor(savedFlowColor());
  const syncLayerSpecificControls = () => syncGreatLakesLayerControls(host);
  syncLayerSpecificControls();
  host.querySelectorAll("select").forEach((select) => select.addEventListener("change", () => {
    // The animation's own speed choice only changes its timing (great-lakes-animation.js).
    if (select.matches("[data-gl-animation-speed-choice]")) return;
    if (select.matches("[data-gl-flow-color]")) {
      onFlowColorChange(map, host, select.value);
      return;
    }
    if (select.matches("[data-gl-layer], [data-gl-current-background], [data-gl-forecast]")) syncLayerSpecificControls();
    if (select.matches("[data-gl-current-background]")) storeCurrentBackground(select.value);
    if (select.matches("[data-gl-wave-display]")) {
      try { localStorage.setItem(WAVE_DISPLAY_STORAGE_KEY, select.value); } catch { /* storage unavailable */ }
    }
    // Picking a forecast time ends the animation; other choices change what it animates.
    if (select.matches("[data-gl-forecast]")) stopGreatLakesAnimation();
    loadGreatLakesConditions(map);
  }));
  const depthSlider = host.querySelector("[data-gl-depth]");
  const syncDepthLabel = () => {
    const depth = greatLakesDepthFromSlider(depthSlider.value);
    const label = depth ? greatLakesDepthLabel(depth) : "Surface";
    host.querySelector("[data-gl-depth-label]").textContent = label;
    depthSlider.setAttribute("aria-valuetext", label);
  };
  depthSlider.addEventListener("input", syncDepthLabel);
  depthSlider.addEventListener("change", () => loadGreatLakesConditions(map));
  setupGreatLakesTimeline(host, () => loadGreatLakesConditions(map));
  setupGreatLakesHistoryControls(host, map);
  greatLakesConditionsControl = host;
  // Layers always cover every lake at full detail, so panning and zooming
  // never request (or wait for) a different drawing.
  if (map._loaded) loadGreatLakesConditions(map);
  else map.once("load", () => loadGreatLakesConditions(map));
  setInterval(() => refreshGreatLakesIfStale(map), GREAT_LAKES_STATUS_POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshGreatLakesIfStale(map); });
}

// The hour buttons and the date picker of "Past 30 days".
export function setupGreatLakesHistoryControls(host, map) {
  const input = host.querySelector("[data-gl-history-time]");
  const show = (milliseconds) => {
    if (!Number.isFinite(milliseconds) || milliseconds === greatLakesHistoryMs) {
      syncHistoryInput();
      return;
    }
    greatLakesHistoryMs = milliseconds;
    syncHistoryInput();
    loadGreatLakesConditions(map);
  };
  host.querySelectorAll("[data-gl-history-step]").forEach((button) => button.addEventListener("click", () => {
    const hours = historyHours(greatLakesHistoryIndex, greatLakesControlValue("layer"));
    show(stepHistoryHour(hours, greatLakesHistoryMs, Number(button.dataset.glHistoryStep)));
  }));
  input?.addEventListener("change", () => {
    const chosen = new Date(input.value).getTime();
    show(nearestHistoryHour(historyHours(greatLakesHistoryIndex, greatLakesControlValue("layer")), chosen));
  });
}

export function syncGreatLakesLayerControls(host = document.querySelector("#greatLakesConditions")) {
  if (!host) return;
  const layer = host.querySelector("[data-gl-layer]")?.value;
  host.classList.toggle("has-history", host.querySelector("[data-gl-forecast]")?.value === HISTORY_FORECAST_VALUE);
  host.classList.toggle("has-current-layer", layer === "currents");
  host.classList.toggle("has-temperature-layer", layer === "temperature");
  host.classList.toggle("has-thermocline-layer", layer === "thermocline");
  host.classList.toggle("has-wave-layer", layer === "waves");
  const background = host.querySelector("[data-gl-current-background]")?.value;
  host.classList.toggle("has-temperature-background", layer === "currents" && background === "temperature");
  host.classList.toggle("has-no-background", layer === "currents" && background === "none");
  host.classList.toggle("has-speed-flow", layer === "currents" && host.querySelector("[data-gl-flow-color]")?.value === FLOW_COLOR_BY_SPEED);
}

export function savedWaveDisplay() {
  try { return localStorage.getItem(WAVE_DISPLAY_STORAGE_KEY) === "off" ? "off" : "arrows"; } catch { return "arrows"; }
}

export function waveHeightLabel(meters) {
  if (!Number.isFinite(Number(meters))) return "—";
  return typeof formatUnitValue === "function" ? formatUnitValue(Number(meters), "waveHeight", "m", { decimals: 1 }) : `${Number(meters).toFixed(1)} m`;
}

// The same chop categories the trip editor uses (Settings → chop ranges).
export function waveChopLabel(meters) {
  const feet = convertUnitValue(Number(meters), "m", "ft");
  if (!Number.isFinite(feet)) return "";
  const ranges = currentChopRanges();
  const bounded = ranges.find((range) => range.maxFeet !== null && feet <= Number(range.maxFeet));
  return (bounded || ranges.find((range) => range.maxFeet === null) || ranges.at(-1))?.label || "";
}

// NOAA reports where waves come *from*; arrows point the way they travel.
export function waveTravelDegrees(fromDegrees) {
  return ((Number(fromDegrees) + 180) % 360 + 360) % 360;
}

export function waveDirectionText(fromDegrees) {
  if (!Number.isFinite(Number(fromDegrees))) return "";
  const degrees = Math.round(Number(fromDegrees)) % 360;
  return `From ${currentDirectionLabel(degrees)} (${degrees}°)`;
}

export function savedCurrentBackground() {
  try {
    const saved = localStorage.getItem(CURRENT_BACKGROUND_STORAGE_KEY);
    return CURRENT_BACKGROUND_OPTIONS.some(([value]) => value === saved) ? saved : "speed";
  } catch { return "speed"; }
}

export function storeCurrentBackground(value) {
  try { localStorage.setItem(CURRENT_BACKGROUND_STORAGE_KEY, value); } catch { /* storage unavailable */ }
}

export function currentBackgroundOptionsHtml(selected) {
  return joinHtml(CURRENT_BACKGROUND_OPTIONS.map(([value, label]) => html`<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`), "");
}

export function flowColorOptionsHtml(selected) {
  return joinHtml(FLOW_COLOR_OPTIONS.map(([value, label]) => html`<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`), "");
}

// Only the listed colours are offered; anything else (including colours saved
// by the earlier free colour picker) falls back to white.
export function normalizedFlowColor(value) {
  const text = String(value || "").toLowerCase();
  return FLOW_COLOR_OPTIONS.some(([option]) => option === text) ? text : DEFAULT_FLOW_COLOR;
}

export function savedFlowColor() {
  try { return normalizedFlowColor(localStorage.getItem(FLOW_COLOR_STORAGE_KEY)); } catch { return DEFAULT_FLOW_COLOR; }
}

// The trail keeps a contrasting outline so every colour stays readable over
// both the light basemap and the bright temperature colours. Speed colours
// get a dark outline.
export function flowColorParts(color) {
  const value = normalizedFlowColor(color);
  if (value === FLOW_COLOR_BY_SPEED) return { rgb: "255, 255, 255", halo: "6, 16, 34", bySpeed: true };
  const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return { rgb: `${red}, ${green}, ${blue}`, halo: luminance > 0.5 ? "6, 16, 34" : "255, 255, 255", bySpeed: false };
}

export function applyFlowColor(color) {
  greatLakesFlowColor = normalizedFlowColor(color);
  const { rgb, halo } = flowColorParts(greatLakesFlowColor);
  const mapNode = document.querySelector("#fishMap");
  mapNode?.style.setProperty("--gl-flow-color", `rgb(${rgb})`);
  mapNode?.style.setProperty("--gl-flow-halo", `rgba(${halo}, 0.72)`);
}

// Animated flow reads the colour every frame, so a solid colour applies
// without reloading. Speed colours on top of speed shading would vanish into
// the same palette, so choosing them switches the background to the map.
export function onFlowColorChange(map, host, value) {
  const previous = greatLakesFlowColor;
  applyFlowColor(value);
  try { localStorage.setItem(FLOW_COLOR_STORAGE_KEY, greatLakesFlowColor); } catch { /* storage unavailable */ }
  const background = host.querySelector("[data-gl-current-background]");
  let reload = greatLakesControlValue("current-display") === "arrows" && (previous === FLOW_COLOR_BY_SPEED) !== (greatLakesFlowColor === FLOW_COLOR_BY_SPEED);
  if (greatLakesFlowColor === FLOW_COLOR_BY_SPEED && background?.value === "speed") {
    background.value = "none";
    storeCurrentBackground("none");
    reload = true;
  }
  syncGreatLakesLayerControls(host);
  if (reload) loadGreatLakesConditions(map);
}

export function renderGreatLakesConditionsHost() {
  const host = document.querySelector("#greatLakesConditions");
  if (host && !host.querySelector("[data-gl-layer]")) {
    setHtml(host, greatLakesConditionsHtml());
    syncGreatLakesLayerControls(host);
  }
  return host;
}

export function greatLakesModelsForView(map) {
  const view = map.getBounds();
  return Object.entries(GREAT_LAKES_MODEL_BOUNDS)
    .filter(([, [[south, west], [north, east]]]) => view.getNorth() >= south && view.getSouth() <= north && view.getEast() >= west && view.getWest() <= east)
    .map(([model]) => model);
}

export function greatLakesControlValue(name) {
  const control = document.querySelector(`[data-gl-${name}]`);
  if (name === "depth" && control) return String(greatLakesDepthFromSlider(control.value));
  return control ? control.value : (name === "layer" ? "" : "0");
}

// The time the map shows: the animation frame on screen, otherwise the forecast choice ("Now" for a past hour; see greatLakesTimeParams).
export function greatLakesForecastHour() {
  if (greatLakesHistoryMode()) return "0";
  return greatLakesAnimationForecastHour() ?? greatLakesControlValue("forecast");
}

// Saved past maps are surface only.
export function greatLakesShownDepth() {
  return greatLakesHistoryMode() ? "0" : greatLakesControlValue("depth");
}

export function setGreatLakesStatus(message, error = false) {
  const loadingText = document.querySelector("[data-gl-map-loading-text]");
  if (loadingText && !error) loadingText.textContent = message;
  const node = document.querySelector("[data-gl-status]");
  if (node) {
    node.textContent = message;
    node.classList.toggle("is-error", error);
  }
}

export function setThermoclineLegendRange(metadata = {}) {
  const minimum = document.querySelector("[data-gl-thermocline-min]");
  const maximum = document.querySelector("[data-gl-thermocline-max]");
  if (minimum) minimum.textContent = greatLakesDepthValueLabel(Number(metadata.minDepthMeters));
  if (maximum) maximum.textContent = greatLakesDepthValueLabel(Number(metadata.maxDepthMeters));
}

export function setTemperatureLegendRange(metadata = {}) {
  const minimum = document.querySelector("[data-gl-temperature-min]");
  const maximum = document.querySelector("[data-gl-temperature-max]");
  if (minimum) minimum.textContent = Number.isFinite(Number(metadata.minC)) ? waterTemperatureLabel(Number(metadata.minC)) : "—";
  if (maximum) maximum.textContent = Number.isFinite(Number(metadata.maxC)) ? waterTemperatureLabel(Number(metadata.maxC)) : "—";
}

export function setCurrentLegendRange(metadata = {}) {
  const minimum = document.querySelector("[data-gl-current-min]");
  const maximum = document.querySelector("[data-gl-current-max]");
  if (minimum) minimum.textContent = currentSpeedLabel(Number(metadata.minSpeedMetersPerSecond));
  if (maximum) maximum.textContent = currentSpeedLabel(Number(metadata.maxSpeedMetersPerSecond));
}

export function setWaveLegendRange(metadata = {}) {
  const minimum = document.querySelector("[data-gl-wave-min]");
  const maximum = document.querySelector("[data-gl-wave-max]");
  if (minimum) minimum.textContent = Number(metadata.minHeightMeters) > 0 ? waveHeightLabel(metadata.minHeightMeters) : "Calm";
  if (maximum) maximum.textContent = waveHeightLabel(metadata.maxHeightMeters);
}

// The layer's colours follow what is on screen (great-lakes-palette.js); null without a layer.
export let greatLakesPaletteFit = null;

// Legends, flow colours, and station dots follow the colour range on screen.
export function showPaletteRange(kind, low, high) {
  if (kind === "temperature") setTemperatureLegendRange({ minC: low, maxC: high });
  else if (kind === "thermocline") setThermoclineLegendRange({ minDepthMeters: low, maxDepthMeters: high });
  else if (kind === "waves") setWaveLegendRange({ minHeightMeters: low, maxHeightMeters: high });
  else {
    setCurrentLegendRange({ minSpeedMetersPerSecond: low, maxSpeedMetersPerSecond: high });
    setCurrentSpeedMax({ maxSpeedMetersPerSecond: high });
  }
  document.dispatchEvent(new CustomEvent("great-lakes-palette-range", { detail: { kind, minimum: low, maximum: high, depth: Number(greatLakesShownDepth()) || 0 } }));
}

export function stopPaletteFit() {
  greatLakesPaletteFit?.stop();
  greatLakesPaletteFit = null;
}

// A layer's lake images, coloured to fit what is on screen.
function drawPaletteRasters(rasters, kind, options) {
  stopPaletteFit();
  const filter = createPaletteFilter();
  paletteOverlays(rasters, filter, { ...options, interactive: false }).forEach((overlay) => overlay.addTo(greatLakesConditionsLayer));
  greatLakesPaletteFit = fitPaletteToView(greatLakesConditionsLayer._map, [rasters], kind, filter, (low, high) => showPaletteRange(kind, low, high));
}

export function renderGreatLakesWaveRasters(rasters, loadRevision) {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== "waves") return;
  drawPaletteRasters(rasters, "waves", { opacity: 0.86, className: "great-lakes-wave-raster" });
}

// About one arrow per this many screen pixels, whatever the zoom.
export const WAVE_ARROW_SPACING_PX = 54;

// Keep the arrow nearest each screen cell's centre so spacing stays even.
export function thinWaveArrows(arrows, project, bounds, spacing = WAVE_ARROW_SPACING_PX) {
  const chosen = new Map();
  arrows.forEach((arrow) => {
    if (bounds && !bounds.contains([arrow.latitude, arrow.longitude])) return;
    const point = project(arrow);
    const column = Math.floor(point.x / spacing), row = Math.floor(point.y / spacing);
    const key = `${column}:${row}`;
    const offset = Math.hypot(point.x - (column + 0.5) * spacing, point.y - (row + 0.5) * spacing);
    const existing = chosen.get(key);
    if (!existing || offset < existing.offset) chosen.set(key, { arrow, offset });
  });
  return [...chosen.values()].map((item) => item.arrow);
}

export function createWaveArrowLayer(map, arrows) {
  const group = L.layerGroup();
  const draw = () => {
    group.clearLayers();
    const bounds = map.getBounds().pad(0.1);
    const zoom = map.getZoom();
    thinWaveArrows(arrows, (arrow) => map.project([arrow.latitude, arrow.longitude], zoom), bounds).forEach((arrow) => {
      const size = Math.round(Math.max(16, Math.min(34, 16 + arrow.heightMeters * 7)));
      const icon = L.divIcon({
        className: "great-lakes-wave-arrow",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: html`<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${Math.round(waveTravelDegrees(arrow.directionDegrees))}deg)" aria-hidden="true"><path d="M12 2.5 18.5 11h-4.2v10.5H9.7V11H5.5Z"/></svg>`
      });
      L.marker([arrow.latitude, arrow.longitude], { icon, interactive: false, keyboard: false }).addTo(group);
    });
  };
  const originalOnAdd = group.onAdd.bind(group);
  const originalOnRemove = group.onRemove.bind(group);
  group.onAdd = (target) => {
    originalOnAdd(target);
    draw();
    map.on("zoomend moveend", draw);
  };
  group.onRemove = (target) => {
    map.off("zoomend moveend", draw);
    originalOnRemove(target);
  };
  return group;
}

export function renderGreatLakesTemperatureRasters(rasters, loadRevision, expectedLayer = "temperature") {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== expectedLayer) return;
  drawPaletteRasters(rasters, "temperature", { opacity: 0.9, className: "great-lakes-temperature-raster" });
}

export function renderGreatLakesThermoclineRasters(rasters, loadRevision) {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== "thermocline") return;
  drawPaletteRasters(rasters, "thermocline", { opacity: 0.88, className: "great-lakes-thermocline-raster" });
}

export function renderGreatLakesCurrentRasters(rasters, loadRevision) {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== "currents") return;
  drawPaletteRasters(rasters, "currents", { opacity: 0.8, className: "great-lakes-current-raster" });
}

export function clearGreatLakesVisuals() {
  stopPaletteFit();
  clearGreatLakesAnimationVisuals();
  greatLakesParticleLayer?.remove();
  greatLakesParticleLayer = null;
  greatLakesWaveArrowLayer?.remove();
  greatLakesWaveArrowLayer = null;
  greatLakesConditionsLayer.clearLayers();
  document.querySelectorAll(".great-lakes-temperature-raster, .great-lakes-thermocline-raster, .great-lakes-current-raster, .great-lakes-wave-raster").forEach((image) => image.remove());
}

export function renderGreatLakesCurrents(points, zoom, target = greatLakesConditionsLayer) {
  const stride = zoom <= 5 ? 12 : zoom <= 7 ? 8 : zoom <= 9 ? 5 : 3;
  const bySpeed = greatLakesFlowColor === FLOW_COLOR_BY_SPEED;
  points.filter((_, index) => index % stride === 0).forEach((point) => {
    const size = Math.round(Math.max(14, Math.min(30, 14 + point.speed * 50)));
    const fill = bySpeed ? `;fill:${paletteColor(point.speed / greatLakesCurrentSpeedMax, CURRENT_FLOW_SPEED_COLOR_STOPS)}` : "";
    const icon = L.divIcon({ className: "great-lakes-current-arrow", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: html`<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${Math.round(point.direction)}deg)${fill}" aria-hidden="true"><path d="M12 2.5 19 20.5 12 16.2 5 20.5Z"/></svg>` });
    L.marker([point.latitude, point.longitude], { icon, interactive: false, keyboard: false }).addTo(target);
  });
}

// Mirror TEMPERATURE_COLOR_STOPS / CURRENT_SPEED_COLOR_STOPS in backend/great_lakes_render.py.
export const TEMPERATURE_COLOR_STOPS = [
  [0, [58, 40, 168]], [0.13, [36, 92, 226]], [0.27, [14, 152, 242]], [0.4, [12, 204, 222]],
  [0.53, [34, 208, 136]], [0.66, [150, 222, 48]], [0.78, [252, 218, 36]], [0.89, [252, 140, 28]], [1, [228, 40, 52]]
];
export const CURRENT_SPEED_COLOR_STOPS = [
  [0, [22, 58, 128]], [0.22, [40, 92, 178]], [0.45, [98, 70, 186]],
  [0.68, [172, 60, 170]], [0.86, [232, 86, 118]], [1, [252, 158, 72]]
];
export const CURRENT_COLOR_MAX_METERS_PER_SECOND = 0.5;
// Speed-coloured flow lines: brighter than the speed shading so slow (most)
// water is still visible over the map and over temperature colours.
export const CURRENT_FLOW_SPEED_COLOR_STOPS = [
  [0, [125, 225, 255]], [0.25, [70, 232, 160]], [0.5, [250, 232, 60]], [0.75, [255, 146, 40]], [1, [255, 56, 96]]
];
// Speed-coloured flow uses the loaded layer's legend range so lines match it.
export let greatLakesCurrentSpeedMax = CURRENT_COLOR_MAX_METERS_PER_SECOND;
export const SPEED_FLOW_COLOR_BINS = 10;

export function paletteRgb(position, stops) {
  const clamped = Math.max(0, Math.min(1, Number(position) || 0));
  const upper = stops.findIndex(([stop]) => clamped <= stop);
  const [highStop, highColor] = stops[Math.max(0, upper)];
  const [lowStop, lowColor] = stops[Math.max(0, upper - 1)];
  const fraction = highStop === lowStop ? 0 : (clamped - lowStop) / (highStop - lowStop);
  return lowColor.map((channel, index) => Math.round(channel + (highColor[index] - channel) * fraction)).join(", ");
}

export function paletteColor(position, stops) {
  return `rgb(${paletteRgb(position, stops)})`;
}

export function setCurrentSpeedMax(metadata = {}) {
  const maximum = Number(metadata.maxSpeedMetersPerSecond);
  greatLakesCurrentSpeedMax = Number.isFinite(maximum) && maximum > 0 ? maximum : CURRENT_COLOR_MAX_METERS_PER_SECOND;
}

// Palette bin for a speed: lines are drawn in a few batches, one per bin.
export function speedColorBin(speed, maximum = greatLakesCurrentSpeedMax, bins = SPEED_FLOW_COLOR_BINS) {
  return Math.max(0, Math.min(bins - 1, Math.floor((Number(speed) || 0) / maximum * bins)));
}

export function speedBinColors(bins = SPEED_FLOW_COLOR_BINS) {
  return Array.from({ length: bins }, (_, bin) => paletteRgb((bin + 0.5) / bins, CURRENT_FLOW_SPEED_COLOR_STOPS));
}

export function currentColor(speed) {
  return paletteColor((Number(speed) || 0) / CURRENT_COLOR_MAX_METERS_PER_SECOND, CURRENT_SPEED_COLOR_STOPS);
}

export function currentDirectionLabel(degrees) {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(degrees / 22.5) % points.length];
}

export function currentProfileDepthLabel(meters) {
  if (meters <= 0.25) return "Surface";
  return typeof formatUnitValue === "function"
    ? formatUnitValue(meters, "depth", "m", { decimals: meters < 10 ? 1 : 0 })
    : `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
}

export function currentProfileHtml(profile, selectedDepthMeters) {
  const values = (profile.values || []).filter((value) => [value.depthMeters, value.speedMetersPerSecond, value.directionDegrees].every(Number.isFinite));
  if (!values.length) return html`<p class="great-lakes-current-empty">No current profile is available at this point. Try another point on the lake.</p>`;
  const selectedDepth = Number(selectedDepthMeters) || 0;
  const closest = values.reduce((best, value, index) => Math.abs(value.depthMeters - selectedDepth) < Math.abs(values[best].depthMeters - selectedDepth) ? index : best, 0);
  const maximumSpeed = Math.max(...values.map((value) => value.speedMetersPerSecond), 0.01);
  const time = profile.historyTime ? historyTimeLabel(profile.validTime || profile.historyTime) : friendlyTime(profile.validTime);
  const distance = Number.isFinite(profile.sampleDistanceKm) ? ` · Model point ${profile.sampleDistanceKm.toFixed(1)} km away` : "";
  const rows = joinHtml(values.map((value, index) => {
    const speed = value.speedMetersPerSecond;
    const bearing = Math.round(value.directionDegrees) % 360;
    const direction = speed < 0.001 ? "Still" : `Toward ${currentDirectionLabel(value.directionDegrees)} · ${bearing}°`;
    const width = speed ? Math.max(3, speed / maximumSpeed * 100) : 0;
    const arrow = speed < 0.001 ? "" : html`<svg viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate(${bearing}deg)"><path d="M10 17V3m0 0L5 8m5-5 5 5" /></svg>`;
    return html`<div class="great-lakes-current-row${index === closest ? " is-closest" : ""}" role="listitem" aria-label="${currentProfileDepthLabel(value.depthMeters)}: ${currentSpeedLabel(speed)}, ${direction}">
      <span class="great-lakes-current-depth">${currentProfileDepthLabel(value.depthMeters)}</span>
      <span class="great-lakes-current-track" aria-hidden="true"><i style="width:${width}%;background:${currentColor(speed)}"></i></span>
      <strong>${currentSpeedLabel(speed)}</strong>
      <span class="great-lakes-current-direction">${arrow}${speed < 0.001 ? "Still" : html`<span><span class="great-lakes-current-toward">Toward </span>${currentDirectionLabel(value.directionDegrees)} <small>${bearing}°</small></span>`}</span>
    </div>`;
  }), "");
  const source = profile.historyTime ? "Saved NOAA conditions" : "NOAA forecast";
  const surfaceOnly = profile.surfaceOnly ? " · Surface only for past hours" : "";
  return html`<p class="great-lakes-current-meta">${time ? `${source} for ${time}` : source}${distance}${surfaceOnly}</p>
    <div class="great-lakes-current-chart" role="list" aria-label="Current speed and direction by depth">${rows}</div>`;
}

export async function showGreatLakesCurrentProfile({ latitude, longitude }) {
  document.querySelector(".great-lakes-current-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "great-lakes-current-dialog";
  setHtml(dialog, html`<form method="dialog"><button class="icon-button" aria-label="Close current profile">×</button></form><h3>Underwater current by depth</h3><div data-gl-current-profile-content role="status">Loading NOAA current profile…</div>`);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  const selectedDepth = greatLakesShownDepth();
  try {
    const profile = await window.noaaGreatLakesApi.currentProfile({ forecastHour: greatLakesForecastHour(), latitude, longitude, models: greatLakesLoadedModelsKey, ...greatLakesTimeParams() });
    if (dialog.isConnected) {
      const content = dialog.querySelector("[data-gl-current-profile-content]");
      content.removeAttribute("role");
      setHtml(content, profile.available ? currentProfileHtml(profile, selectedDepth) : html`<p class="great-lakes-current-empty">No current profile is available at this point. Try another point on the lake.</p>`);
    }
  } catch {
    if (dialog.isConnected) dialog.querySelector("[data-gl-current-profile-content]").textContent = "NOAA current data is unavailable. Close this view and try again shortly.";
  }
}

export async function greatLakesMapInspection({ latitude, longitude }) {
  if (!greatLakesActiveLayer) return "";
  const depth = greatLakesShownDepth(), forecastHour = greatLakesForecastHour();
  const models = greatLakesLoadedModelsKey, timeParams = greatLakesTimeParams();
  const temperatureLabel = (value) => Number(value.depthMeters) > 0.25 ? `Temperature at ${greatLakesDepthLabel(Number(value.depthMeters))}` : "Surface temperature";
  if (greatLakesActiveLayer === "waves") {
    const value = await window.noaaGreatLakesApi.waveValue({ forecastHour, latitude, longitude, ...timeParams }).catch(() => null);
    if (!value?.available) return "";
    return readingHtml({
      label: "Wave height",
      value: waveHeightLabel(value.heightMeters),
      note: waveChopLabel(value.heightMeters),
      rows: [
        ["Period", Number.isFinite(Number(value.periodSeconds)) ? `${Number(value.periodSeconds).toFixed(0)} s` : ""],
        ["Coming from", Number.isFinite(Number(value.directionDegrees)) ? waveDirectionText(value.directionDegrees).replace(/^From /, "") : ""]
      ]
    });
  }
  if (greatLakesActiveLayer === "currents") {
    const wantsTemperature = greatLakesControlValue("current-background") === "temperature";
    const [current, temperatureValue] = await Promise.all([
      window.noaaGreatLakesApi.currentProfile({ forecastHour, latitude, longitude, models, ...timeParams }).catch(() => null),
      wantsTemperature ? window.noaaGreatLakesApi.temperatureValue({ forecastHour, depth, resolution: CURRENT_BACKGROUND_RESOLUTION, latitude, longitude, models, ...timeParams }).catch(() => null) : null
    ]);
    const values = current?.available ? (current.values || []).filter((value) => Number.isFinite(value.speedMetersPerSecond)) : [];
    if (!values.length) return "";
    const selected = values.reduce((best, value) => Math.abs(value.depthMeters - Number(depth)) < Math.abs(best.depthMeters - Number(depth)) ? value : best, values[0]);
    const speed = selected.speedMetersPerSecond;
    const still = speed < 0.001;
    return readingHtml({
      label: Number(selected.depthMeters) > 0.25 ? `Current at ${currentProfileDepthLabel(selected.depthMeters)}` : "Surface current",
      value: currentSpeedLabel(speed),
      icon: still ? "" : directionIconHtml(selected.directionDegrees),
      note: still ? "Still" : `Toward ${currentDirectionLabel(selected.directionDegrees)} · ${Math.round(selected.directionDegrees) % 360}°`,
      rows: [temperatureValue?.available ? [temperatureLabel(temperatureValue), waterTemperatureLabel(temperatureValue.temperatureC)] : null],
      action: currentProfileActionHtml(latitude, longitude)
    });
  }
  const resolution = GREAT_LAKES_LAYER_RESOLUTION;
  try {
    if (greatLakesActiveLayer === "thermocline") {
      const profile = await window.noaaGreatLakesApi.profile({ forecastHour, latitude, longitude, models, ...timeParams });
      if (!profile?.available) return "";
      const surface = (profile.values || [])[0];
      const band = thermoclineBand(profile.thermocline);
      return readingHtml({
        label: "Thermocline",
        value: band ? greatLakesDepthLabel(band.top) : "None",
        note: band ? `Down to ${greatLakesDepthLabel(band.bottom)} · ${thicknessLabel(band)}` : profile.noThermocline === "gradual" ? "" : "Mixed top to bottom",
        rows: [surface ? ["Surface temperature", waterTemperatureLabel(surface.temperatureC)] : null],
        action: profileActionHtml(latitude, longitude)
      });
    }
    const [value, profile] = await Promise.all([
      window.noaaGreatLakesApi.temperatureValue({ forecastHour, depth, resolution, latitude, longitude, models, ...timeParams }),
      window.noaaGreatLakesApi.profile({ forecastHour, latitude, longitude, models, ...timeParams }).catch(() => null)
    ]);
    if (!value.available) return "";
    return readingHtml({
      label: temperatureLabel(value),
      value: waterTemperatureLabel(value.temperatureC),
      rows: [profile?.available ? ["Thermocline", thermoclineRangeLabel(profile.thermocline, profile.noThermocline)] : null],
      action: profileActionHtml(latitude, longitude)
    });
  } catch { return ""; }
}

// "55–66 ft" for a card row; "None (mixed)" or "None" without a thermocline.
export function thermoclineRangeLabel(thermocline, noThermocline) {
  return depthRangeLabel(thermoclineBand(thermocline)) || (noThermocline === "gradual" ? "None" : "None (mixed)");
}

export const CURRENT_TRAIL_SEGMENTS = 12;
export const CURRENT_TRAIL_POINT_FRAMES = 2.5;
// Particles per 1280×800 px of map; scaled with the visible area.
export const CURRENT_PARTICLE_DENSITY = { low: 350, medium: 850, high: 1600 };

export function decodeGreatLakesWaterMask(mask) {
  if (!mask?.bits || !(mask.rows > 1) || !(mask.columns > 1)) return null;
  const binary = atob(mask.bits);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const rowStep = (mask.latitudeEnd - mask.latitudeStart) / (mask.rows - 1);
  const columnStep = (mask.longitudeEnd - mask.longitudeStart) / (mask.columns - 1);
  return (latitude, longitude) => {
    const row = Math.round((latitude - mask.latitudeStart) / rowStep);
    const column = Math.round((longitude - mask.longitudeStart) / columnStep);
    if (row < 0 || row >= mask.rows || column < 0 || column >= mask.columns) return false;
    const index = row * mask.columns + column;
    return Boolean((bytes[index >> 3] >> (index & 7)) & 1);
  };
}

export function createCurrentFieldSampler(fields) {
  const prepared = fields.map((field) => {
    const ys = field.latitudeAxis, xs = field.longitudeAxis;
    return {
      field, ys, xs, isWater: decodeGreatLakesWaterMask(field.waterMask),
      yMin: Math.min(ys[0], ys[ys.length - 1]), yMax: Math.max(ys[0], ys[ys.length - 1]),
      xMin: Math.min(xs[0], xs[xs.length - 1]), xMax: Math.max(xs[0], xs[xs.length - 1])
    };
  });
  const find = (axis, value) => {
    let low = 0, high = axis.length - 1;
    const ascending = axis[high] > axis[0];
    while (high - low > 1) { const middle = (low + high) >> 1; if (ascending ? axis[middle] < value : axis[middle] > value) low = middle; else high = middle; }
    return low;
  };
  return (latitude, longitude) => {
    for (const { field, ys, xs, isWater, yMin, yMax, xMin, xMax } of prepared) {
      if (latitude < yMin || latitude > yMax || longitude < xMin || longitude > xMax) continue;
      if (isWater && !isWater(latitude, longitude)) continue;
      const row = find(ys, latitude), column = find(xs, longitude), index = row * field.columns + column;
      const ids = [index, index + 1, index + field.columns, index + field.columns + 1];
      const fy = (latitude - ys[row]) / (ys[row + 1] - ys[row]), fx = (longitude - xs[column]) / (xs[column + 1] - xs[column]);
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      // With a fine water mask the server has already extended velocities to
      // the shoreline; without one, only the coarse wet corners are usable.
      const corners = isWater ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((position) => field.mask[ids[position]]);
      if (!corners.length) continue;
      const total = corners.reduce((sum, position) => sum + weights[position], 0);
      const blend = (values) => total ? corners.reduce((sum, position) => sum + values[ids[position]] * weights[position], 0) / total : values[ids[corners[0]]];
      return { u: blend(field.u), v: blend(field.v) };
    }
    return null;
  };
}

// Screen-space step so the flow reads at every zoom: still water barely
// drifts, ordinary 0.1 m/s currents glide, and jets streak.
export function currentPixelsPerFrame(speed) {
  return speed > 0 ? 0.25 + 6.5 * speed ** 0.75 : 0;
}

export function createParticleLayer(map, fields) {
  const canvas = L.DomUtil.create("canvas", "great-lakes-current-flow leaflet-layer");
  const ctx = canvas.getContext("2d");
  // Replaced when an animation moves to the next frame; particles keep flowing.
  let sample = createCurrentFieldSampler(fields);
  const speedColors = speedBinColors();
  const particles = [];
  const baseDensity = CURRENT_PARTICLE_DENSITY[greatLakesControlValue("density")] || CURRENT_PARTICLE_DENSITY.medium;
  const speedScale = { slow: 0.5, normal: 1, fast: 1.9 }[greatLakesControlValue("animation-speed")] || 1;
  let frame = null, last = 0, active = true, origin = L.point(0, 0), size = L.point(0, 0), zoom = null;
  // Warm-up frames are excluded: image decoding makes the first second slow.
  let frameTime = 16.67, framesSinceTrim = -120, minimumCount = 0;

  const toLatLng = (x, y) => map.layerPointToLatLng([x, y]);
  const inView = (x, y) => x >= origin.x && y >= origin.y && x <= origin.x + size.x && y <= origin.y + size.y;

  function spawn(particle) {
    particle.trail = [];
    particle.dying = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const x = origin.x + Math.random() * size.x, y = origin.y + Math.random() * size.y;
      const latlng = toLatLng(x, y);
      const vector = sample(latlng.lat, latlng.lng);
      if (vector) {
        particle.trail.push([x, y, Math.hypot(vector.u, vector.v)]);
        particle.vector = vector;
        particle.sinceCommit = 0;
        particle.provisional = false;
        particle.age = 0;
        particle.maxAge = 60 + Math.random() * 90;
        particle.wait = 0;
        return particle;
      }
    }
    // Mostly-land views would otherwise retry every particle every frame.
    particle.wait = 8 + Math.floor(Math.random() * 24);
    return particle;
  }

  function reset() {
    const count = Math.round(baseDensity * Math.min(1.8, Math.max(0.35, (size.x * size.y) / (1280 * 800))));
    minimumCount = Math.round(count * 0.45);
    particles.length = 0;
    for (let index = 0; index < count; index += 1) {
      const particle = spawn({});
      particle.age = Math.random() * (particle.maxAge || 0);
      particles.push(particle);
    }
  }

  function position() {
    size = map.getSize();
    origin = map.containerPointToLayerPoint([0, 0]);
    const ratio = window.devicePixelRatio || 1;
    L.DomUtil.setPosition(canvas, origin);
    canvas.width = Math.round(size.x * ratio);
    canvas.height = Math.round(size.y * ratio);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function advance(particle, steps) {
    if (particle.wait > 0) { particle.wait -= 1; if (!particle.wait) spawn(particle); return; }
    if (!particle.trail.length) { spawn(particle); return; }
    if (particle.dying) {
      particle.trail.shift();
      if (particle.trail.length < 2) spawn(particle);
      return;
    }
    const [x, y] = particle.trail[particle.trail.length - 1];
    const vector = particle.vector;
    particle.age += steps;
    if (!vector || particle.age > particle.maxAge) { particle.dying = true; return; }
    const speed = Math.hypot(vector.u, vector.v);
    if (!speed) { particle.dying = true; return; }
    const distance = currentPixelsPerFrame(speed) * speedScale * steps;
    const nextX = x + vector.u / speed * distance, nextY = y - vector.v / speed * distance;
    if (!inView(nextX, nextY)) { particle.dying = true; return; }
    const next = toLatLng(nextX, nextY);
    particle.vector = sample(next.lat, next.lng);
    if (!particle.vector) { particle.dying = true; return; }
    // Each trail point keeps the speed there, for speed-coloured flow.
    const point = [nextX, nextY, Math.hypot(particle.vector.u, particle.vector.v)];
    // The head moves every frame, but trail points are only committed every
    // few frames so a fixed number of segments spans a longer, smoother tail.
    if (particle.provisional) particle.trail[particle.trail.length - 1] = point;
    else particle.trail.push(point);
    particle.sinceCommit += steps;
    particle.provisional = particle.sinceCommit < CURRENT_TRAIL_POINT_FRAMES;
    if (!particle.provisional) particle.sinceCommit = 0;
    if (particle.trail.length > CURRENT_TRAIL_SEGMENTS + 1) particle.trail.shift();
  }

  function draw() {
    ctx.clearRect(0, 0, size.x, size.y);
    // Butt caps: round caps overlap at every joint (beading) and cost ~4×.
    ctx.lineCap = "butt";
    const { rgb, halo, bySpeed } = flowColorParts(greatLakesFlowColor);
    if (bySpeed) { drawBySpeed(halo); return; }
    // One path per trail segment age keeps this to a few dozen strokes a frame.
    for (let segment = CURRENT_TRAIL_SEGMENTS - 1; segment >= 0; segment -= 1) {
      ctx.beginPath();
      let any = false;
      for (const particle of particles) {
        const trail = particle.trail, head = trail.length - 1 - segment;
        if (head < 1) continue;
        ctx.moveTo(trail[head - 1][0] - origin.x, trail[head - 1][1] - origin.y);
        ctx.lineTo(trail[head][0] - origin.x, trail[head][1] - origin.y);
        any = true;
      }
      if (!any) continue;
      const strength = (1 - segment / CURRENT_TRAIL_SEGMENTS) ** 1.35;
      ctx.strokeStyle = `rgba(${halo}, ${(0.26 * strength).toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb}, ${(0.95 * strength).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Same idea, split by speed bin: each segment takes the colour of the
  // current speed where it ends. Lines are a little wider so the colour reads.
  // Trail segments are faded in pairs and the dark outline is drawn once per
  // pair for every colour, which keeps this to about 66 strokes a frame
  // (one per segment and colour, twice over, was about 240 and visibly slower).
  const SPEED_TRAIL_TIERS = CURRENT_TRAIL_SEGMENTS / 2;
  const speedTierStrength = Array.from({ length: SPEED_TRAIL_TIERS }, (_, tier) => (1 - (tier * 2 + 0.5) / CURRENT_TRAIL_SEGMENTS) ** 1.35);
  const speedTierColors = speedTierStrength.map((strength) => speedColors.map((rgb) => `rgba(${rgb}, ${strength.toFixed(3)})`));
  let speedTierHalos = null, speedTierHaloKey = "";

  function drawBySpeed(halo) {
    const maximum = greatLakesCurrentSpeedMax;
    if (speedTierHaloKey !== halo) {
      speedTierHalos = speedTierStrength.map((strength) => `rgba(${halo}, ${(0.4 * strength).toFixed(3)})`);
      speedTierHaloKey = halo;
    }
    for (let tier = SPEED_TRAIL_TIERS - 1; tier >= 0; tier -= 1) {
      const outline = new Path2D();
      const paths = new Array(SPEED_FLOW_COLOR_BINS).fill(null);
      let any = false;
      for (let segment = tier * 2; segment < tier * 2 + 2; segment += 1) {
        for (const particle of particles) {
          const trail = particle.trail, head = trail.length - 1 - segment;
          if (head < 1) continue;
          const x0 = trail[head - 1][0] - origin.x, y0 = trail[head - 1][1] - origin.y;
          const x1 = trail[head][0] - origin.x, y1 = trail[head][1] - origin.y;
          const bin = speedColorBin(trail[head][2], maximum);
          const path = paths[bin] || (paths[bin] = new Path2D());
          path.moveTo(x0, y0);
          path.lineTo(x1, y1);
          outline.moveTo(x0, y0);
          outline.lineTo(x1, y1);
          any = true;
        }
      }
      if (!any) continue;
      ctx.strokeStyle = speedTierHalos[tier];
      ctx.lineWidth = 3.8;
      ctx.stroke(outline);
      ctx.lineWidth = 2.2;
      paths.forEach((path, bin) => {
        if (!path) return;
        ctx.strokeStyle = speedTierColors[tier][bin];
        ctx.stroke(path);
      });
    }
  }

  function tick(now) {
    if (!active) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden || canvas.style.visibility === "hidden") { last = now; return; }
    const elapsed = last ? now - last : 16.67;
    const steps = Math.min(3, elapsed / 16.67);
    last = now;
    // Slow devices shed particles instead of stuttering.
    frameTime = frameTime * 0.95 + Math.min(elapsed, 100) * 0.05;
    if (++framesSinceTrim > 90 && frameTime > 34 && particles.length > minimumCount) {
      particles.length = Math.max(minimumCount, Math.round(particles.length * 0.85));
      framesSinceTrim = 0;
    }
    particles.forEach((particle) => advance(particle, steps));
    draw();
  }

  function hide() { canvas.style.visibility = "hidden"; }
  function refresh() {
    position();
    if (map.getZoom() !== zoom) { zoom = map.getZoom(); reset(); }
    canvas.style.visibility = "";
  }

  return {
    addTo() {
      map.getPane("overlayPane").appendChild(canvas);
      refresh();
      map.on("zoomstart", hide);
      map.on("resize viewreset moveend", refresh);
      frame = requestAnimationFrame(tick);
      return this;
    },
    setFields(next) {
      sample = createCurrentFieldSampler(next);
    },
    remove() {
      active = false;
      cancelAnimationFrame(frame);
      map.off("zoomstart", hide);
      map.off("resize viewreset moveend", refresh);
      canvas.remove();
    }
  };
}

// The server keeps NOAA data current; an open page checks this often whether
// a new run or the next hourly frame is being served and reloads only then.
export const GREAT_LAKES_STATUS_POLL_MS = 5 * 60 * 1000;
const greatLakesStatusCache = new Map();
export let greatLakesLoadedDataVersion = "";

export async function greatLakesDataStatus(modelsKey, { fresh = false } = {}) {
  const cached = greatLakesStatusCache.get(modelsKey);
  if (!fresh && cached && Date.now() - cached.at < 60 * 1000) return cached.status;
  try {
    const status = await window.noaaGreatLakesApi.status({ models: modelsKey, signal: AbortSignal.timeout(5000) });
    greatLakesStatusCache.set(modelsKey, { status, at: Date.now() });
    return status;
  } catch {
    return cached?.status || null;
  }
}

// "tonight at 10 PM", "tomorrow at 4 AM", "Sunday at 10:30 PM" instead of a numeric date.
export function friendlyTime(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (time) => { const day = new Date(time); day.setHours(0, 0, 0, 0); return day.getTime(); };
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  const time = date.toLocaleTimeString([], date.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  const day = days === 0 ? (date.getHours() >= 18 ? "tonight" : "today")
    : days === 1 ? "tomorrow"
    : days === -1 ? "yesterday"
    : days < -1 || days > 6 ? date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : date.toLocaleDateString([], { weekday: "long" });
  return `${day} at ${time}`;
}

export function friendlyWait(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 2) return "in a minute or so";
  if (minutes < 55) return `in about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
}

export function nextUpdateNote(status, now = Date.now()) {
  const times = Object.values(status?.models || {}).map((model) => Date.parse(model.nextRunExpectedAt)).filter(Number.isFinite);
  if (!times.length) return "";
  const next = Math.min(...times);
  if (next <= now) return " A new NOAA run is due now; the map updates when it arrives.";
  return ` Next update expected ${friendlyWait(next - now)}.`;
}

export function waveUpdateNote(status, now = Date.now()) {
  const next = Date.parse(status?.waves?.nextRunExpectedAt);
  if (!Number.isFinite(next)) return "";
  if (next <= now) return " A new NOAA wave run is due now; the map updates when it arrives.";
  return ` Wave forecasts update hourly; the next is expected ${friendlyWait(next - now)}.`;
}

export async function refreshGreatLakesIfStale(map) {
  if (!map || !greatLakesActiveLayer || !greatLakesLoadedModelsKey || document.hidden) return false;
  if (greatLakesHistoryMode()) {
    // A past hour never changes; newly saved hours just become choices.
    await loadGreatLakesHistoryIndex({ fresh: true });
    syncHistoryInput();
    return false;
  }
  const status = await greatLakesDataStatus(greatLakesLoadedModelsKey, { fresh: true });
  const version = greatLakesDataVersion(status, greatLakesActiveLayer);
  if (!version || version === greatLakesLoadedDataVersion) return false;
  await loadGreatLakesConditions(map);
  return true;
}

// Waves come from a separate hourly NOAA model with its own version, so the
// other layers are not reloaded every time a wave cycle arrives.
export function greatLakesDataVersion(status, layer) {
  return (layer === "waves" ? status?.wavesVersion : status?.version) || "";
}

// Lets companion overlays (measurement points) match the visible temperature colours.
export function announceGreatLakesLayer(layer, metadata, temperatureMetadata = null) {
  document.dispatchEvent(new CustomEvent("great-lakes-layer-loaded", { detail: { layer, metadata, temperatureMetadata, depth: Number(greatLakesShownDepth()) || 0 } }));
}

// NOAA stores fixed depth levels (0, 1, 2, 4, 6 m …); the server shows the
// level nearest the slider, which can differ from the requested depth.
export function modelDepthShown(metadata = {}) {
  const depths = (metadata.models || []).map((model) => Number(model.selectedDepthMeters)).filter(Number.isFinite);
  return depths.length ? depths[0] : null;
}

export function modelDepthNote(requestedMeters, shownMeters) {
  if (!Number.isFinite(shownMeters) || Math.abs(shownMeters - requestedMeters) < 0.3) return "";
  return ` Showing the model's ${greatLakesDepthLabel(shownMeters)} level, the closest to ${greatLakesDepthLabel(requestedMeters)}.`;
}

const MODEL_LAKE_NAMES = { LSOFS: "Lake Superior", LMHOFS: "Lakes Michigan and Huron", LEOFS: "Lake Erie", LOOFS: "Lake Ontario" };

// Lakes left blank because the chosen depth is deeper than they go.
export function tooShallowNote(models = []) {
  const shallow = models.filter((model) => model.tooShallow);
  const names = [...new Set(shallow.map((model) => MODEL_LAKE_NAMES[model.model] || model.model))];
  if (!names.length) return "";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return ` ${list} ${names.length === 1 && !list.startsWith("Lakes ") ? "isn't" : "aren't"} this deep, so ${names.length === 1 && !list.startsWith("Lakes ") ? "it's" : "they're"} left blank.`;
}

export async function loadGreatLakesConditions(map) {
  if (!greatLakesConditionsLayer) return;
  const loadRevision = ++greatLakesLoadRevision;
  const layer = greatLakesControlValue("layer");
  greatLakesConditionsRequest?.abort();
  if (!layer) {
    stopGreatLakesAnimation();
    setGreatLakesMapLoading(false);
    document.body.classList.add("great-lakes-layer-none");
    clearGreatLakesVisuals();
    greatLakesActiveLayer = "";
    greatLakesLoadedModelsKey = "";
    setGreatLakesStatus("Choose a layer to show NOAA Great Lakes conditions.");
    announceGreatLakesLayer("", {});
    return;
  }
  document.body.classList.remove("great-lakes-layer-none");
  const historyMode = greatLakesHistoryMode();
  const resolution = GREAT_LAKES_LAYER_RESOLUTION;
  const models = GREAT_LAKES_ALL_MODELS;
  const modelsKey = models.join(",");
  setGreatLakesMapLoading(true);
  if (historyMode) {
    stopGreatLakesAnimation();
    setGreatLakesStatus("Loading saved conditions…");
    const ready = await ensureGreatLakesHistoryTime(layer);
    if (loadRevision !== greatLakesLoadRevision) return;
    announceHistoryTime();
    if (!ready) {
      clearGreatLakesVisuals();
      greatLakesActiveLayer = "";
      setGreatLakesMapLoading(false);
      setGreatLakesStatus(greatLakesHistoryIndex
        ? "No saved conditions yet. The server keeps the past 30 days as they come in, starting now."
        : "Saved conditions are unavailable. Try again shortly.", !greatLakesHistoryIndex);
      announceGreatLakesLayer("", {});
      return;
    }
  }
  const forecastHour = historyMode ? "0" : greatLakesControlValue("forecast");
  const depth = greatLakesShownDepth();
  const timeParams = greatLakesTimeParams();
  const dataStatus = historyMode ? null : await greatLakesDataStatus(modelsKey);
  if (loadRevision !== greatLakesLoadRevision) return;
  const dataVersion = historyMode ? `history:${timeParams.time}` : greatLakesDataVersion(dataStatus, layer);
  if (!historyMode && greatLakesAnimationActive()) {
    greatLakesConditionsRequest = new AbortController();
    setGreatLakesMapLoading(true);
    const isCurrent = () => loadRevision === greatLakesLoadRevision;
    const loaded = await loadGreatLakesAnimation(map, { layer, depth, signal: greatLakesConditionsRequest.signal, isCurrent });
    if (!isCurrent()) return;
    setGreatLakesMapLoading(false);
    if (loaded) {
      greatLakesActiveLayer = layer;
      greatLakesLoadedModelsKey = modelsKey;
      greatLakesLoadedDataVersion = dataVersion;
    }
    return;
  }
  const cacheKey = JSON.stringify({ layer, forecastHour, depth, resolution, models: modelsKey, dataVersion });
  const temperatureBackground = layer === "currents" && greatLakesControlValue("current-background") === "temperature";
  const temperatureCacheKey = JSON.stringify({ layer: "temperature", forecastHour, depth, resolution: CURRENT_BACKGROUND_RESOLUTION, models: modelsKey, dataVersion });
  const freshCache = (key) => {
    const entry = greatLakesPayloadCache.get(key);
    return entry && Date.now() - entry.createdAt < GREAT_LAKES_CLIENT_CACHE_MS ? entry.payload : null;
  };
  const cacheHit = freshCache(cacheKey) && (!temperatureBackground || freshCache(temperatureCacheKey));
  greatLakesConditionsRequest = cacheHit ? null : new AbortController();
  setGreatLakesStatus(historyMode ? "Loading saved conditions…" : "Loading NOAA forecast…");
  setGreatLakesMapLoading(true, historyMode ? "Loading saved conditions…" : undefined);
  clearGreatLakesVisuals();
  const fetchLayer = async (key, request) => {
    const cachedPayload = freshCache(key);
    if (cachedPayload) return cachedPayload;
    const fetched = await window.noaaGreatLakesApi.conditions({ ...request, forecastHour, depth, models: modelsKey, dataVersion, ...timeParams, signal: greatLakesConditionsRequest.signal });
    greatLakesPayloadCache.set(key, { payload: fetched, createdAt: Date.now() });
    return fetched;
  };
  try {
    const [payload, temperaturePayload] = await Promise.all([
      fetchLayer(cacheKey, { layer, resolution }),
      temperatureBackground ? fetchLayer(temperatureCacheKey, { layer: "temperature", resolution: CURRENT_BACKGROUND_RESOLUTION }) : null
    ]);
    if (loadRevision !== greatLakesLoadRevision) return;
    greatLakesActiveLayer = layer;
    greatLakesLoadedModelsKey = modelsKey;
    if (layer === "temperature") {
      renderGreatLakesTemperatureRasters(payload.rasters || [], loadRevision);
      setTemperatureLegendRange(payload.metadata);
    }
    else if (layer === "thermocline") {
      renderGreatLakesThermoclineRasters(payload.rasters || [], loadRevision);
      setThermoclineLegendRange(payload.metadata);
    }
    else if (layer === "waves") {
      renderGreatLakesWaveRasters(payload.rasters || [], loadRevision);
      setWaveLegendRange(payload.metadata);
      if (greatLakesControlValue("wave-display") !== "off" && (payload.arrows || []).length) {
        greatLakesWaveArrowLayer = createWaveArrowLayer(map, payload.arrows).addTo(map);
      }
    }
    else {
      setCurrentLegendRange(payload.metadata);
      setCurrentSpeedMax(payload.metadata);
      if (temperaturePayload) {
        renderGreatLakesTemperatureRasters(temperaturePayload.rasters || [], loadRevision, "currents");
        setTemperatureLegendRange(temperaturePayload.metadata);
      } else if (greatLakesControlValue("current-background") !== "none") {
        renderGreatLakesCurrentRasters(payload.rasters || [], loadRevision);
      }
      const display = greatLakesControlValue("current-display");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (display === "flow" && !reduced && (payload.fields || []).length) greatLakesParticleLayer = createParticleLayer(map, payload.fields).addTo(map);
      else if (display !== "off") renderGreatLakesCurrents(payload.data || [], map.getZoom());
    }
    const metadataModels = [...(payload.metadata.models || []), ...(temperaturePayload?.metadata.models || [])];
    const unavailable = metadataModels.some((model) => !model.available);
    const validTime = metadataModels.find((model) => model.validTime)?.validTime;
    const label = layer === "temperature" ? "Water temperature" : layer === "thermocline" ? "Thermocline depth" : layer === "waves" ? "Wave data" : temperaturePayload ? "Current or temperature data" : "Underwater current data";
    const sampledOnly = layer === "currents" && !(payload.fields || []).length && (payload.data || []).length;
    const shownDepth = layer === "thermocline" || layer === "waves" ? null : modelDepthShown(temperaturePayload?.metadata || payload.metadata);
    const source = historyMode ? "saved NOAA conditions" : layer === "waves" ? "the NOAA wave forecast" : "the NOAA forecast";
    const updateNote = historyMode ? " Past hours show the surface." : layer === "waves" ? waveUpdateNote(dataStatus) : nextUpdateNote(dataStatus);
    const when = validTime ? (historyMode ? historyTimeLabel(validTime) : friendlyTime(validTime)) : "";
    setGreatLakesStatus(`${unavailable ? `${label} unavailable for one or more lakes. ` : ""}${when ? `Showing ${source} for ${when}.` : `Showing ${source}.`}${modelDepthNote(Number(depth), shownDepth)}${tooShallowNote(metadataModels)}${sampledOnly ? " Flow grid unavailable; showing sampled current arrows." : ""}${updateNote}`, unavailable);
    greatLakesLoadedDataVersion = dataVersion;
    announceGreatLakesLayer(layer, payload.metadata || {}, temperaturePayload?.metadata || (layer === "temperature" ? payload.metadata : null));
  } catch (error) {
    if (loadRevision !== greatLakesLoadRevision || error.name === "AbortError") return;
    if (historyMode) setGreatLakesStatus(/\(404\)/.test(error.message) ? "This layer was not saved for that hour. Pick another time." : "Saved conditions are unavailable. Try again shortly.", true);
    else setGreatLakesStatus("NOAA Great Lakes model data is unavailable. Try again shortly.", true);
  } finally {
    if (loadRevision === greatLakesLoadRevision) setGreatLakesMapLoading(false);
  }
}

export function setup() {
  renderGreatLakesConditionsHost();

  document.addEventListener("change", (event) => {
    const control = event.target.closest("[data-gl-layer], [data-gl-depth]");
    if (!control) return;
    const host = renderGreatLakesConditionsHost();
    if (!host) return;
    syncGreatLakesLayerControls(host);
    if (!ui.fishMap) return;
    // Once the map control is attached its own listeners load the layer; a
    // second load here made the server build every change twice.
    if (!greatLakesConditionsControl) loadGreatLakesConditions(ui.fishMap);
    if (greatLakesControlValue("layer") === "currents") {
      greatLakesActiveLayer = "currents";
      greatLakesLoadedModelsKey = GREAT_LAKES_ALL_MODELS.join(",");
    }
  });

  document.addEventListener("input", (event) => {
    const depthSlider = event.target.closest("[data-gl-depth]");
    if (!depthSlider) return;
    const depth = greatLakesDepthFromSlider(depthSlider.value);
    const label = depth ? greatLakesDepthLabel(depth) : "Surface";
    document.querySelector("[data-gl-depth-label]").textContent = label;
    depthSlider.setAttribute("aria-valuetext", label);
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-gl-profile-lat]");
    if (!button) return;
    // The card's button keeps its icon; only its text changes while loading.
    const label = button.querySelector("span") || button;
    const original = label.textContent;
    button.disabled = true;
    label.textContent = "Loading…";
    try {
      const profile = await window.noaaGreatLakesApi.profile({ forecastHour: greatLakesForecastHour(), latitude: button.dataset.glProfileLat, longitude: button.dataset.glProfileLon, models: greatLakesLoadedModelsKey, ...greatLakesTimeParams() });
      if (!profile.available) throw new Error("Profile unavailable");
      showWaterColumnDialog(profile);
      label.textContent = original;
    } catch { label.textContent = "Profile unavailable"; }
    finally { button.disabled = false; }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gl-current-profile-lat]");
    if (!button) return;
    showGreatLakesCurrentProfile({
      latitude: Number(button.dataset.glCurrentProfileLat),
      longitude: Number(button.dataset.glCurrentProfileLon)
    });
  });

  window.ensureGreatLakesConditions = ensureGreatLakesConditions;

  let attempts = 0;
  const attachWhenMapReady = setInterval(() => {
    attempts += 1;
    if (ui.fishMap) {
      ensureGreatLakesConditions(ui.fishMap);
      clearInterval(attachWhenMapReady);
    } else if (attempts > 600) {
      clearInterval(attachWhenMapReady);
    }
  }, 50);

  window.getGreatLakesMapInspection = greatLakesMapInspection;

  window.getGreatLakesHomeView = () => GREAT_LAKE_VIEWS[greatLakesHomeLake()] || null;
}
