import { html, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { convertUnitValue, unitPreference } from "./app-units.js";
import { replaceFishingSpots, updateSettings } from "./actions.js";
import { els } from "./app-elements.js";
import { isUsableCoordinates } from "./app-media.js";
import { selectedTripLocationCoordinates } from "./locations.js";
import { runSettingsSave, settingsUi } from "./settings-core.js";
import { addSeamlessTileLayer, seamlessMapOptions } from "./maps.js";
import { trimNumber } from "./form-utils.js";


export function privatePhotoLocations() {
  const existing = state.settings?.privatePhotoLocations;
  return Array.isArray(existing) ? existing : [];
}

export function fishingSpots() {
  return Array.isArray(state.spots) ? state.spots : [];
}

export function ensureActiveFishingSpot(spots = fishingSpots()) {
  if (!spots.length) {
    ui.activeFishingSpotId = "";
    ui.editingFishingSpotId = "";
    ui.expandedFishingSpotIds = [];
    return "";
  }
  if (!spots.some((spot) => spot.id === ui.activeFishingSpotId)) ui.activeFishingSpotId = "";
  if (!spots.some((spot) => spot.id === ui.editingFishingSpotId)) ui.editingFishingSpotId = "";
  ui.expandedFishingSpotIds = (ui.expandedFishingSpotIds || []).filter((id) => spots.some((spot) => spot.id === id));
  return ui.activeFishingSpotId;
}

export function fishingSpotCatchCount(spotId) {
  return state.trips.reduce((total, trip) => total + (trip.catches || []).filter((catchItem) => catchItem.spotId === spotId).length, 0);
}

export function fishingSpotDefaultCoordinates() {
  const mapCenter = ui.fishingSpotMap?._loaded ? ui.fishingSpotMap.getCenter() : null;
  if (mapCenter && isUsableCoordinates({ latitude: mapCenter.lat, longitude: mapCenter.lng })) {
    return { latitude: mapCenter.lat, longitude: mapCenter.lng };
  }
  const first = fishingSpots()[0]?.coordinates;
  if (isUsableCoordinates(first)) return first;
  const selected = selectedTripLocationCoordinates();
  if (isUsableCoordinates(selected)) return selected;
  return { latitude: 43.0896, longitude: -79.0849 };
}

export function nextFishingSpotName() {
  const names = new Set(fishingSpots().map((spot) => spot.name.toLowerCase()));
  let number = 1;
  while (names.has(`spot ${number}`)) number += 1;
  return `Spot ${number}`;
}

export function collectFishingSpotSettings() {
  const current = new Map(fishingSpots().map((spot) => [spot.id, spot]));
  return (settingsUi.fishingSpotsDraft || fishingSpots().map((spot) => ({ ...spot, radiusDisplay: fishingSpotRadiusDisplayValue(spot.radiusMeters) }))).map((spot) => {
    const currentSpot = current.get(spot.id) || {};
    const currentFields = { ...currentSpot };
    delete currentFields.lake;
    const { radiusDisplay, lake, ...spotFields } = spot;
    const normalizedLake = String(lake || "").trim();
    return {
      ...currentFields,
      ...spotFields,
      ...(normalizedLake ? { lake: normalizedLake } : {}),
      name: String(spot.name || "").trim() || "Spot",
      radiusMeters: String(radiusDisplay ?? "") === String(fishingSpotRadiusDisplayValue(currentSpot.radiusMeters || spot.radiusMeters || 100))
        ? (currentSpot.radiusMeters || spot.radiusMeters)
        : fishingSpotRadiusMeters(radiusDisplay ?? fishingSpotRadiusDisplayValue(spot.radiusMeters || 100))
    };
  });
}

export function validateFishingSpots(spots) {
  if (!Array.isArray(spots)) throw new Error("Fishing spots must be a list.");
  const ids = new Set();
  const names = new Set();
  spots.forEach((spot) => {
    const id = String(spot?.id || "");
    const name = String(spot.name || "").trim();
    const nameKey = name.toLowerCase();
    if (spot.lake !== undefined && typeof spot.lake !== "string") throw new Error(`Fishing spot “${name}” lake must be text.`);
    const radiusMeters = Number(spot.radiusMeters);
    if (!id || ids.has(id)) throw new Error("Fishing spots need unique IDs.");
    if (!name) throw new Error("Every fishing spot needs a name.");
    if (names.has(nameKey)) throw new Error(`Fishing spot names must be unique. “${name}” is used more than once.`);
    if (!isUsableCoordinates(spot.coordinates)) throw new Error(`Fishing spot “${name}” needs valid coordinates.`);
    if (!Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 500) throw new Error(`Fishing spot “${name}” radius must be between 25 and 500 meters.`);
    ids.add(id);
    names.add(nameKey);
  });
}

export function validatePrivatePhotoLocations(locations) {
  if (!Array.isArray(locations)) throw new Error("Private photo locations must be a list.");
  const ids = new Set();
  locations.forEach((location) => {
    const id = String(location?.id || "");
    const name = String(location?.name || "").trim();
    const radiusMeters = Number(location?.radiusMeters);
    if (!id || ids.has(id)) throw new Error("Private photo locations need unique IDs.");
    if (!name) throw new Error("Every private photo location needs a name.");
    if (!isUsableCoordinates(location.coordinates)) throw new Error(`Private photo location “${name}” needs valid coordinates.`);
    if (!Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 10000) throw new Error(`Private photo location “${name}” radius must be between 25 and 10000 meters.`);
    ids.add(id);
  });
}

export async function saveFishingSpots(nextSpots, options = {}) {
  await runSettingsSave(
    async () => {
      validateFishingSpots(nextSpots);
      await replaceFishingSpots(nextSpots);
      ensureActiveFishingSpot(nextSpots);
      if (options.rerender !== false) renderFishingSpotSettings();
      else renderFishingSpotMap();
    },
    "The fishing spots could not be saved.",
    options
  );
}

export function renderFishingSpotSettings() {
  if (!els.fishingSpotList) return;
  const spots = fishingSpots();
  settingsUi.fishingSpotsDraft = spots.map((spot) => ({ ...structuredClone(spot), radiusDisplay: fishingSpotRadiusDisplayValue(spot.radiusMeters) }));
  const activeId = ensureActiveFishingSpot(spots);
  const orderedSpots = activeId
    ? [spots.find((spot) => spot.id === activeId), ...spots.filter((spot) => spot.id !== activeId)].filter(Boolean)
    : spots;
  const radiusConfig = fishingSpotRadiusSliderConfig();
  setHtml(els.fishingSpotList, orderedSpots.length ? joinHtml(orderedSpots.map((spot) => {
    const count = fishingSpotCatchCount(spot.id);
    const isEditing = spot.id === ui.editingFishingSpotId;
    const isExpanded = ui.expandedFishingSpotIds.includes(spot.id);
    const draftIndex = settingsUi.fishingSpotsDraft.findIndex((item) => item.id === spot.id);
    const editorId = `fishingSpotDetails-${spot.id}`;
    return html`
      <article class="private-location-card${spot.id === activeId ? " is-selected" : ""}" data-fishing-spot-id="${spot.id}" aria-current="${spot.id === activeId ? "true" : "false"}">
        <div class="private-location-card-head fishing-spot-card-head">
          <button class="fishing-spot-summary" type="button" data-toggle-fishing-spot="${spot.id}" aria-expanded="${isExpanded}" aria-controls="${editorId}">
            <span class="fishing-spot-summary-copy">
              <strong class="fishing-spot-summary-name">${spot.name}</strong>
              <span class="fishing-spot-summary-meta">${spot.lake || "Lake not set"} · ${count} ${count === 1 ? "catch" : "catches"} · ${fishingSpotRadiusText(spot.radiusMeters)}</span>
            </span>
            <span class="fishing-spot-disclosure-icon" aria-hidden="true"></span>
          </button>
          <button class="button secondary private-location-edit-pin" type="button" data-edit-fishing-spot-pin="${spot.id}" aria-label="Edit map pin for ${spot.name}">Edit pin</button>
          <button class="button danger${isEditing ? "" : " hidden"}" type="button" data-delete-fishing-spot="${spot.id}">Delete</button>
        </div>
        <div class="fishing-spot-editor${isExpanded ? "" : " hidden"}" id="${editorId}">
          <label class="settings-control">
            <span>Spot name</span>
            <input class="private-location-name fishing-spot-name" type="text" value="${spot.name}" data-settings-draft="fishingSpotsDraft" data-settings-bind="${draftIndex}.name" aria-label="Fishing spot name" />
          </label>
          <label class="settings-control fishing-spot-lake-control">
            <span>Lake</span>
            <input class="fishing-spot-lake" type="text" value="${spot.lake || ""}" data-settings-draft="fishingSpotsDraft" data-settings-bind="${draftIndex}.lake" aria-label="Lake for ${spot.name}" placeholder="Lake Ontario" />
          </label>
          <p class="fishing-spot-assignment-count">${count} assigned ${count === 1 ? "catch" : "catches"}</p>
          <label class="settings-control private-location-radius-control">
            <span>Radius <output class="private-location-radius-value fishing-spot-radius-value">${fishingSpotRadiusText(spot.radiusMeters)}</output></span>
            <input class="private-location-radius fishing-spot-radius" type="range" min="${radiusConfig.min}" max="${radiusConfig.max}" step="${radiusConfig.step}" value="${fishingSpotRadiusDisplayValue(spot.radiusMeters)}" data-settings-draft="fishingSpotsDraft" data-settings-bind="${draftIndex}.radiusDisplay" aria-label="Fishing spot radius in ${radiusConfig.unit}" style="${fishingSpotRadiusStyle(spot.radiusMeters)}" />
          </label>
        </div>
      </article>
    `;
  }), "") : html`<div class="empty-state compact-empty"><p>No fishing spots saved.</p><p>Add one, then place and size its circle on the map.</p></div>`);
  ensureFishingSpotMap();
  renderFishingSpotMap();
}

export function updateFishingSpotSummary(card) {
  if (!card) return;
  const spotId = card.dataset.fishingSpotId;
  const name = card.querySelector(".fishing-spot-name")?.value.trim() || "Spot";
  const lake = card.querySelector(".fishing-spot-lake")?.value.trim() || "Lake not set";
  const count = fishingSpotCatchCount(spotId);
  const radius = card.querySelector(".fishing-spot-radius-value")?.textContent.trim() || "";
  const nameSummary = card.querySelector(".fishing-spot-summary-name");
  const metaSummary = card.querySelector(".fishing-spot-summary-meta");
  if (nameSummary) nameSummary.textContent = name;
  if (metaSummary) metaSummary.textContent = `${lake} · ${count} ${count === 1 ? "catch" : "catches"} · ${radius}`;
}

export function ensureFishingSpotMap() {
  if (!window.L || !els.fishingSpotMap) return;
  const shouldInitializeView = !ui.fishingSpotMap;
  if (!ui.fishingSpotMap) {
    ui.fishingSpotMap = L.map(els.fishingSpotMap, seamlessMapOptions());
    addSeamlessTileLayer(ui.fishingSpotMap);
    ui.fishingSpotLayer = L.featureGroup().addTo(ui.fishingSpotMap);
    ui.fishingSpotMap.on("click", async (event) => {
      const activeId = ensureActiveFishingSpot();
      if (!activeId) return;
      const next = collectFishingSpotSettings().map((spot) => spot.id === activeId
        ? { ...spot, coordinates: { latitude: event.latlng.lat, longitude: event.latlng.lng } }
        : spot);
      await saveFishingSpots(next);
    });
  }
  if (shouldInitializeView || !ui.fishingSpotMap._loaded) {
    const center = fishingSpotDefaultCoordinates();
    ui.fishingSpotMap.setView([center.latitude, center.longitude], fishingSpots().length ? 11 : 7);
  }
  setTimeout(() => ui.fishingSpotMap.invalidateSize(), 50);
}

export function renderFishingSpotMap() {
  if (!window.L || !ui.fishingSpotMap || !ui.fishingSpotLayer) return;
  ui.fishingSpotLayer.clearLayers();
  const spots = fishingSpots();
  spots.forEach((spot) => {
    const active = spot.id === ui.activeFishingSpotId;
    const point = [spot.coordinates.latitude, spot.coordinates.longitude];
    L.circle(point, {
      radius: spot.radiusMeters,
      // Let clicks pass through the visualization to the map placement handler.
      // The marker remains interactive for selecting/dragging the spot center.
      interactive: false,
      color: active ? "#118753" : "#65718a",
      weight: active ? 3 : 2,
      fillColor: "#2fb875",
      fillOpacity: active ? 0.18 : 0.08
    }).addTo(ui.fishingSpotLayer);
    const marker = L.marker(point, { draggable: true }).addTo(ui.fishingSpotLayer);
    marker.on("click", () => {
      ui.activeFishingSpotId = spot.id;
      if (ui.editingFishingSpotId !== ui.activeFishingSpotId) ui.editingFishingSpotId = "";
      renderFishingSpotSettings();
    });
    marker.on("dragend", async () => {
      ui.activeFishingSpotId = spot.id;
      const latLng = marker.getLatLng();
      const next = collectFishingSpotSettings().map((item) => item.id === spot.id
        ? { ...item, coordinates: { latitude: latLng.lat, longitude: latLng.lng } }
        : item);
      await saveFishingSpots(next);
    });
  });
  const active = spots.find((spot) => spot.id === ui.activeFishingSpotId);
  if (active) ui.fishingSpotMap.setView([active.coordinates.latitude, active.coordinates.longitude], ui.fishingSpotMap.getZoom());
}

export function privateLocationRadiusUnit() {
  return unitPreference("distance") === "mi" ? "ft" : "m";
}

export function privateLocationRadiusDisplayValue(radiusMeters) {
  const radius = Math.max(25, Math.min(10000, Number(radiusMeters) || 400));
  const unit = privateLocationRadiusUnit();
  const value = unit === "ft" ? convertUnitValue(radius, "m", "ft") : radius;
  return Math.round(value);
}

export function fishingSpotRadiusSliderConfig() {
  const unit = unitPreference("distance") === "mi" ? "ft" : "m";
  if (unit === "ft") {
    return { min: Math.round(convertUnitValue(25, "m", "ft")), max: Math.round(convertUnitValue(500, "m", "ft")), step: Math.round(convertUnitValue(5, "m", "ft")), unit };
  }
  return { min: 25, max: 500, step: 5, unit };
}

export function fishingSpotRadiusDisplayValue(radiusMeters) {
  const radius = Math.max(25, Math.min(500, Number(radiusMeters) || 100));
  return unitPreference("distance") === "mi" ? convertUnitValue(radius, "m", "ft") : radius;
}

export function fishingSpotRadiusMeters(displayValue) {
  const config = fishingSpotRadiusSliderConfig();
  const value = Math.max(config.min, Math.min(config.max, Number(displayValue) || fishingSpotRadiusDisplayValue(100)));
  return unitPreference("distance") === "mi" ? convertUnitValue(value, "ft", "m") : value;
}

export function fishingSpotRadiusProgress(displayValue) {
  const { min, max } = fishingSpotRadiusSliderConfig();
  const radius = Math.max(min, Math.min(max, Number(displayValue) || fishingSpotRadiusDisplayValue(100)));
  return Math.round(((radius - min) / (max - min)) * 10000) / 100;
}

export function fishingSpotRadiusStyle(radiusMeters) {
  return `--private-location-radius-progress: ${fishingSpotRadiusProgress(fishingSpotRadiusDisplayValue(radiusMeters))}%;`;
}

export function fishingSpotRadiusText(radiusMeters) {
  const unit = fishingSpotRadiusSliderConfig().unit;
  return `${trimNumber(fishingSpotRadiusDisplayValue(radiusMeters))} ${unit}`;
}

export function privateLocationRadiusMeters(displayValue) {
  const unit = privateLocationRadiusUnit();
  const value = Number(displayValue) || privateLocationRadiusDisplayValue(400);
  const meters = unit === "ft" ? convertUnitValue(value, "ft", "m") : value;
  return Math.max(25, Math.min(10000, meters || 400));
}

export function privateLocationRadiusSliderConfig() {
  const unit = privateLocationRadiusUnit();
  if (unit === "ft") {
    return {
      min: Math.round(convertUnitValue(25, "m", "ft")),
      max: Math.round(convertUnitValue(10000, "m", "ft")),
      step: 1,
      unit
    };
  }
  return { min: 25, max: 10000, step: 25, unit };
}

export function privateLocationRadiusText(radiusMeters) {
  const unit = privateLocationRadiusUnit();
  return `${trimNumber(privateLocationRadiusDisplayValue(radiusMeters))} ${unit}`;
}

export function updateFishingSpotRadiusControl(input) {
  input.style.setProperty("--private-location-radius-progress", `${fishingSpotRadiusProgress(input.value)}%`);
}

export function privateLocationDefaultCoordinates() {
  const first = privatePhotoLocations()[0]?.coordinates;
  if (isUsableCoordinates(first)) return first;
  const selected = selectedTripLocationCoordinates();
  if (isUsableCoordinates(selected)) return selected;
  return { latitude: 43.7, longitude: -79.4 };
}

export async function savePrivatePhotoLocations(locations) {
  validatePrivatePhotoLocations(locations);
  await updateSettings((settings) => {
    settings.privatePhotoLocations = locations;
  });
}
