import { html, joinHtml } from "./html.js";
import { L } from "./vendor.js";
import { ui } from "./app-state.js";
import { convertUnitValue, unitPreference } from "./app-units.js";
import {
  TEMPERATURE_COLOR_STOPS, currentDirectionLabel, currentProfileDepthLabel, currentSpeedLabel,
  greatLakesControlValue, greatLakesModelsForView, paletteColor, waterTemperatureLabel,
  waveChopLabel, waveDirectionText, waveHeightLabel
} from "./great-lakes-conditions.js";
import { directionIconHtml, readingHtml } from "./cards.js";

// Where Great Lakes values come from: live NOAA buoy/shore measurements, and
// the forecast model's own calculation points (FVCOM mesh nodes for
// temperature, triangle centres for currents).
export const STATIONS_STORAGE_KEY = "logbook.greatLakesStations";
export const MODEL_POINTS_STORAGE_KEY = "logbook.greatLakesModelPoints";
export const STATIONS_REFRESH_MS = 10 * 60 * 1000;
export const STATION_TEMPERATURE_MIN_SPAN_C = 3;

let map = null;
let stationsLayer = null;
let stationMarkers = [];
let modelPointsLayer = null;
let modelPointsRenderer = null;
let stationsPayload = null;
let stationsLoadedAt = 0;
let stationsRefreshTimer = null;
let stationsRequest = null;
let modelPointsRequest = null;
let modelPointsTimer = null;
let layerRange = null;
let stationsMessage = "";
let modelPointsMessage = "";

