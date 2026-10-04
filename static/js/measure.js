// Measure the distance and bearing between two points on the map.
import { html, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { currentDirectionLabel } from "./great-lakes-conditions.js";
import { unitPreference } from "./app-units.js";

// The logbook sets units one by one; distances follow the depth unit.
const currentUnitSystem = () => (unitPreference("depth") === "m" ? "metric" : "imperial");

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_NAUTICAL_MILE = 1852;
const LINE_COLOR = "#ffffff";
const HALO_COLOR = "rgba(0, 0, 0, 0.55)";

const radians = (degrees) => degrees * Math.PI / 180;

// Great-circle distance between two [latitude, longitude] points.
export function distanceMeters([lat1, lon1], [lat2, lon2]) {
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Initial compass bearing (degrees true) from the first point toward the second.
export function bearingDegrees([lat1, lon1], [lat2, lon2]) {
  const dLon = radians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(radians(lat2));
  const x = Math.cos(radians(lat1)) * Math.sin(radians(lat2)) - Math.sin(radians(lat1)) * Math.cos(radians(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function fixed(value) {
  return value.toFixed(value < 10 ? 2 : 1);
}

// "12.4 mi · 10.8 nmi" (imperial) or "20.0 km · 10.8 nmi" (metric); short distances in ft or m.
export function formatDistance(meters, system = currentUnitSystem()) {
  const nautical = `${fixed(meters / METERS_PER_NAUTICAL_MILE)} nmi`;
  if (system === "metric") {
    return `${meters < 1000 ? `${Math.round(meters)} m` : `${fixed(meters / 1000)} km`} · ${nautical}`;
  }
  const miles = meters / METERS_PER_MILE;
  return `${miles < 0.2 ? `${Math.round(meters / METERS_PER_FOOT)} ft` : `${fixed(miles)} mi`} · ${nautical}`;
}

export function formatBearing(degrees) {
  const rounded = Math.round(degrees) % 360;
  return `${rounded}° ${currentDirectionLabel(rounded)}`;
}

export function measurementText(from, to, system = currentUnitSystem()) {
  return `${formatDistance(distanceMeters(from, to), system)} · ${formatBearing(bearingDegrees(from, to))}`;
}

const RULER_ICON = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2m1-5 2 2m1-5 2 2"/></svg>`;

let measuring = false;

export function isMeasuring() {
  return measuring;
}

export function addMeasureControl(map, { position = "bottomright" } = {}) {
  if (!map.getPane("measure")) {
    // Above the data layers and stations, below tooltips and popups.
    map.createPane("measure").style.zIndex = 620;
  }
  const renderer = L.svg({ pane: "measure" });
  const points = [];
  let markers = [];
  let halo = null, line = null, preview = null, label = null, hint = null, button = null;

  const toLatLng = (latlng) => [latlng.lat, latlng.lng];
  const touch = () => window.matchMedia("(pointer: coarse)").matches;

  function hintText() {
    if (points.length === 2) return measurementText(points[0], points[1]);
    if (points.length === 1) return `${touch() ? "Tap" : "Click"} the second point`;
    return `${touch() ? "Tap" : "Click"} two points to measure`;
  }

  function updateHint(text = hintText()) {
    if (!hint) return;
    const value = hint.querySelector("[data-measure-text]");
    value.textContent = text;
    hint.classList.toggle("has-result", points.length === 2);
  }

  function clearDrawing() {
    markers.forEach((marker) => marker.remove());
    markers = [];
    [halo, line, preview, label].forEach((layer) => layer?.remove());
    halo = line = preview = label = null;
    points.length = 0;
  }

  function drawLine() {
    if (points.length < 2) return;
    if (!line) {
      halo = L.polyline(points, { renderer, color: HALO_COLOR, weight: 7, interactive: false }).addTo(map);
      line = L.polyline(points, { renderer, color: LINE_COLOR, weight: 3, dashArray: "8 6", interactive: false }).addTo(map);
      label = L.tooltip({ permanent: true, direction: "center", className: "measure-label", interactive: false });
    } else {
      halo.setLatLngs(points);
      line.setLatLngs(points);
    }
    label.setLatLng(L.latLngBounds(points).getCenter()).setContent(measurementText(points[0], points[1]));
    if (!map.hasLayer(label)) label.addTo(map);
  }

  function addPoint(latlng) {
    if (points.length === 2) clearDrawing();
    const index = points.length;
    points.push(toLatLng(latlng));
    const marker = L.marker(latlng, {
      pane: "measure",
      draggable: true,
      keyboard: false,
      icon: L.divIcon({ className: "measure-point", html: "<span></span>", iconSize: [18, 18] })
    }).addTo(map);
    // Drag a point to adjust the measurement.
    marker.on("drag", (event) => {
      points[index] = toLatLng(event.target.getLatLng());
      drawLine();
      updateHint();
    });
    markers.push(marker);
    preview?.remove();
    preview = null;
    drawLine();
    updateHint();
  }

  function onClick(event) {
    addPoint(event.latlng);
  }

  function onMove(event) {
    if (points.length !== 1) return;
    const cursor = toLatLng(event.latlng);
    if (!preview) preview = L.polyline([points[0], cursor], { renderer, color: LINE_COLOR, weight: 2, opacity: 0.7, dashArray: "4 6", interactive: false }).addTo(map);
    else preview.setLatLngs([points[0], cursor]);
    updateHint(measurementText(points[0], cursor));
  }

  function onKey(event) {
    if (event.key === "Escape") stop();
  }

  function start() {
    measuring = true;
    map.closePopup();
    map.getContainer().classList.add("is-measuring");
    button.setAttribute("aria-pressed", "true");
    hint = L.DomUtil.create("div", "measure-hint", map.getContainer());
    hint.setAttribute("role", "status");
    setHtml(hint, html`<span data-measure-text></span><button type="button" data-measure-done>Done</button>`);
    L.DomEvent.disableClickPropagation(hint);
    hint.querySelector("[data-measure-done]").addEventListener("click", stop);
    updateHint();
    map.on("click", onClick);
    map.on("mousemove", onMove);
    document.addEventListener("keydown", onKey);
  }

  function stop() {
    if (!measuring) return;
    measuring = false;
    clearDrawing();
    hint?.remove();
    hint = null;
    map.getContainer().classList.remove("is-measuring");
    button.setAttribute("aria-pressed", "false");
    map.off("click", onClick);
    map.off("mousemove", onMove);
    document.removeEventListener("keydown", onKey);
  }

  document.addEventListener("glc-units-changed", () => {
    if (!measuring) return;
    drawLine();
    updateHint();
  });

  const Measure = L.Control.extend({
    options: { position },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar glc-tool glc-measure");
      button = L.DomUtil.create("button", "", container);
      button.type = "button";
      button.title = "Measure distance";
      button.setAttribute("aria-label", "Measure distance");
      button.setAttribute("aria-pressed", "false");
      setHtml(button, RULER_ICON);
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, "click", () => (measuring ? stop() : start()));
      return container;
    }
  });
  new Measure().addTo(map);
  return { start, stop };
}
