import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { convertUnitValue, formatUnitValue, unitPreference } from "./app-units.js";

// NOAA Great Lakes OFS map layers. Temperature is rendered as server-generated
// PNG rasters; currents are rendered as interpolated canvas particle flow.
export let greatLakesConditionsControl = null;
export let greatLakesConditionsLayer = null;
export let greatLakesConditionsRequest = null;
export let greatLakesActiveLayer = "";
export let greatLakesRasterReloadTimer = null;
export let greatLakesParticleLayer = null;
export let greatLakesLoadedModelsKey = "";
export let greatLakesLoadRevision = 0;
export let greatLakesProfileData = null;
export let greatLakesProfileDepthScale = "";
export let greatLakesProfileDepthLimit = null;
export const GREAT_LAKES_CLIENT_CACHE_MS = 10 * 60 * 1000;
export const GREAT_LAKES_MAX_DEPTH_METERS = 500;
export const GREAT_LAKES_DEPTH_SLIDER_MAX = 1000;
export const greatLakesPayloadCache = new Map();

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

export function greatLakesConditionsHtml() {
  return html`<section class="great-lakes-control" aria-label="Great Lakes Conditions">
    <label>Lake<select data-gl-lake><option value="">All lakes</option>${joinHtml(Object.keys(GREAT_LAKE_VIEWS).map((lake) => html`<option value="${lake}"${greatLakesHomeLake() === lake ? " selected" : ""}>Lake ${lake}</option>`), "")}</select></label>
    <label>Layer<select data-gl-layer><option value="" selected>None</option><option value="temperature">Surface temperature</option><option value="thermocline">Thermocline depth</option><option value="currents">Underwater currents</option></select></label>
    <label>Forecast<select data-gl-forecast><option value="0">Now</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option></select></label>
    <label>Depth <output data-gl-depth-label>Surface</output><input data-gl-depth type="range" min="0" max="${GREAT_LAKES_DEPTH_SLIDER_MAX}" step="1" value="0" aria-label="Model depth, logarithmic scale" aria-valuetext="Surface" /></label>
    <div class="great-lakes-current-options">
      <label>Current display<select data-gl-current-display><option value="flow">Animated flow</option><option value="arrows">Static arrows</option></select></label>
      <label>Particle density<select data-gl-density><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label>
      <label>Animation speed<select data-gl-animation-speed><option value="slow">Slow</option><option value="normal" selected>Normal</option><option value="fast">Fast</option></select></label>
    </div>
    <div class="great-lakes-current-legend"><span data-gl-current-min>—</span><i></i><span data-gl-current-max>—</span></div>
    <p data-gl-status>Showing NOAA model forecast valid at an unavailable time.</p>
    <div class="great-lakes-legend"><span data-gl-temperature-min>—</span><i></i><span data-gl-temperature-max>—</span></div>
    <div class="great-lakes-thermocline-legend"><span data-gl-thermocline-min>—</span><i></i><span data-gl-thermocline-max>—</span></div>
  </section>`;
}

export function ensureGreatLakesLoadingIndicator() {
  const mapNode = document.querySelector("#fishMap");
  if (!mapNode || mapNode.querySelector("[data-gl-map-loading]")) return;
  insertHtml(mapNode, "beforeend", html`<div class="great-lakes-map-loading" data-gl-map-loading role="status" aria-live="polite" aria-hidden="true"><span class="great-lakes-map-spinner" aria-hidden="true"></span><span>Loading data…</span></div>`);
}

