import { html, joinHtml, setHtml } from "./html.js";
import { convertUnitValue, explicitMeasurementUnit, formatUnitValue, unitPreference } from "./app-units.js";
import { currentDirectionLabel, currentSpeedLabel } from "./great-lakes-conditions.js";
import { coordinateText } from "./locations.js";
import { tripConditionsTime } from "./trip-condition-time.js";

function catchFishingDepthMeters(catchItem = {}) {
  const values = [catchItem.estimatedLureDepth, catchItem.depthDown, catchItem.estimatedDepth, catchItem.ballDepth];
  for (const raw of values) {
    const match = String(raw ?? "").trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z]+))?$/);
    if (!match) continue;
    const unit = explicitMeasurementUnit(match[2]) || unitPreference("depth");
    const meters = convertUnitValue(match[1], unit, "m");
    if (Number.isFinite(meters) && meters >= 0) return meters;
  }
  return null;
}

function conditionsHtml(conditions = {}, record) {
  const temperature = conditions.temperatureProfile || {};
  const current = conditions.currentProfile || {};
  const thermocline = temperature.thermocline;
  const thermoclineValue = thermocline?.topDepthMeters !== undefined
    ? formatUnitValue(thermocline.topDepthMeters, "depth", "m", { decimals: 1 })
    : temperature.noThermocline ? "No distinct thermocline" : temperature.available ? "Not identified" : "Unavailable";
  const targetDepth = catchFishingDepthMeters(record.catchItem);
  const targetDepthForLookup = targetDepth ?? 0;
  const readings = (current.values || []).filter((value) =>
    Number.isFinite(Number(value.depthMeters))
    && Number.isFinite(Number(value.speedMetersPerSecond))
    && Number.isFinite(Number(value.directionDegrees)));
  const nearest = readings.reduce((best, value) =>
    !best || Math.abs(value.depthMeters - targetDepthForLookup) < Math.abs(best.depthMeters - targetDepthForLookup) ? value : best, null);
  const depthLabel = nearest
    ? current.surfaceOnly ? "Surface only" : formatUnitValue(nearest.depthMeters, "depth", "m", { decimals: 1 })
    : "Unavailable";
  const currentLabel = nearest
    ? `${currentSpeedLabel(nearest.speedMetersPerSecond)} · ${nearest.speedMetersPerSecond < 0.001 ? "Still" : `Toward ${currentDirectionLabel(nearest.directionDegrees)} ${Math.round(nearest.directionDegrees)}°`}`
    : "Unavailable";
  const location = current.modelLocation || temperature.modelLocation;
  const distance = Number.isFinite(Number(current.sampleDistanceKm)) ? `Model cell ${Number(current.sampleDistanceKm).toFixed(1)} km away` : "";
  const sampleTime = current.historyTime || temperature.historyTime || conditions.time || "";
  const sampleLabel = sampleTime && Number.isFinite(Date.parse(sampleTime)) ? new Date(sampleTime).toLocaleString() : "saved sample";
  const locationLabel = location ? coordinateText(location) : "";
  const currentNote = current.surfaceOnly ? "Only surface current is saved for samples older than 30 days." : "";
  const rows = [
    html`<div class="map-popup-detail"><span class="map-popup-label">Thermocline</span><span class="map-popup-value">${thermoclineValue}</span></div>`,
    html`<div class="map-popup-detail"><span class="map-popup-label">${targetDepth === null ? "Current at nearest saved depth" : "Current near catch depth"}</span><span class="map-popup-value">${currentLabel}${nearest ? ` at ${depthLabel}` : ""}</span></div>`
  ];
  return html`
    <span class="map-catch-conditions-heading">Saved NOAA conditions · ${sampleLabel}</span>
    <div class="map-popup-details" aria-label="Historical thermocline and underwater current">${joinHtml(rows)}</div>
    ${locationLabel ? html`<small>Model location: ${locationLabel}${distance ? ` · ${distance}` : ""}</small>` : ""}
    ${currentNote ? html`<small>${currentNote}</small>` : ""}
    ${!conditions.available ? html`<small>No historical sample was found near this catch's recorded time.</small>` : ""}
  `;
}

export function bindCatchFishingConditions(marker, record) {
  if (record.type !== "catch") return marker;
  marker.on("popupopen", () => {
    const host = marker.getPopup()?.getElement()?.querySelector("[data-catch-fishing-conditions]");
    if (!host || host.dataset.loading === "true" || host.dataset.loaded === "true") return;
    host.dataset.loading = "true";
    host.setAttribute("aria-busy", "true");
    setHtml(host, html`<span class="map-catch-conditions-heading">NOAA conditions</span><small>Loading the historical sample for this catch…</small>`);
    const time = tripConditionsTime(record.trip, record.catchItem);
    const request = window.noaaGreatLakesApi?.fishingConditions({
      time, latitude: record.coordinates.latitude, longitude: record.coordinates.longitude
    });
    Promise.resolve(request).then((conditions) => {
      if (!host.isConnected) return;
      setHtml(host, conditionsHtml(conditions || {}, record));
      host.dataset.loaded = "true";
    }).catch(() => {
      if (host.isConnected) setHtml(host, html`<span class="map-catch-conditions-heading">NOAA conditions</span><small>Saved conditions are unavailable. Try opening this catch again while connected.</small>`);
    }).finally(() => {
      if (!host.isConnected) return;
      delete host.dataset.loading;
      host.removeAttribute("aria-busy");
    });
  });
  return marker;
}
