// The water-column dialog: temperature from the surface to the lake bed at one
// point, with the thermocline band (from where the warm water ends to where the
// cooling eases) shaded.
import { html, joinHtml, setHtml } from "./html.js";
import { friendlyTime, greatLakesDepthLabel, greatLakesDepthValueLabel, historyTimeLabel, waterTemperatureLabel } from "./great-lakes-conditions.js";
import { convertUnitValue, unitPreference } from "./app-units.js";

const FEET_PER_METER = 3.28084;
const MODEL_LAKES = { LSOFS: "Lake Superior", LMHOFS: "Lakes Michigan and Huron", LEOFS: "Lake Erie", LOOFS: "Lake Ontario" };
// Zoom presets in the display unit; only those shallower than the water are offered.
const ZOOM_PRESETS = { ft: [50, 100, 200], m: [15, 30, 60] };
// Less variation than this through the whole column draws as a straight line (0.5 °F in
// either unit; the server never finds a thermocline in a column that varies less).
const UNIFORM_SPAN = { F: 0.5, C: 0.5 / 1.8 };

let currentProfile = null;
let chosenZoom = null; // null = automatic; 0 = whole column; otherwise a preset depth in display units.

function depthUnit() {
  return unitPreference("depth") === "ft" ? "ft" : "m";
}

function temperatureUnit() {
  return unitPreference("waterTemperature") === "F" ? "F" : "C";
}

const toDisplayDepth = (meters) => depthUnit() === "ft" ? meters * FEET_PER_METER : meters;
// Plotted at the 0.1? the readings are shown with, so levels that read the same
// line up vertically instead of drifting with model noise far below that.
const toDisplayTemperature = (celsius) => Math.round(convertUnitValue(celsius, "C", temperatureUnit()) * 10) / 10;

// Saved profiles (a past hour) are the conditions as they were, not a forecast.
function forecastTimeText(validTime, saved = false) {
  const when = saved ? historyTimeLabel(validTime) : friendlyTime(validTime);
  const source = saved ? "Saved NOAA conditions" : "NOAA forecast";
  return when ? `${source} for ${when}` : source;
}

// 1, 2, 2.5, or 5 × 10^n: a tick step that gives about `count` ticks.
export function niceStep(range, count = 5) {
  const raw = Math.max(range, 1e-9) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= raw) * magnitude;
  return step;
}