export function setGreatLakesMapLoading(isLoading) {
  ensureGreatLakesLoadingIndicator();
  const mapNode = document.querySelector("#fishMap");
  const indicator = mapNode?.querySelector("[data-gl-map-loading]");
  mapNode?.classList.toggle("is-great-lakes-loading", isLoading);
  mapNode?.setAttribute("aria-busy", String(isLoading));
  indicator?.setAttribute("aria-hidden", String(!isLoading));
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

export function greatLakesDepthFromSlider(value) {
  const position = Math.max(0, Math.min(GREAT_LAKES_DEPTH_SLIDER_MAX, Number(value) || 0));
  if (position <= 0) return 0;
  return Math.round(Math.expm1(Math.log1p(GREAT_LAKES_MAX_DEPTH_METERS) * position / GREAT_LAKES_DEPTH_SLIDER_MAX));
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
  const decimals = value < 0.1 ? 3 : value < 10 ? 1 : 0;
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
  const syncLayerSpecificControls = () => {
    const layer = host.querySelector("[data-gl-layer]")?.value;
    host.classList.toggle("has-current-layer", layer === "currents");
    host.classList.toggle("has-temperature-layer", layer === "temperature");
    host.classList.toggle("has-thermocline-layer", layer === "thermocline");
  };
  syncLayerSpecificControls();
  host.querySelectorAll("select").forEach((select) => select.addEventListener("change", () => {
    if (select.matches("[data-gl-layer]")) syncLayerSpecificControls();
    if (select.matches("[data-gl-lake]") && GREAT_LAKE_VIEWS[select.value]) {
      const lake = GREAT_LAKE_VIEWS[select.value];
      map.setView(lake.center, lake.zoom);
    }
    loadGreatLakesConditions(map);
    if (greatLakesControlValue("layer") === "currents") {
      setTimeout(() => setGreatLakesStatus("Showing NOAA model forecast valid at an unavailable time."), 0);
    }
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
  greatLakesConditionsControl = host;
  map.on("zoomend", () => {
  if (!["temperature", "thermocline"].includes(greatLakesActiveLayer)) return;
    clearTimeout(greatLakesRasterReloadTimer);
    greatLakesRasterReloadTimer = setTimeout(() => loadGreatLakesConditions(map), 250);
  });
  map.on("moveend", () => {
    const modelsKey = greatLakesModelsForView(map).join(",");
    if (!modelsKey || modelsKey === greatLakesLoadedModelsKey) return;
    clearTimeout(greatLakesRasterReloadTimer);
    greatLakesRasterReloadTimer = setTimeout(() => loadGreatLakesConditions(map), 180);
  });
  if (map._loaded) loadGreatLakesConditions(map);
  else map.once("load", () => loadGreatLakesConditions(map));
}

export function syncGreatLakesLayerControls(host = document.querySelector("#greatLakesConditions")) {
  if (!host) return;
  const layer = host.querySelector("[data-gl-layer]")?.value;
  host.classList.toggle("has-current-layer", layer === "currents");
  host.classList.toggle("has-temperature-layer", layer === "temperature");
  host.classList.toggle("has-thermocline-layer", layer === "thermocline");
}

export function renderGreatLakesConditionsHost() {
  const host = document.querySelector("#greatLakesConditions");
  if (host && !host.querySelector("[data-gl-lake]")) {
    setHtml(host, greatLakesConditionsHtml());
    syncGreatLakesLayerControls(host);
  }
  return host;
}

export function greatLakesModelsForView(map) {
  const selectedLake = greatLakesControlValue("lake");
  if (GREAT_LAKE_VIEWS[selectedLake]) return GREAT_LAKE_VIEWS[selectedLake].models;
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

export function setGreatLakesStatus(message, error = false) {
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

export function renderGreatLakesTemperatureRasters(rasters, loadRevision) {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== "temperature") return;
  rasters.forEach((raster) => L.imageOverlay(raster.imageUrl, raster.bounds, {
    opacity: 0.72, interactive: false, className: "great-lakes-temperature-raster"
  }).addTo(greatLakesConditionsLayer));
}

export function renderGreatLakesThermoclineRasters(rasters, loadRevision) {
  if (loadRevision !== greatLakesLoadRevision || greatLakesControlValue("layer") !== "thermocline") return;
  rasters.forEach((raster) => L.imageOverlay(raster.imageUrl, raster.bounds, {
    opacity: 0.78, interactive: false, className: "great-lakes-thermocline-raster"
  }).addTo(greatLakesConditionsLayer));
}

export function clearGreatLakesVisuals() {
  greatLakesParticleLayer?.remove();
  greatLakesParticleLayer = null;
  greatLakesConditionsLayer.clearLayers();
  document.querySelectorAll(".great-lakes-temperature-raster, .great-lakes-thermocline-raster").forEach((image) => image.remove());
}

export function renderGreatLakesCurrents(points, zoom) {
  const stride = zoom <= 5 ? 12 : zoom <= 7 ? 8 : zoom <= 9 ? 5 : 3;
  points.filter((_, index) => index % stride === 0).forEach((point) => {
    const size = Math.max(12, Math.min(28, 12 + point.speed * 55));
    const icon = L.divIcon({ className: "great-lakes-current-arrow", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: html`<span style="font-size:${size}px;transform:rotate(${point.direction - 90}deg)">➤</span>` });
    L.marker([point.latitude, point.longitude], { icon, interactive: false, keyboard: false }).addTo(greatLakesConditionsLayer);
  });
}

export function currentColor(speed) {
  return speed < 0.08 ? "#a3e635" : speed < 0.22 ? "#facc15" : speed < 0.45 ? "#fb923c" : "#ec4899";
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
  const time = profile.validTime && !Number.isNaN(Date.parse(profile.validTime)) ? new Date(profile.validTime).toLocaleString() : "unavailable";
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
      <span class="great-lakes-current-direction">${arrow}${direction}</span>
    </div>`;
  }), "");
  return html`<p class="great-lakes-current-meta">NOAA model forecast valid ${time}${distance}</p>
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
  const selectedDepth = greatLakesControlValue("depth");
  try {
    const profile = await window.noaaGreatLakesApi.currentProfile({ forecastHour: greatLakesControlValue("forecast"), latitude, longitude, models: greatLakesLoadedModelsKey });
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
  if (greatLakesActiveLayer === "currents") {
    return html`<section class="map-overlay-reading"><strong>Underwater currents</strong><button class="great-lakes-profile-button" type="button" data-gl-current-profile-lat="${latitude}" data-gl-current-profile-lon="${longitude}">View current profile</button></section>`;
  }
  const depth = greatLakesControlValue("depth"), forecastHour = greatLakesControlValue("forecast");
  const resolution = 256, models = greatLakesLoadedModelsKey;
  try {
    if (greatLakesActiveLayer === "thermocline") {
      const profile = await window.noaaGreatLakesApi.profile({ forecastHour, latitude, longitude, models });
      if (!profile?.thermocline) return "";
      return html`<section class="map-overlay-reading"><strong>Thermocline depth</strong><span>${greatLakesDepthLabel(Number(profile.thermocline.depthMeters))}</span><button class="great-lakes-profile-button" type="button" data-gl-profile-lat="${latitude}" data-gl-profile-lon="${longitude}">View water-column profile</button></section>`;
    }
    const [value, profile] = await Promise.all([
      window.noaaGreatLakesApi.temperatureValue({ forecastHour, depth, resolution, latitude, longitude, models }),
      window.noaaGreatLakesApi.profile({ forecastHour, latitude, longitude, models }).catch(() => null)
    ]);
    if (!value.available) return "";
    const thermocline = profile?.thermocline ? html`<div class="map-water-reading-row"><span>Thermocline depth</span><strong>${greatLakesDepthLabel(Number(profile.thermocline.depthMeters))}</strong></div>` : "";
    return html`<section class="map-overlay-reading map-water-reading"><strong class="map-water-reading-heading">Water</strong><div class="map-water-reading-row"><span>Temperature</span><strong>${waterTemperatureLabel(value.temperatureC)}</strong></div>${thermocline}<button class="great-lakes-profile-button" type="button" data-gl-profile-lat="${latitude}" data-gl-profile-lon="${longitude}">View water-column profile</button></section>`;
  } catch { return ""; }
}

export function temperatureProfileDialog(profile, depthScale = "", depthLimitMeters = null) {
  const allValues = profile.values || [];
  const availableMaximumDepth = Math.max(...allValues.map((item) => item.depthMeters), 1);
  const requestedMaximumDepth = Number(depthLimitMeters);
  const hasDepthLimit = depthLimitMeters !== null && depthLimitMeters !== undefined && Number.isFinite(requestedMaximumDepth);
  const plottedMaximumDepth = hasDepthLimit ? Math.min(Math.max(requestedMaximumDepth, 0), availableMaximumDepth) : availableMaximumDepth;
  const values = allValues.filter((item) => item.depthMeters <= plottedMaximumDepth);
  const width = 780, height = 680;
  const chart = { top: 12, right: 108, bottom: 72, left: 108 };
  const plotWidth = width - chart.left - chart.right;
  const plotHeight = height - chart.top - chart.bottom;
  const temperatureUnit = typeof unitPreference === "function" ? unitPreference("waterTemperature") : "C";
  const plotTemperature = (temperatureC) => typeof convertUnitValue === "function" ? convertUnitValue(temperatureC, "C", temperatureUnit) : temperatureC;
  const maxDepth = plottedMaximumDepth, minTemp = Math.min(...values.map((item) => plotTemperature(item.temperatureC))), maxTemp = Math.max(...values.map((item) => plotTemperature(item.temperatureC)));
  const logarithmicDepth = depthScale === "logarithmic" || (!depthScale && maxDepth >= 100);
  const x = (temp) => chart.left + ((temp - minTemp) / Math.max(maxTemp - minTemp, 0.1)) * plotWidth;
  const y = (depth) => chart.top + (logarithmicDepth ? Math.log1p(depth) / Math.log1p(maxDepth) : depth / maxDepth) * plotHeight;
  const line = values.map((item) => `${x(plotTemperature(item.temperatureC))},${y(item.depthMeters)}`).join(" ");
  const depthTicks = logarithmicDepth ? [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, maxDepth].filter((value, index, list) => value <= maxDepth && list.indexOf(value) === index) : Array.from({ length: 9 }, (_, index) => maxDepth * index / 8);
  const tickMarkup = joinHtml(depthTicks.map((depth) => html`<line x1="${chart.left}" y1="${y(depth)}" x2="${width - chart.right}" y2="${y(depth)}" stroke-opacity=".22"/><text x="${chart.left - 10}" y="${y(depth) + 4}" text-anchor="end">${greatLakesDepthAxisTick(depth)}</text>`), "");
  const temperatureTicks = Array.from({ length: 7 }, (_, index) => minTemp + (maxTemp - minTemp) * index / 6);
  const temperatureTickMarkup = joinHtml(temperatureTicks.map((temp) => html`<line x1="${x(temp)}" y1="${chart.top}" x2="${x(temp)}" y2="${height - chart.bottom}" stroke-opacity=".14"/><text x="${x(temp)}" y="${height - 22}" text-anchor="middle">${temp.toFixed(1)}°</text>`), "");
  const thermo = profile.thermocline;
  const thermoText = thermo ? html`<section class="great-lakes-thermocline"><strong>Estimated thermocline</strong><span>${greatLakesDepthLabel(thermo.depthMeters)} · ${thermo.gradientCPerMeter.toFixed(2)} °C/m</span><small>${thermo.temperatureAboveC.toFixed(1)} °C above → ${thermo.temperatureBelowC.toFixed(1)} °C below (${greatLakesDepthLabel(thermo.shallowerDepthMeters)}–${greatLakesDepthLabel(thermo.deeperDepthMeters)})</small></section>` : "";
  return html`<dialog class="great-lakes-profile-dialog"><form method="dialog"><button class="icon-button" aria-label="Close">×</button></form><h3>Water-column temperature</h3><p>${new Date(profile.validTime).toLocaleString()}</p><svg viewBox="0 0 ${width} ${height}" data-plot-top="${chart.top}" data-plot-right="${chart.right}" data-plot-bottom="${chart.bottom}" data-plot-left="${chart.left}" role="img" aria-label="Temperature by depth"><line x1="${chart.left}" y1="${chart.top}" x2="${chart.left}" y2="${height - chart.bottom}"/><line x1="${chart.left}" y1="${height - chart.bottom}" x2="${width - chart.right}" y2="${height - chart.bottom}"/>${tickMarkup}${temperatureTickMarkup}<polyline points="${line}" fill="none" stroke="#22c55e" stroke-width="4"/>${joinHtml(values.map((item) => html`<circle cx="${x(item.temperatureC)}" cy="${y(item.depthMeters)}" r="4" fill="#f8fafc" stroke="#22c55e" stroke-width="2.5"/>`), "")}<text x="18" y="${height / 2}" text-anchor="middle" transform="rotate(-90 18 ${height / 2})">Depth (${greatLakesDepthAxisUnit()})</text><text x="${width / 2}" y="${height - 6}" text-anchor="middle">Temperature (°C)</text></svg>${thermoText}</dialog>`;
}

export function showTemperatureProfileDialog(profile, depthScale = greatLakesProfileDepthScale, depthLimitMeters = greatLakesProfileDepthLimit) {
  greatLakesProfileData = profile;
  greatLakesProfileDepthScale = depthScale;
  greatLakesProfileDepthLimit = depthLimitMeters !== null && depthLimitMeters !== undefined && Number.isFinite(Number(depthLimitMeters)) ? Number(depthLimitMeters) : null;
  document.querySelector(".great-lakes-profile-dialog")?.remove();
  insertHtml(document.body, "beforeend", temperatureProfileDialog(profile, depthScale, greatLakesProfileDepthLimit));
  const dialog = document.querySelector(".great-lakes-profile-dialog");
  const thermocline = profile.thermocline;
  const thermoclineSummary = dialog.querySelector(".great-lakes-thermocline");
  if (thermocline && thermoclineSummary) {
    const summary = thermoclineSummary.querySelector("span");
    const details = thermoclineSummary.querySelector("small");
    if (summary) summary.textContent = `${greatLakesDepthLabel(thermocline.depthMeters)} · ${thermoclineGradientLabel(thermocline.gradientCPerMeter)}`;
    if (details) details.textContent = `${waterTemperatureLabel(thermocline.temperatureAboveC)} above → ${waterTemperatureLabel(thermocline.temperatureBelowC)} below (${greatLakesDepthLabel(thermocline.shallowerDepthMeters)}–${greatLakesDepthLabel(thermocline.deeperDepthMeters)})`;
    insertHtml(thermoclineSummary, "beforeend", html`<small>Best estimate based on limited available model data.</small>`);
  }
  const profileUnit = typeof unitPreference === "function" ? unitPreference("waterTemperature") : "C";
  const plottedValues = profile.values.filter((item) => greatLakesProfileDepthLimit == null || item.depthMeters <= greatLakesProfileDepthLimit);
  const displayTemperatures = plottedValues.map((item) => typeof convertUnitValue === "function" ? convertUnitValue(item.temperatureC, "C", profileUnit) : item.temperatureC);
  const minimumTemperature = Math.min(...displayTemperatures), maximumTemperature = Math.max(...displayTemperatures);
  const availableMaximumDepthForPlot = Math.max(...profile.values.map((item) => item.depthMeters), 1);
  const maximumDepth = greatLakesProfileDepthLimit == null ? availableMaximumDepthForPlot : Math.min(greatLakesProfileDepthLimit, availableMaximumDepthForPlot);
  const useLogDepth = depthScale === "logarithmic" || (!depthScale && maximumDepth >= 100);
  const svg = dialog.querySelector("svg");
  const plotTop = Number(svg.dataset.plotTop), plotRight = Number(svg.dataset.plotRight), plotBottom = Number(svg.dataset.plotBottom), plotLeft = Number(svg.dataset.plotLeft);
  const plotWidth = 780 - plotLeft - plotRight, plotHeight = 680 - plotTop - plotBottom;
  dialog.querySelectorAll("svg circle").forEach((circle, index) => {
    const point = plottedValues[index];
    const displayTemperature = displayTemperatures[index];
    const depthPosition = useLogDepth ? Math.log1p(point.depthMeters) / Math.log1p(maximumDepth) : point.depthMeters / maximumDepth;
    circle.setAttribute("cx", plotLeft + ((displayTemperature - minimumTemperature) / Math.max(maximumTemperature - minimumTemperature, 0.1)) * plotWidth);
    circle.setAttribute("cy", plotTop + depthPosition * plotHeight);
    circle.classList.add("great-lakes-profile-point");
    circle.dataset.glProfileTemperature = point.temperatureC;
    circle.dataset.glProfileDepth = point.depthMeters;
    circle.setAttribute("r", "6");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "img");
    const reading = `${waterTemperatureLabel(point.temperatureC)} at ${greatLakesDepthLabel(point.depthMeters)}`;
    circle.setAttribute("aria-label", reading);
    const tooltip = circle.querySelector("title") || document.createElementNS("http://www.w3.org/2000/svg", "title");
    tooltip.textContent = reading;
    if (!tooltip.parentNode) circle.append(tooltip);
  });
  dialog.querySelector("svg text:last-of-type").textContent = `Temperature (°${profileUnit})`;
  const axisLabels = dialog.querySelectorAll("svg text");
  axisLabels[axisLabels.length - 2].textContent = `Depth (${greatLakesDepthAxisUnit()})`;
  axisLabels[axisLabels.length - 1].textContent = `Temperature (°${profileUnit})`;
  axisLabels[axisLabels.length - 1].setAttribute("y", "674");
  const availableMaximumDepth = Math.max(...profile.values.map((item) => item.depthMeters), 1);
  const linearRangeControl = depthScale === "linear" ? html`<label class="great-lakes-profile-depth-range">Depth range <output data-gl-profile-depth-output>Surface–${greatLakesDepthLabel(maximumDepth)}</output><input type="range" data-gl-profile-depth-limit min="1" max="${Math.ceil(availableMaximumDepth)}" step="1" value="${Math.ceil(maximumDepth)}" aria-label="Linear plot maximum depth" /></label>` : "";
  insertHtml(dialog.querySelector("p"), "afterend", html`<div class="great-lakes-profile-controls"><div class="great-lakes-profile-scale" role="group" aria-label="Depth scale"><button type="button" data-gl-profile-scale="linear" aria-pressed="${depthScale === "linear"}">Linear</button><button type="button" data-gl-profile-scale="logarithmic" aria-pressed="${depthScale === "logarithmic" || (!depthScale && Math.max(...profile.values.map((item) => item.depthMeters)) >= 100)}">Logarithmic</button></div>${linearRangeControl}</div>`);
  dialog.showModal();
}

export function createParticleLayer(map, fields) {
  const canvas = L.DomUtil.create("canvas", "great-lakes-current-flow leaflet-layer");
  const ctx = canvas.getContext("2d");
  const particles = [];
  let frame = null, last = 0, active = true;
  const density = { low: 350, medium: 900, high: 1700 }[greatLakesControlValue("density")] || 900;
  const speedScale = { slow: 0.55, normal: 1, fast: 1.8 }[greatLakesControlValue("animation-speed")] || 1;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resize() { const size = map.getSize(); const ratio = window.devicePixelRatio || 1; const origin = map.containerPointToLayerPoint([0, 0]); L.DomUtil.setPosition(canvas, origin); canvas.width = size.x * ratio; canvas.height = size.y * ratio; canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.x, size.y); }
  function sample(lat, lon) {
    for (const field of fields) {
      const ys = field.latitudeAxis, xs = field.longitudeAxis;
      const yMin = Math.min(ys[0], ys[ys.length - 1]), yMax = Math.max(ys[0], ys[ys.length - 1]);
      const xMin = Math.min(xs[0], xs[xs.length - 1]), xMax = Math.max(xs[0], xs[xs.length - 1]);
      if (lat < yMin || lat > yMax || lon < xMin || lon > xMax) continue;
      const find = (axis, value) => { let low = 0, high = axis.length - 1; const asc = axis[high] > axis[0]; while (high - low > 1) { const mid = (low + high) >> 1; if ((asc ? axis[mid] < value : axis[mid] > value)) low = mid; else high = mid; } return low; };
      const row = find(ys, lat), col = find(xs, lon), i = row * field.columns + col, ids = [i, i + 1, i + field.columns, i + field.columns + 1];
      const wet = ids.map((index, position) => field.mask[index] ? position : -1).filter((position) => position >= 0);
      if (!wet.length) continue;
      const fy = (lat - ys[row]) / (ys[row + 1] - ys[row]); const fx = (lon - xs[col]) / (xs[col + 1] - xs[col]);
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const blend = (values) => { const total = wet.reduce((sum, position) => sum + weights[position], 0); return total ? wet.reduce((sum, position) => sum + values[ids[position]] * weights[position], 0) / total : values[ids[wet[0]]]; };
      return { u: blend(field.u), v: blend(field.v) };
    }
    return null;
  }
  function spawn(particle = {}) { const bounds = map.getBounds(); for (let attempt = 0; attempt < 30; attempt += 1) { const latitude = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()); const longitude = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()); if (sample(latitude, longitude)) return Object.assign(particle, { latitude, longitude, age: 0, maxAge: 45 + Math.random() * 50 }); } return Object.assign(particle, { age: 999 }); }
  function reset() { particles.length = 0; for (let index = 0; index < density; index += 1) particles.push(spawn({})); }
  function tick(now) { if (!active) return; if (document.hidden) { frame = requestAnimationFrame(tick); return; } if (now - last < 33) { frame = requestAnimationFrame(tick); return; } last = now; const size = map.getSize(); ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = "rgba(0,0,0,0.90)"; ctx.fillRect(0, 0, size.x, size.y); ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 2.2; particles.forEach((particle) => { const vector = sample(particle.latitude, particle.longitude); if (!vector || particle.age++ > particle.maxAge) { spawn(particle); return; } const old = map.latLngToContainerPoint([particle.latitude, particle.longitude]); const seconds = (reduced ? 0 : 120) * speedScale; particle.latitude += vector.v * seconds / 111320; particle.longitude += vector.u * seconds / (111320 * Math.cos(particle.latitude * Math.PI / 180)); const next = map.latLngToContainerPoint([particle.latitude, particle.longitude]); if (!map.getBounds().contains([particle.latitude, particle.longitude]) || !sample(particle.latitude, particle.longitude)) { spawn(particle); return; } ctx.strokeStyle = currentColor(Math.hypot(vector.u, vector.v)); ctx.beginPath(); ctx.moveTo(old.x, old.y); ctx.lineTo(next.x, next.y); ctx.stroke(); }); frame = requestAnimationFrame(tick); }
  function refreshViewport() { resize(); reset(); }
  return { addTo() { map.getPane("overlayPane").appendChild(canvas); refreshViewport(); map.on("resize viewreset moveend", refreshViewport); frame = requestAnimationFrame(tick); return this; }, remove() { active = false; cancelAnimationFrame(frame); map.off("resize viewreset moveend", refreshViewport); canvas.remove(); } };
}

export async function loadGreatLakesConditions(map) {
  if (!greatLakesConditionsLayer) return;
  const loadRevision = ++greatLakesLoadRevision;
  const layer = greatLakesControlValue("layer");
  greatLakesConditionsRequest?.abort();
  if (!layer) {
    setGreatLakesMapLoading(false);
    document.body.classList.add("great-lakes-layer-none");
    clearGreatLakesVisuals();
    greatLakesActiveLayer = "";
    greatLakesLoadedModelsKey = "";
    setGreatLakesStatus("Choose a layer to show NOAA Great Lakes conditions.");
    return;
  }
  document.body.classList.remove("great-lakes-layer-none");
  const forecastHour = greatLakesControlValue("forecast");
  const depth = greatLakesControlValue("depth");
  const resolution = map.getZoom() >= 9 ? 512 : map.getZoom() >= 7 ? 384 : 256;
  const models = greatLakesModelsForView(map);
  const modelsKey = models.join(",");
  if (!models.length) {
    setGreatLakesMapLoading(false);
    setGreatLakesStatus("Move the map over a Great Lake to load NOAA model data.");
    return;
  }
  const cacheKey = JSON.stringify({ layer, forecastHour, depth, resolution, models: modelsKey });
  const cached = greatLakesPayloadCache.get(cacheKey);
  const cacheHit = cached && Date.now() - cached.createdAt < GREAT_LAKES_CLIENT_CACHE_MS;
  greatLakesConditionsRequest = cacheHit ? null : new AbortController();
  setGreatLakesStatus(layer === "currents" ? "Showing NOAA model forecast valid at an unavailable time." : "Loading NOAA Great Lakes model data…");
  setGreatLakesMapLoading(true);
  clearGreatLakesVisuals();
  try {
    let payload = cacheHit ? cached.payload : null;
    if (!payload) {
      payload = await window.noaaGreatLakesApi.conditions({ layer, forecastHour, depth, resolution, models: modelsKey, signal: greatLakesConditionsRequest.signal });
      greatLakesPayloadCache.set(cacheKey, { payload, createdAt: Date.now() });
    }
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
    else {
      setCurrentLegendRange(payload.metadata);
      const display = greatLakesControlValue("current-display");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (display === "flow" && !reduced && (payload.fields || []).length) greatLakesParticleLayer = createParticleLayer(map, payload.fields).addTo(map);
      else if (display !== "off") renderGreatLakesCurrents(payload.data || [], map.getZoom());
    }
    const unavailable = (payload.metadata.models || []).some((model) => !model.available);
    const validTime = (payload.metadata.models || []).find((model) => model.validTime)?.validTime;
    const label = layer === "temperature" ? "Surface temperature" : layer === "thermocline" ? "Thermocline depth" : "Underwater current data";
    const sampledOnly = layer === "currents" && !(payload.fields || []).length && (payload.data || []).length;
    setGreatLakesStatus(`${unavailable ? `${label} unavailable for one or more lakes. ` : ""}Showing NOAA model forecast valid at ${validTime ? new Date(validTime).toLocaleString() : "an unavailable time"}.${sampledOnly ? " Flow grid unavailable; showing sampled current arrows." : ""}`, unavailable);
  } catch (error) {
    if (loadRevision === greatLakesLoadRevision && error.name !== "AbortError") setGreatLakesStatus("NOAA Great Lakes model data is unavailable. Try again shortly.", true);
  } finally {
    if (loadRevision === greatLakesLoadRevision) setGreatLakesMapLoading(false);
  }
}

export function setup() {
  renderGreatLakesConditionsHost();

  document.addEventListener("change", (event) => {
    const control = event.target.closest("[data-gl-lake], [data-gl-layer], [data-gl-depth]");
    if (!control) return;
    const host = renderGreatLakesConditionsHost();
    if (!host) return;
    syncGreatLakesLayerControls(host);
    if (control.matches("[data-gl-lake]") && GREAT_LAKE_VIEWS[control.value] && ui.fishMap) {
      const lake = GREAT_LAKE_VIEWS[control.value];
      ui.fishMap.setView(lake.center, lake.zoom);
    }
    if (ui.fishMap) {
      loadGreatLakesConditions(ui.fishMap);
      const layer = greatLakesControlValue("layer");
      if (layer === "currents") {
        greatLakesActiveLayer = "currents";
        greatLakesLoadedModelsKey = greatLakesModelsForView(ui.fishMap).join(",") || "LOOFS";
        setTimeout(() => {
          if (greatLakesControlValue("layer") === "currents") {
            setGreatLakesStatus("Showing NOAA model forecast valid at an unavailable time.");
          }
        }, 0);
      }
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
    button.disabled = true;
    button.textContent = "Loading profile…";
    try {
      const profile = await window.noaaGreatLakesApi.profile({ forecastHour: greatLakesControlValue("forecast"), latitude: button.dataset.glProfileLat, longitude: button.dataset.glProfileLon, models: greatLakesLoadedModelsKey });
      if (!profile.available) throw new Error("Profile unavailable");
      showTemperatureProfileDialog(profile);
      button.textContent = "View water-column profile";
    } catch { button.textContent = "Profile unavailable"; }
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

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gl-profile-scale]");
    if (button && greatLakesProfileData) showTemperatureProfileDialog(greatLakesProfileData, button.dataset.glProfileScale, null);
  });

  document.addEventListener("input", (event) => {
    const slider = event.target.closest("[data-gl-profile-depth-limit]");
    if (!slider) return;
    const output = slider.closest(".great-lakes-profile-depth-range")?.querySelector("[data-gl-profile-depth-output]");
    if (output) output.textContent = `Surface–${greatLakesDepthLabel(Number(slider.value))}`;
  });

  document.addEventListener("change", (event) => {
    const slider = event.target.closest("[data-gl-profile-depth-limit]");
    if (slider && greatLakesProfileData) showTemperatureProfileDialog(greatLakesProfileData, "linear", Number(slider.value));
  });

  document.addEventListener("click", (event) => {
    const point = event.target.closest(".great-lakes-profile-point");
    if (!point) return;
    const dialog = point.closest(".great-lakes-profile-dialog");
    dialog.querySelector(".great-lakes-profile-point-reading")?.remove();
    insertHtml(dialog.querySelector("svg"), "afterend", html`<p class="great-lakes-profile-point-reading">${waterTemperatureLabel(Number(point.dataset.glProfileTemperature))} at ${greatLakesDepthLabel(Number(point.dataset.glProfileDepth))}</p>`);
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