function stored(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

function store(key, enabled) {
  try { localStorage.setItem(key, enabled ? "1" : "0"); } catch { /* storage unavailable */ }
}

function toggle(name) {
  return document.querySelector(`[data-gl-${name}]`);
}

function setPointsStatus() {
  const node = document.querySelector("[data-gl-points-status]");
  if (node) node.textContent = [stationsMessage, modelPointsMessage].filter(Boolean).join("\n");
}

export function relativeTimeLabel(isoTime, now = Date.now()) {
  const time = Date.parse(isoTime);
  if (Number.isNaN(time)) return "at an unknown time";
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min ago` : `${hours} h ago`;
}

export function shortTemperatureLabel(temperatureC) {
  const unit = typeof unitPreference === "function" ? unitPreference("waterTemperature") : "C";
  const value = typeof convertUnitValue === "function" ? Number(convertUnitValue(temperatureC, "C", unit)) : temperatureC;
  return `${Math.round(value)}°`;
}

// Stations share the temperature overlay's colour range while it shows the
// surface, so a buoy and the water around it read the same colour.
export function stationTemperatureRange(stations, overlayRange = null) {
  if (overlayRange && Number.isFinite(overlayRange.minC) && Number.isFinite(overlayRange.maxC)) return overlayRange;
  const values = stations.map((station) => station.waterTemperature?.temperatureC).filter(Number.isFinite);
  if (!values.length) return { minC: 0, maxC: STATION_TEMPERATURE_MIN_SPAN_C };
  let minC = Math.min(...values), maxC = Math.max(...values);
  if (maxC - minC < STATION_TEMPERATURE_MIN_SPAN_C) {
    const middle = (minC + maxC) / 2;
    minC = middle - STATION_TEMPERATURE_MIN_SPAN_C / 2;
    maxC = middle + STATION_TEMPERATURE_MIN_SPAN_C / 2;
  }
  return { minC, maxC };
}

export function stationMarkerHtml(station, range) {
  const temperature = station.waterTemperature?.temperatureC;
  const current = (station.current?.values || [])[0];
  const hasTemperature = Number.isFinite(temperature);
  const color = hasTemperature ? paletteColor((temperature - range.minC) / (range.maxC - range.minC), TEMPERATURE_COLOR_STOPS) : "rgb(148, 163, 184)";
  return html`<span class="great-lakes-station${current ? " has-current" : ""}" style="--station-color: ${color}">
    <i class="great-lakes-station-dot" aria-hidden="true"></i>${hasTemperature ? html`<b>${shortTemperatureLabel(temperature)}</b>` : ""}${current ? html`<svg class="great-lakes-station-arrow" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${Math.round(current.directionDegrees)}deg)"><path d="M12 2.5 19 20.5 12 16.2 5 20.5Z"/></svg>` : ""}
  </span>`;
}

export function stationPopupHtml(station, now = Date.now()) {
  const temperature = station.waterTemperature;
  const current = station.current;
  const details = [station.type, station.owner, station.id].filter(Boolean).join(" · ");
  const temperatureBlock = temperature ? readingHtml({
    label: "Water temperature",
    value: waterTemperatureLabel(temperature.temperatureC),
    note: `Measured ${relativeTimeLabel(temperature.observedAt, now)}`
  }) : "";
  const waves = station.waves;
  const waveDetails = waves ? [
    Number.isFinite(waves.periodSeconds) ? `${Math.round(waves.periodSeconds)} s period` : "",
    Number.isFinite(waves.directionDegrees) ? waveDirectionText(waves.directionDegrees) : ""
  ].filter(Boolean).join(" · ") : "";
  const chop = waves ? waveChopLabel(waves.heightMeters) : "";
  const wavesBlock = waves ? readingHtml({
    label: chop ? `Waves · ${chop}` : "Waves",
    value: waveHeightLabel(waves.heightMeters),
    note: `${waveDetails ? `${waveDetails} · ` : ""}Measured ${relativeTimeLabel(waves.observedAt, now)}`
  }) : "";
  const currentRows = current ? joinHtml(current.values.map((value) => {
    const still = value.speedMetersPerSecond < 0.001;
    const direction = still ? "Still" : `Toward ${currentDirectionLabel(value.directionDegrees)} · ${Math.round(value.directionDegrees) % 360}°`;
    return html`<div role="listitem"><span>${currentProfileDepthLabel(value.depthMeters)}</span><strong>${currentSpeedLabel(value.speedMetersPerSecond)}</strong><span>${still ? "" : directionIconHtml(value.directionDegrees)}${direction}</span></div>`;
  }), "") : "";
  const currentBlock = current ? html`<section class="gl-reading">
    <span class="gl-reading-label">Current by depth</span>
    <div class="gl-current-table" role="list">${currentRows}</div>
    <span class="gl-reading-note">Measured ${relativeTimeLabel(current.observedAt, now)}</span>
  </section>` : "";
  return html`<article class="gl-card">
    <header class="gl-card-head"><strong class="gl-card-title">${station.name}</strong><span class="gl-card-sub">${details}</span></header>
    ${temperatureBlock}${wavesBlock}${currentBlock}
    <a class="gl-card-link" href="${station.url}" target="_blank" rel="noopener noreferrer">NOAA station page<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 4 12"/></svg></a>
  </article>`;
}

export function overlapsAny(box, boxes) {
  return boxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
}

// Greedy label placement: a label that would overlap one already placed
// collapses to its coloured dot, which stays clickable.
function declutterStations() {
  if (!map) return;
  const placed = [];
  stationMarkers.forEach((marker) => {
    const element = marker.getElement()?.querySelector(".great-lakes-station");
    if (!element) return;
    element.classList.remove("is-compact");
    const point = map.latLngToContainerPoint(marker.getLatLng());
    const width = element.offsetWidth || 48, height = element.offsetHeight || 20;
    const box = { left: point.x - 10, right: point.x - 10 + width, top: point.y - height / 2, bottom: point.y + height / 2 };
    if (overlapsAny(box, placed)) {
      element.classList.add("is-compact");
      placed.push({ left: point.x - 8, right: point.x + 8, top: point.y - 8, bottom: point.y + 8 });
    } else {
      placed.push(box);
    }
  });
}

function renderStations() {
  if (!stationsLayer) return;
  stationsLayer.clearLayers();
  stationMarkers = [];
  if (!toggle("stations")?.checked || !stationsPayload) return;
  const stations = stationsPayload.stations || [];
  const range = stationTemperatureRange(stations, layerRange);
  // Current meters and offshore buoys keep their labels first when crowded.
  const priority = (station) => (station.current ? 0 : station.type === "Buoy" ? 1 : 2);
  [...stations].sort((first, second) => priority(first) - priority(second)).forEach((station) => {
    const icon = L.divIcon({ className: "great-lakes-station-marker", iconSize: [0, 0], iconAnchor: [0, 0], html: String(stationMarkerHtml(station, range)) });
    const marker = L.marker([station.latitude, station.longitude], { icon, pane: "greatLakesStations", title: station.name, alt: station.name, riseOnHover: true })
      .bindPopup(() => String(stationPopupHtml(station)), { className: "gl-popup", minWidth: 240, maxWidth: 290 })
      .addTo(stationsLayer);
    stationMarkers.push(marker);
  });
  declutterStations();
  const withCurrents = stations.filter((station) => station.current).length;
  stationsMessage = stations.length
    ? `${stations.length} stations reporting${withCurrents ? `, ${withCurrents} with current meters` : ""}. Data last received at ${new Date(stationsLoadedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : "No measurement stations are reporting right now.";
  setPointsStatus();
}

async function loadStations() {
  if (!toggle("stations")?.checked) return;
  stationsRequest?.abort();
  stationsRequest = new AbortController();
  stationsMessage = "Loading NOAA measurement stations…";
  setPointsStatus();
  try {
    stationsPayload = await window.noaaGreatLakesApi.observations({ signal: stationsRequest.signal });
    stationsLoadedAt = Date.now();
    renderStations();
  } catch (error) {
    if (error.name === "AbortError") return;
    stationsMessage = "NOAA measurement stations are unavailable. Try again shortly.";
    setPointsStatus();
  }
}

function setStationsEnabled(enabled) {
  store(STATIONS_STORAGE_KEY, enabled);
  clearInterval(stationsRefreshTimer);
  if (!enabled) {
    stationsRequest?.abort();
    stationsLayer?.clearLayers();
    stationsMessage = "";
    setPointsStatus();
    return;
  }
  loadStations();
  stationsRefreshTimer = setInterval(loadStations, STATIONS_REFRESH_MS);
}

export function modelPointKind() {
  const layer = greatLakesControlValue("layer");
  return layer === "currents" || layer === "waves" ? layer : "temperature";
}

const MODEL_POINT_LABELS = {
  currents: "current calculation points (model triangle centres)",
  waves: "wave calculation points (2.5 km wave model grid)",
  temperature: "temperature calculation points (model mesh nodes)"
};

async function loadModelPoints() {
  modelPointsRequest?.abort();
  modelPointsLayer?.clearLayers();
  if (!map || !toggle("model-points")?.checked) return;
  const models = greatLakesModelsForView(map);
  if (!models.length) {
    modelPointsMessage = "Move the map over a Great Lake to see model calculation points.";
    setPointsStatus();
    return;
  }
  const kind = modelPointKind();
  const bounds = map.getBounds().pad(0.05);
  modelPointsRequest = new AbortController();
  modelPointsMessage = "Loading model calculation points…";
  setPointsStatus();
  try {
    const payload = await window.noaaGreatLakesApi.modelPoints({
      kind, models: models.join(","), signal: modelPointsRequest.signal,
      south: Math.max(-90, bounds.getSouth()).toFixed(4), west: Math.max(-180, bounds.getWest()).toFixed(4),
      north: Math.min(90, bounds.getNorth()).toFixed(4), east: Math.min(180, bounds.getEast()).toFixed(4)
    });
    const label = MODEL_POINT_LABELS[kind];
    if (payload.tooMany) {
      modelPointsMessage = `Zoom in to see model points: ${payload.count.toLocaleString()} ${label} are in this view.`;
    } else {
      const points = payload.points || [];
      for (let index = 0; index < points.length; index += 2) {
        L.circleMarker([points[index], points[index + 1]], {
          renderer: modelPointsRenderer, interactive: false, radius: 2.4, weight: 1,
          color: "rgba(255, 255, 255, 0.92)", fillColor: "#0b1730", fillOpacity: 0.92
        }).addTo(modelPointsLayer);
      }
      modelPointsMessage = `${payload.count.toLocaleString()} ${label} in view.`;
    }
    setPointsStatus();
  } catch (error) {
    if (error.name === "AbortError") return;
    modelPointsMessage = "NOAA model calculation points are unavailable. Try again shortly.";
    setPointsStatus();
  }
}

function scheduleModelPoints(delay = 220) {
  clearTimeout(modelPointsTimer);
  modelPointsTimer = setTimeout(loadModelPoints, delay);
}

function setModelPointsEnabled(enabled) {
  store(MODEL_POINTS_STORAGE_KEY, enabled);
  if (enabled) { scheduleModelPoints(0); return; }
  clearTimeout(modelPointsTimer);
  modelPointsRequest?.abort();
  modelPointsLayer?.clearLayers();
  modelPointsMessage = "";
  setPointsStatus();
}

function attach(fishMap) {
  map = fishMap;
  if (!map.getPane("greatLakesModelPoints")) {
    map.createPane("greatLakesModelPoints").style.zIndex = 450;
    map.getPane("greatLakesModelPoints").style.pointerEvents = "none";
  }
  if (!map.getPane("greatLakesStations")) map.createPane("greatLakesStations").style.zIndex = 590;
  modelPointsRenderer = L.canvas({ pane: "greatLakesModelPoints", padding: 0.1 });
  modelPointsLayer = L.layerGroup().addTo(map);
  stationsLayer = L.layerGroup().addTo(map);
  map.on("moveend", () => { if (toggle("model-points")?.checked) scheduleModelPoints(); });
  map.on("zoomend", declutterStations);
  const stationsToggle = toggle("stations"), modelPointsToggle = toggle("model-points");
  if (stationsToggle) stationsToggle.checked = stored(STATIONS_STORAGE_KEY);
  if (modelPointsToggle) modelPointsToggle.checked = stored(MODEL_POINTS_STORAGE_KEY);
  if (stationsToggle?.checked) setStationsEnabled(true);
  if (modelPointsToggle?.checked) setModelPointsEnabled(true);
}

export function setup() {
  document.addEventListener("change", (event) => {
    if (!map) return;
    if (event.target.matches("[data-gl-stations]")) setStationsEnabled(event.target.checked);
    else if (event.target.matches("[data-gl-model-points]")) setModelPointsEnabled(event.target.checked);
    else if (event.target.matches("[data-gl-layer]") && toggle("model-points")?.checked) scheduleModelPoints();
  });

  document.addEventListener("great-lakes-layer-loaded", (event) => {
    const { temperatureMetadata, depth } = event.detail || {};
    layerRange = temperatureMetadata && !depth && Number.isFinite(Number(temperatureMetadata.minC))
      ? { minC: Number(temperatureMetadata.minC), maxC: Number(temperatureMetadata.maxC) }
      : null;
    renderStations();
  });

  let attempts = 0;
  const attachWhenMapReady = setInterval(() => {
    attempts += 1;
    if (ui.fishMap && document.querySelector("[data-gl-stations]")) {
      clearInterval(attachWhenMapReady);
      attach(ui.fishMap);
    } else if (attempts > 600) {
      clearInterval(attachWhenMapReady);
    }
  }, 50);
}