export function niceTicks(minimum, maximum, count = 5) {
  const step = niceStep(maximum - minimum, count);
  const ticks = [];
  for (let value = Math.ceil(minimum / step - 1e-9) * step; value <= maximum + 1e-9; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

// Temperature at any depth, straight-line between the model's levels.
export function temperatureAtDepth(values, depthMeters) {
  if (!values.length) return null;
  if (depthMeters <= values[0].depthMeters) return values[0].temperatureC;
  for (let index = 1; index < values.length; index += 1) {
    const shallow = values[index - 1], deep = values[index];
    if (depthMeters <= deep.depthMeters) {
      const fraction = (depthMeters - shallow.depthMeters) / Math.max(deep.depthMeters - shallow.depthMeters, 1e-9);
      return shallow.temperatureC + fraction * (deep.temperatureC - shallow.temperatureC);
    }
  }
  return values[values.length - 1].temperatureC;
}

// The automatic zoom frames the thermocline with room below it; mixed or
// shallow water shows the whole column.
export function zoomOptions(maxDepthMeters, unit = depthUnit()) {
  const maxDisplay = unit === "ft" ? maxDepthMeters * FEET_PER_METER : maxDepthMeters;
  return ZOOM_PRESETS[unit].filter((preset) => preset < maxDisplay * 0.8);
}

// Top, bottom, and thickness of the thermocline (older payloads only had a single depth).
export function thermoclineBand(thermocline) {
  if (!thermocline) return null;
  const top = Number(thermocline.topDepthMeters ?? thermocline.depthMeters);
  const bottom = Math.max(top, Number(thermocline.bottomDepthMeters ?? top));
  return Number.isFinite(top) ? { top, bottom, thickness: bottom - top } : null;
}

// "55–66 ft"; a band thinner than a depth unit reads as its top only.
export function depthRangeLabel(band) {
  if (!band) return "";
  const top = greatLakesDepthLabel(band.top), bottom = greatLakesDepthLabel(band.bottom);
  return top === bottom ? top : `${top.replace(/\s*(ft|m)$/, "")}–${bottom}`;
}

// "11 ft thick"; a band thinner than the depth units read is "a thin layer".
// Mixed water says so; water that cools gradually (the API's noThermocline "gradual") gets no note.
export function noThermoclineLabel(profile) {
  return profile?.noThermocline === "gradual" ? "" : "Mixed top to bottom";
}

export function thicknessLabel(band) {
  return band && toDisplayDepth(band.thickness) >= 1 ? `${greatLakesDepthValueLabel(band.thickness)} thick` : "a thin layer";
}

export function automaticZoom(profile, unit = depthUnit()) {
  const values = profile.values || [];
  const maxDepth = Math.max(...values.map((item) => item.depthMeters), 1);
  const band = thermoclineBand(profile.thermocline);
  if (!band) return 0;
  // The whole band, with room below it.
  const wanted = (unit === "ft" ? FEET_PER_METER : 1) * Math.max(band.top * 1.8, band.bottom * 1.25);
  return zoomOptions(maxDepth, unit).find((preset) => preset >= wanted) || 0;
}

function sortedValues(profile) {
  return [...(profile.values || [])].filter((item) => Number.isFinite(item.depthMeters) && Number.isFinite(item.temperatureC)).sort((a, b) => a.depthMeters - b.depthMeters);
}

function statsHtml(profile, values) {
  const surface = values[0];
  const band = thermoclineBand(profile.thermocline);
  const thermoclineCard = band
    ? html`<div class="wc-stat"><span>Thermocline</span><strong>${greatLakesDepthLabel(band.top)}</strong><small>To ${greatLakesDepthLabel(band.bottom)} · ${thicknessLabel(band)}</small></div>`
    : html`<div class="wc-stat"><span>Thermocline</span><strong>None</strong>${noThermoclineLabel(profile) ? html`<small>${noThermoclineLabel(profile)}</small>` : ""}</div>`;
  return html`<div class="wc-stats">
    <div class="wc-stat"><span>Surface</span><strong>${waterTemperatureLabel(surface.temperatureC)}</strong></div>
    ${thermoclineCard}
  </div>`;
}

function zoomHtml(values, zoom) {
  const maxDepth = values[values.length - 1].depthMeters;
  const unit = depthUnit();
  const presets = zoomOptions(maxDepth, unit);
  if (!presets.length) return "";
  const button = (value, label) => html`<button type="button" data-wc-zoom="${value}" aria-pressed="${zoom === value}">${label}</button>`;
  return html`<div class="wc-zoom" role="group" aria-label="Depth shown">${button(0, "Whole column")}${joinHtml([...presets].reverse().map((preset) => button(preset, `Top ${preset} ${unit}`)), "")}</div>`;
}

function tableHtml(values) {
  return html`<details class="wc-table"><summary>All model levels (${values.length})</summary><table>
    <thead><tr><th scope="col">Depth</th><th scope="col">Temperature</th></tr></thead>
    <tbody>${joinHtml(values.map((item) => html`<tr><td>${greatLakesDepthLabel(item.depthMeters)}</td><td>${waterTemperatureLabel(item.temperatureC)}</td></tr>`), "")}</tbody>
  </table></details>`;
}

export function waterColumnDialogHtml(profile, zoom) {
  const values = sortedValues(profile);
  const lake = MODEL_LAKES[profile.model];
  const subtitle = [forecastTimeText(profile.validTime, Boolean(profile.historyTime)), lake].filter(Boolean).join(" · ");
  return html`<dialog class="water-column-dialog" aria-labelledby="waterColumnTitle">
    <header class="wc-header">
      <div><h3 id="waterColumnTitle">Water column</h3><p>${subtitle}</p></div>
      <form method="dialog"><button class="icon-button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10m0-10L7 17"/></svg></button></form>
    </header>
    ${statsHtml(profile, values)}
    ${zoomHtml(values, zoom)}
    <div class="wc-chart" data-wc-chart tabindex="0" role="img" aria-label="Water temperature by depth. Use the up and down arrow keys to read each model level."></div>
    ${tableHtml(values)}
    <p class="wc-note">This is our best estimate of the thermocline’s location based on NOAA data, but it may not be accurate.</p>
  </dialog>`;
}

// The chart is drawn at the size it is shown, so its text stays readable on a phone.
export function waterColumnChartSvg(profile, zoom, width, height) {
  const values = sortedValues(profile);
  const unit = depthUnit(), tempUnit = temperatureUnit();
  const fullDepthDisplay = toDisplayDepth(values[values.length - 1].depthMeters);
  const maxDisplayDepth = zoom > 0 ? Math.min(zoom, fullDepthDisplay) : fullDepthDisplay;
  const maxDepthMeters = unit === "ft" ? maxDisplayDepth / FEET_PER_METER : maxDisplayDepth;
  const shown = values.filter((item) => item.depthMeters <= maxDepthMeters + 1e-6);
  const edge = temperatureAtDepth(values, maxDepthMeters);
  if (shown[shown.length - 1].depthMeters < maxDepthMeters - 1e-6 && edge !== null) shown.push({ depthMeters: maxDepthMeters, temperatureC: edge, interpolated: true });

  // A column that varies less than the model can resolve is drawn as one
  // straight line at its average, instead of a slant made of model noise.
  const exact = shown.map((item) => convertUnitValue(item.temperatureC, "C", tempUnit));
  const uniform = Math.max(...exact) - Math.min(...exact) < UNIFORM_SPAN[tempUnit];
  const uniformTemp = Math.round(exact.reduce((sum, value) => sum + value, 0) / exact.length * 10) / 10;
  const plotTemp = (celsius) => uniform ? uniformTemp : toDisplayTemperature(celsius);
  const temperatures = shown.map((item) => plotTemp(item.temperatureC));
  let minTemp = Math.min(...temperatures), maxTemp = Math.max(...temperatures);
  const minimumSpan = tempUnit === "F" ? 4 : 2;
  if (maxTemp - minTemp < minimumSpan) {
    const middle = (maxTemp + minTemp) / 2;
    minTemp = middle - minimumSpan / 2;
    maxTemp = middle + minimumSpan / 2;
  }
  const tempTicks = niceTicks(minTemp, maxTemp, width < 420 ? 3 : 5);
  minTemp = Math.min(minTemp, tempTicks[0]);
  maxTemp = Math.max(maxTemp, tempTicks[tempTicks.length - 1]);

  const plot = { left: 58, right: width - 14, top: 46, bottom: height - 14 };
  const x = (temperature) => plot.left + (temperature - minTemp) / Math.max(maxTemp - minTemp, 1e-9) * (plot.right - plot.left);
  const y = (depthMeters) => plot.top + toDisplayDepth(depthMeters) / Math.max(maxDisplayDepth, 1e-9) * (plot.bottom - plot.top);

  const depthTicks = niceTicks(0, maxDisplayDepth, Math.max(4, Math.round((plot.bottom - plot.top) / 70)));
  const depthTick = (display) => display === 0 ? "Surface" : `${Number(display.toFixed(1))} ${unit}`;
  const gridY = joinHtml(depthTicks.map((display) => {
    const meters = unit === "ft" ? display / FEET_PER_METER : display;
    return html`<line class="wc-grid" x1="${plot.left}" x2="${plot.right}" y1="${y(meters)}" y2="${y(meters)}"/><text class="wc-axis" x="${plot.left - 8}" y="${y(meters) + 4}" text-anchor="end">${depthTick(display)}</text>`;
  }), "");
  const gridX = joinHtml(tempTicks.map((temperature) => html`<line class="wc-grid" x1="${x(temperature)}" x2="${x(temperature)}" y1="${plot.top}" y2="${plot.bottom}"/><text class="wc-axis" x="${x(temperature)}" y="${plot.top - 10}" text-anchor="middle">${Number(temperature.toFixed(1))}°</text>`), "");

  const thermocline = profile.thermocline;
  // Mixed water says so in the corner the line is not in.
  const mixedLabel = thermocline || !noThermoclineLabel(profile) ? "" : (() => {
    const onLeft = x(plotTemp(values[0].temperatureC)) > (plot.left + plot.right) / 2;
    return html`<text class="wc-chart-note" x="${onLeft ? plot.left + 8 : plot.right - 8}" y="${plot.top + 16}" text-anchor="${onLeft ? "start" : "end"}">${noThermoclineLabel(profile)}</text>`;
  })();

  const linePoints = shown.map((item) => `${x(plotTemp(item.temperatureC)).toFixed(1)},${y(item.depthMeters).toFixed(1)}`);
  // The band is shaded from its top to its bottom (cut at the zoom); the tag sits on the top line.
  const band = thermoclineBand(thermocline);
  const bandBottom = band ? Math.min(band.bottom, maxDepthMeters) : 0;
  const tagText = band ? `Thermocline ${depthRangeLabel(band)}` : "";
  const tagWidth = Math.round(tagText.length * 6.4 + 18);
  const thermoclineBandShade = band && band.top <= maxDepthMeters && bandBottom > band.top
    ? html`<rect class="wc-thermocline-band" x="${plot.left}" width="${plot.right - plot.left}" y="${y(band.top)}" height="${y(bandBottom) - y(band.top)}"/>`
    : "";
  const thermoclineMarker = band && band.top <= maxDepthMeters
    ? html`<line class="wc-thermocline-line" x1="${plot.left}" x2="${plot.right}" y1="${y(band.top)}" y2="${y(band.top)}"/>${band.bottom <= maxDepthMeters && band.thickness > 0 ? html`<line class="wc-thermocline-line is-bottom" x1="${plot.left}" x2="${plot.right}" y1="${y(band.bottom)}" y2="${y(band.bottom)}"/>` : ""}<g class="wc-thermocline-tag" transform="translate(${plot.left + 6} ${y(band.top) - 11})"><rect width="${tagWidth}" height="20" rx="10"/><text x="${tagWidth / 2}" y="14" text-anchor="middle">${tagText}</text></g>`
    : "";
  const dots = joinHtml(shown.filter((item) => !item.interpolated).map((item) => html`<circle class="wc-dot" cx="${x(plotTemp(item.temperatureC))}" cy="${y(item.depthMeters)}" r="3.5"/>`), "");

  return html`<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" data-plot-left="${plot.left}" data-plot-right="${plot.right}" data-plot-top="${plot.top}" data-plot-bottom="${plot.bottom}" data-max-depth="${maxDepthMeters}" data-min-temp="${minTemp}" data-max-temp="${maxTemp}" data-uniform-temp="${uniform ? uniformTemp : ""}">
    ${thermoclineBandShade}${gridY}${gridX}${mixedLabel}
    <text class="wc-axis wc-axis-title" x="${plot.left}" y="13">Temperature (°${tempUnit})</text>
    <polyline class="wc-line" points="${linePoints.join(" ")}"/>
    ${dots}${thermoclineMarker}
    <g class="wc-cursor" visibility="hidden"><line class="wc-cursor-line" x1="${plot.left}" x2="${plot.right}"/><circle class="wc-cursor-dot" r="6"/></g>
  </svg><div class="wc-readout" hidden></div>`;
}

function drawChart(dialog) {
  const host = dialog.querySelector("[data-wc-chart]");
  if (!host || !currentProfile) return;
  const width = Math.max(280, Math.round(host.clientWidth));
  const height = Math.round(Math.max(300, Math.min(520, width * 0.78, window.innerHeight * 0.55)));
  setHtml(host, waterColumnChartSvg(currentProfile, zoomFor(currentProfile), width, height));
}

function zoomFor(profile) {
  const values = sortedValues(profile);
  const available = zoomOptions(values[values.length - 1].depthMeters);
  if (chosenZoom === 0 || available.includes(chosenZoom)) return chosenZoom;
  return automaticZoom(profile);
}

function showReadout(dialog, depthMeters) {
  const svg = dialog.querySelector("[data-wc-chart] svg");
  const readout = dialog.querySelector(".wc-readout");
  if (!svg || !readout || !currentProfile) return;
  const values = sortedValues(currentProfile);
  const plot = { left: Number(svg.dataset.plotLeft), right: Number(svg.dataset.plotRight), top: Number(svg.dataset.plotTop), bottom: Number(svg.dataset.plotBottom) };
  const maxDepth = Number(svg.dataset.maxDepth), minTemp = Number(svg.dataset.minTemp), maxTemp = Number(svg.dataset.maxTemp);
  const depth = Math.max(0, Math.min(maxDepth, depthMeters));
  const temperature = temperatureAtDepth(values, depth);
  if (temperature === null) return;
  const cursorY = plot.top + depth / Math.max(maxDepth, 1e-9) * (plot.bottom - plot.top);
  const plotted = svg.dataset.uniformTemp ? Number(svg.dataset.uniformTemp) : toDisplayTemperature(temperature);
  const cursorX = plot.left + (plotted - minTemp) / Math.max(maxTemp - minTemp, 1e-9) * (plot.right - plot.left);
  const cursor = svg.querySelector(".wc-cursor");
  cursor.setAttribute("visibility", "visible");
  cursor.querySelector("line").setAttribute("y1", cursorY);
  cursor.querySelector("line").setAttribute("y2", cursorY);
  cursor.querySelector("circle").setAttribute("cx", cursorX);
  cursor.querySelector("circle").setAttribute("cy", cursorY);
  readout.hidden = false;
  readout.textContent = `${waterTemperatureLabel(temperature)} at ${greatLakesDepthLabel(depth)}`;
  const rect = svg.getBoundingClientRect();
  const scale = rect.width / Number(svg.viewBox.baseVal.width || rect.width);
  readout.style.top = `${Math.max(0, cursorY * scale - 34)}px`;
  readout.style.left = `${Math.min(Math.max(cursorX * scale, 90), rect.width - 90)}px`;
  dialog.dataset.wcDepth = String(depth);
}

function hideReadout(dialog) {
  dialog.querySelector(".wc-cursor")?.setAttribute("visibility", "hidden");
  const readout = dialog.querySelector(".wc-readout");
  if (readout) readout.hidden = true;
}

function depthFromPointer(svg, event) {
  const rect = svg.getBoundingClientRect();
  const scale = Number(svg.viewBox.baseVal.height || rect.height) / rect.height;
  const top = Number(svg.dataset.plotTop), bottom = Number(svg.dataset.plotBottom);
  const yInSvg = (event.clientY - rect.top) * scale;
  return (yInSvg - top) / Math.max(bottom - top, 1e-9) * Number(svg.dataset.maxDepth);
}

function wire(dialog) {
  const chart = dialog.querySelector("[data-wc-chart]");
  const move = (event) => {
    const svg = chart.querySelector("svg");
    if (svg) showReadout(dialog, depthFromPointer(svg, event));
  };
  chart.addEventListener("pointermove", move);
  chart.addEventListener("pointerdown", (event) => { chart.setPointerCapture?.(event.pointerId); move(event); });
  chart.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") hideReadout(dialog); });
  chart.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const svg = chart.querySelector("svg");
    const levels = sortedValues(currentProfile).map((item) => item.depthMeters).filter((depth) => depth <= Number(svg?.dataset.maxDepth ?? Infinity) + 1e-6);
    const current = Number(dialog.dataset.wcDepth ?? -1);
    let next;
    if (event.key === "Home") next = levels[0];
    else if (event.key === "End") next = levels[levels.length - 1];
    else if (event.key === "ArrowDown") next = levels.find((depth) => depth > current + 1e-6) ?? levels[levels.length - 1];
    else next = [...levels].reverse().find((depth) => depth < current - 1e-6) ?? levels[0];
    showReadout(dialog, next);
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-wc-zoom]");
    if (!button) return;
    chosenZoom = Number(button.dataset.wcZoom);
    dialog.querySelectorAll("[data-wc-zoom]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    drawChart(dialog);
  });
  if (typeof ResizeObserver === "function") {
    let lastWidth = 0;
    const observer = new ResizeObserver(() => {
      const width = Math.round(chart.clientWidth);
      if (width && width !== lastWidth) { lastWidth = width; drawChart(dialog); }
    });
    observer.observe(chart);
    dialog.addEventListener("close", () => observer.disconnect(), { once: true });
  }
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

export function showWaterColumnDialog(profile) {
  currentProfile = profile;
  document.querySelector(".water-column-dialog")?.remove();
  const holder = document.createElement("div");
  setHtml(holder, waterColumnDialogHtml(profile, zoomFor(profile)));
  const dialog = holder.firstElementChild;
  document.body.append(dialog);
  wire(dialog);
  dialog.showModal();
  drawChart(dialog);
}
