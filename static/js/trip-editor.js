import { html, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { createId, defaultTimeValue } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { findLaunchByIdOrName, findLocationByIdOrName, generatedTripTitle, optionLabels } from "./app-normalization.js";
import { convertUnitValue, explicitMeasurementUnit, unitPreference, unitSymbol } from "./app-units.js";
import { deleteTrip } from "./actions.js";
import { els } from "./app-elements.js";
import { beginMediaEditSession, cleanupDeletedMedia, isUsableCoordinates, mediaReferenceKeys } from "./app-media.js";
import { LOCATION_FOCUS_ZOOM, coordinateText, populateLaunchSelect, populateLocationSelect, selectedTripLocationCoordinates, tripLocationCoordinates } from "./locations.js";
import { renderWeatherSummary, scheduleTripWeatherPreview, setWeatherStatus, updateMarineWaveHeightPlaceholder, weatherCardConditionsLabel } from "./location-weather.js";
import { syncUnitLabels } from "./settings.js";
import { populateDatalist, populateOptionSelect, renderAll } from "./dashboard.js";
import { ExpeditionAnalytics } from "./expedition-analytics.js";
import { displayDateForCalendar, expeditionDateRange, populateTripExpeditionSelect, syncCalendarDate } from "./expeditions.js";
import { renderNotePhotos } from "./photos.js";
import { addCatchRow, addLostFishRow, addTripGearRow, populateSetupLineSelects, refreshAllCatchFishingConditions, setupLineLabel } from "./trip-rows.js";
import { renderLiveTrollingSpread } from "./trolling-spread.js";
import { tripConditionsTime } from "./trip-condition-time.js";
import { addSeamlessTileLayer, seamlessMapOptions } from "./maps.js";
import { calculateMinutes } from "./stats.js";
import { isTrollingTrip, trimNumber } from "./form-utils.js";
import { updateMethodVisibility } from "./app.js";
import { createTripDraft } from "./trip-draft.js";
import { applyTripDraftBindings } from "./draft-binding.js";
import { isGreatLakesFishingTrip, loadSavedFishingConditions, thermoclineDisplayValue } from "./trip-fishing-conditions.js";

const tripThermoclineRequestIds = new WeakMap();

export function clearTripFormMessage() {
  els.tripFormMessage.classList.add("hidden");
  els.tripFormMessage.textContent = "";
  els.tripForm.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
}

export function showTripFormMessage(message, fields = []) {
  els.tripFormMessage.textContent = message;
  els.tripFormMessage.classList.remove("hidden");
  fields.forEach((field) => field.setAttribute("aria-invalid", "true"));
  fields[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
  fields[0]?.focus({ preventScroll: true });
}

export function showTripValidationDialog({ intro, items }) {
  clearTripFormMessage();
  items.forEach((item) => item.field?.setAttribute("aria-invalid", "true"));
  if (!els.tripValidationDialog || !els.tripValidationList) return;

  els.tripValidationDialogIntro.textContent = intro;
  setHtml(els.tripValidationList, joinHtml(items.map((item) => html`
    <button class="trip-validation-field" type="button" data-validation-field="${item.field.id}">
      <span class="trip-validation-field-copy">
        <strong>${item.label}</strong>
        <small>${item.detail || "Required"}</small>
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
    </button>
  `), ""));
  els.tripValidationDialog.showModal();
}

export function focusTripValidationField(fieldId) {
  const field = document.getElementById(fieldId);
  els.tripValidationDialog?.close();
  if (!field) return;
  requestAnimationFrame(() => {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus({ preventScroll: true });
  });
}

export function setTripSaveLoading(saving, action = "") {
  const loadingSelector = action === "draft"
    ? "[data-trip-draft-save]"
    : action === "save"
      ? "[data-trip-save]"
      : "";
  document.querySelectorAll("[data-trip-save], [data-trip-draft-save]").forEach((button) => {
    button.disabled = saving;
    button.classList.toggle("is-loading", Boolean(saving && loadingSelector && button.matches(loadingSelector)));
    button.setAttribute("aria-busy", String(saving));
  });
}

export function tripFormSnapshot() {
  if (!els.tripForm) return "";
  return JSON.stringify(ui.tripDraft || {});
}

export function resetTripFormSnapshot() {
  ui.tripFormInitialSnapshot = tripFormSnapshot();
  ui.tripFormUserChanged = false;
  syncTripFormChrome();
}

export function isTripFormDirty() {
  return els.tripDialog?.open && tripFormSnapshot() !== ui.tripFormInitialSnapshot;
}

export function tripDateLabel(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function updateTripDialogHeader() {
  const title = ui.tripDraft?.title || (ui.activeTripId ? "Untitled Trip" : "New Trip");
  const date = tripDateLabel(ui.tripDraft?.date || "");
  const locationRecord = ui.tripDraft?.locationId || ui.tripDraft?.location
    ? findLocationByIdOrName(ui.tripDraft?.locationId, ui.tripDraft?.location)
    : null;
  const location = locationRecord?.name || ui.tripDraft?.location || "";
  els.tripDialogTitle.textContent = title;
  if (els.tripDialogMeta) {
    els.tripDialogMeta.textContent = [date, location].filter(Boolean).join(" \u2022 ") || "Trip details";
  }
}

export function syncTripFormChrome() {
  els.tripSaveBar?.classList.toggle("is-dirty", ui.tripFormUserChanged && isTripFormDirty());
  updateTripDialogHeader();
}

export function refreshTripEnvironmentalConditions() {
  const field = document.querySelector(".trip-thermocline-field");
  const input = document.querySelector("#tripThermoclineDepth");
  const trip = ui.tripDraft || {};
  const eligible = isGreatLakesFishingTrip(trip, state.locations);
  els.tripDialog?.classList.toggle("is-great-lakes-fishing", eligible);
  field?.classList.toggle("hidden", !eligible);
  document.querySelectorAll("#tripDialog .great-lakes-current-field").forEach((element) => {
    element.classList.toggle("hidden", !eligible);
  });

  const requestId = input ? (tripThermoclineRequestIds.get(input) || 0) + 1 : 0;
  if (input) tripThermoclineRequestIds.set(input, requestId);
  if (!eligible) {
    if (input) {
      input.value = "";
      input.title = "";
    }
    refreshAllCatchFishingConditions(trip);
    return;
  }

  const coordinates = tripLocationCoordinates(trip);
  if (!coordinates) {
    if (input) {
      input.value = "No map pin";
      input.title = "Add a map pin to the selected launch or waterbody to load thermocline depth.";
    }
    refreshAllCatchFishingConditions(trip);
    return;
  }

  if (input) input.value = "Loading…";
  loadSavedFishingConditions(trip, coordinates).then((conditions) => {
    if (!input?.isConnected || tripThermoclineRequestIds.get(input) !== requestId) return;
    input.value = thermoclineDisplayValue(conditions || {});
    input.title = conditions?.temperatureProfile?.historyTime || conditions?.time || "Saved NOAA historical conditions";
  }).catch(() => {
    if (!input?.isConnected || tripThermoclineRequestIds.get(input) !== requestId) return;
    input.value = "Unavailable";
    input.title = "Saved thermocline data is unavailable for this trip time and location.";
  });
  refreshAllCatchFishingConditions(trip);
}

export function markTripFormChanged() {
  ui.tripFormUserChanged = true;
  syncTripFormChrome();
}

export function closeTripDialog({ force = false } = {}) {
  if (!els.tripDialog.open) return true;
  if (!force && isTripFormDirty() && !confirm("Discard unsaved trip changes?")) return false;
  ui.tripFormInitialSnapshot = "";
  ui.tripFormUserChanged = false;
  ui.tripDraft = null;
  els.tripDialog.close();
  els.tripSaveBar?.classList.remove("is-dirty");
  els.tripSaveBar?.classList.remove("is-existing-trip");
  return true;
}

export function validateTripForm() {
  clearTripFormMessage();
  const tripDateDisplay = document.querySelector("#tripDate");
  if (tripDateDisplay && typeof syncCalendarDate === "function") syncCalendarDate("tripDateValue");
  const requiredFields = [
    { field: tripDateDisplay, label: "Date" },
    { field: document.querySelector("#tripLocation"), label: "Location / waterbody" },
    { field: document.querySelector("#targetSpecies"), label: "Target species" }
  ];
  const missing = requiredFields.filter(({ field }) => !field.value.trim());
  const tripDateValue = document.querySelector("#tripDateValue")?.value || "";
  if (tripDateDisplay?.value.trim() && !tripDateValue) {
    showTripValidationDialog({
      intro: "The date format needs a quick correction before this trip can be saved.",
      items: [{ field: tripDateDisplay, label: "Date", detail: "Use mm/dd/yyyy" }]
    });
    return false;
  }
  if (!missing.length) return true;

  showTripValidationDialog({
    intro: "A few essentials are still missing. Choose a field below to jump right to it.",
    items: missing.map(({ field, label }) => ({ field, label, detail: "Required to save" }))
  });
  return false;
}

export function tripSaveWarnings() {
  const warnings = [];
  const importantFields = [
    { value: ui.tripDraft?.launchTime, label: "Start time" },
    { value: ui.tripDraft?.linesPulledTime, label: "End time" },
    { value: ui.tripDraft?.method, label: "Fishing method" }
  ];
  importantFields
    .filter(({ value }) => !String(value || "").trim())
    .forEach(({ label }) => warnings.push(`${label} is blank.`));

  const expedition = state.expeditions.find((item) => item.id === ui.tripDraft?.expeditionId);
  if (expedition && ExpeditionAnalytics.tripOutsideRange({ date: ui.tripDraft?.date }, expedition)) {
    warnings.push(`Trip date is outside ${expedition.name} (${expeditionDateRange(expedition)}).`);
  }

  const trolling = isTrollingTrip();
  const tripStartTime = ui.tripDraft?.launchTime || "";
  const tripEndTime = ui.tripDraft?.linesPulledTime || "";
  const tripMinutes = tripStartTime && tripEndTime
    ? calculateMinutes(tripStartTime, tripEndTime)
    : 0;
  const setupRows = ui.tripDraft?.gearUsed || [];
  if (trolling && !setupRows.length) warnings.push("No rods have been added to the setup timeline.");

  setupRows.forEach((record, index) => {
    const label = setupLineLabel(record, index);
    const startTime = record.startTime || "";
    const endTime = record.endTime || "";
    if (!startTime || !endTime) {
      warnings.push(`${label} is missing a deployment start or stop time.`);
      return;
    }
    const deployedHours = calculateMinutes(startTime, endTime) / 60;
    if (tripMinutes > 0 && deployedHours * 60 > tripMinutes) {
      warnings.push(`${label} is deployed longer than the trip (${trimNumber(deployedHours)} hours).`);
    }
  });

  [
    ...(ui.tripDraft?.catches || []).map((record, index) => ({ record, label: `Catch ${index + 1}`, lost: false })),
    ...(ui.tripDraft?.lostFish || []).map((record, index) => ({ record, label: `Lost Fish ${index + 1}`, lost: true }))
  ].forEach(({ record, label, lost }) => {
    const detailsUnknown = record.detailsUnknown && !lost;
    const unknownTime = Boolean(record.timeUnknown);
    if (!detailsUnknown && !record.personId) warnings.push(`${label} has no person selected.`);
    if (!String(lost ? record.possibleSpecies : record.species || "").trim()) warnings.push(`${label} has no species selected.`);
    if (!detailsUnknown && !unknownTime && !String(record.time || "").trim()) warnings.push(`${label} has no time.`);
    if (!detailsUnknown && trolling && !(record.setupLineValue || record.setupLineId)) warnings.push(`${label} has no rod selected.`);
  });
  return warnings;
}

export function confirmTripSaveWarnings() {
  const warnings = tripSaveWarnings();
  if (!warnings.length) return true;
  return confirm(`Please review before saving:\n\n${warnings.map((warning) => `• ${warning}`).join("\n")}\n\nSave anyway?`);
}

export function tripDeleteTitle(trip) {
  return String(trip?.title || generatedTripTitle(trip || {}, state.trips) || trip?.location || "Untitled trip").trim();
}

export function confirmTripDeletion(trip) {
  const title = tripDeleteTitle(trip);
  if (!confirm(`Delete "${title}"?\n\nThis permanently removes the trip, catches, notes, and saved trip media references.`)) return false;
  if (!confirm(`Second check: are you absolutely sure you want to delete "${title}"?`)) return false;
  const typed = prompt(`Final check: type the trip title exactly to delete it.\n\n${title}`);
  if (typed !== title) {
    alert("Trip title did not match. The trip was not deleted.");
    return false;
  }
  return true;
}

export async function deleteTripById(tripId, options = {}) {
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip || !confirmTripDeletion(trip)) return false;
  const deletedTripMedia = [...mediaReferenceKeys(trip)];
  await deleteTrip(tripId);
  await cleanupDeletedMedia(deletedTripMedia);
  if (options.closeEditor) closeTripDialog({ force: true });
  if (options.closeSummary) {
    ui.activeSummaryTripId = null;
    els.tripSummaryDialog.close();
  }
  renderAll();
  return true;
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ensureProbeTemperatureProfileDisclosure() {
  const section = document.querySelector(".trip-probe-temperature-section");
  // Fresh templates use the native details/summary disclosure. This fallback
  // keeps the control functional when a running server still has the older
  // section markup cached.
  if (!section) return;
  if (section.tagName === "DETAILS") {
    section.open = false;
    return;
  }
  const heading = section.querySelector(".probe-temperature-heading");
  const layout = section.querySelector(".probe-temperature-layout");
  if (!heading || !layout) return;
  if (section.dataset.disclosureReady) {
    section.classList.add("is-collapsed");
    heading.setAttribute("aria-expanded", "false");
    return;
  }
  section.dataset.disclosureReady = "true";
  const title = heading.querySelector("#probeTemperatureHeading");
  if (title) title.textContent = "Water temperature profile";
  [...heading.querySelectorAll("p")]
    .filter((paragraph) => paragraph.textContent.trim() === "Enter water temperature at each depth")
    .forEach((paragraph) => paragraph.remove());
  layout.id ||= "probeTemperatureProfileContent";
  heading.setAttribute("role", "button");
  heading.setAttribute("tabindex", "0");
  heading.setAttribute("aria-controls", layout.id);
  heading.setAttribute("aria-expanded", "false");
  section.classList.add("is-collapsed");
  const toggle = () => {
    const collapsed = section.classList.toggle("is-collapsed");
    heading.setAttribute("aria-expanded", String(!collapsed));
  };
  heading.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, a, label")) return;
    toggle();
  });
  heading.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
}

export function openTripDialog(trip = null) {
  beginMediaEditSession("trip");
  ui.activeTripId = trip?.id || null;
  ui.tripDraft = createTripDraft(trip);
  ui.tripDraftHydrating = Boolean(trip);
  const tripDraft = ui.tripDraft;
  ui.newTripStartupSpreadApplied = false;
  ui.newTripSavedSetupAppliedMethods = new Set();
  els.deleteTripButton.classList.toggle("hidden", !trip);
  els.tripSaveBar?.classList.toggle("is-existing-trip", Boolean(trip));
  els.tripForm.reset();
  setTripSaveLoading(false);
  clearTripFormMessage();
  setHtml(els.catchRows, html``);
  setHtml(els.lostFishRows, html``);
  setHtml(els.tripGearRows, html``);
  setHtml(els.personRows, html``);
  ui.activeNotePhotos = structuredClone(tripDraft.notePhotos || []);

  const today = localDateInputValue();
  setValue("tripId", tripDraft.id || "");
  setValue("tripTitle", tripDraft.title || "");
  setValue("tripDateValue", tripDraft.date || today);
  setValue("tripDate", displayDateForCalendar(tripDraft.date || today));
  populateTripExpeditionSelect(tripDraft.expeditionId || "");
  const location = findLocationByIdOrName(tripDraft.locationId, tripDraft.location);
  populateLocationSelect(location?.id || "");
  const launch = findLaunchByIdOrName(location, tripDraft.launchId, tripDraft.launch);
  populateLaunchSelect(launch?.id || "");
  setValue("launchTime", trip ? (tripDraft.launchTime || "") : defaultTimeValue);
  setValue("linesPulledTime", trip ? (tripDraft.linesPulledTime || "") : defaultTimeValue);
  setValue("tripIdleTime", tripDraft.idleHours || "");
  setValue("targetSpecies", tripDraft.targetSpecies || "");
  setValue("method", tripDraft.method || "");
  setTripIntent(tripIntent(tripDraft || {}));
  setTripRating(tripRatingValue(tripDraft || {}));
  setValue("waterTemp", tripDraft.waterTemp || "");
  setValue("waterClarity", tripDraft.waterClarity || "");
  populateOptionSelect(document.querySelector("#waterLevel"), optionLabels("waterLevels"), "Select level");
  setValue("flyHatch", tripDraft.flyHatch || "");
  setValue("waterLevel", tripDraft.waterLevel || "");
  setValue("weather", tripDraft.weather || "");
  setValue("waveHeight", tripDraft.waveHeight || "");
  updateMarineWaveHeightPlaceholder(tripDraft.weatherData || ui.activeTripWeatherData);
  setValue("structure", tripDraft.structure || "");
  ui.probeProfileImportCoordinates = null;
  ui.pendingProbeProfileImportCoordinates = null;
  syncProbeProfileImportSourceNote();
  setProbeProfileImportStatus("");
  ensureProbeTemperatureProfileDisclosure();
  const savedProbeProfile = Array.isArray(tripDraft.probeTemperatureProfile) ? tripDraft.probeTemperatureProfile : [];
  // Once a trip has saved readings, show only its populated depths when it is
  // reopened. Empty starter rows are reserved for a brand-new profile.
  if (savedProbeProfile.length) {
    probeProfileDepthsFeet = savedProbeProfile
      .map((entry) => Number(entry?.depthFeet))
      .filter((depthFeet) => Number.isFinite(depthFeet));
  } else {
    probeProfileDepthsFeet = Array.from({ length: 12 }, (_, index) => index * 10);
  }
  renderProbeTemperatureProfile(savedProbeProfile, { exactDepths: savedProbeProfile.length > 0 });
  setValue("tripNotes", tripDraft.notes || "");
  ui.activeTripWeatherData = tripDraft.weatherData || null;
  ui.activeTripWeatherKey = "";
  setWeatherStatus(ui.activeTripWeatherData?.daily ? weatherCardConditionsLabel() : "Choose a mapped location and date");
  renderWeatherSummary(ui.activeTripWeatherData);
  renderNotePhotos();

  const tripPeople = tripDraft.people || [];
  if (tripPeople.length) {
    tripPeople.forEach(addPersonRow);
  } else {
    const defaultPeople = new Set(state.settings?.defaultPeople || []);
    const savedPeople = (state.people || []).filter((person) => person.name?.trim() && defaultPeople.has(person.id));
    if (savedPeople.length) savedPeople.forEach(addPersonRow);
    else addPersonRow({}, { editNew: true });
  }
  (tripDraft.gearUsed || []).forEach(addTripGearRow);
  (tripDraft.catches || []).forEach(addCatchRow);
  (tripDraft.lostFish || []).forEach(addLostFishRow);
  populateSetupLineSelects();
  applyTripDraftBindings(els.tripDialog);
  updateMethodVisibility({ applyStartupSpread: !trip });
  renderLiveTrollingSpread();
  renderProbeTemperatureProfileChart(collectProbeTemperatureProfile());
  syncUnitLabels(els.tripForm);
  els.tripDialog.showModal();
  refreshTripEnvironmentalConditions();
  els.tripForm.scrollTop = 0;
  requestAnimationFrame(() => {
    applyTripDraftBindings(els.tripDialog);
    els.tripForm.scrollTop = 0;
    els.personRows.querySelector("[data-focus-person-name='true'] .person-name")?.focus({ preventScroll: true });
    ui.tripDraftHydrating = false;
    resetTripFormSnapshot();
    updateTripDialogHeader();
  });
  if (!trip) {
    ui.tripDraftHydrating = false;
    scheduleTripWeatherPreview(true);
  }
}

export function setValue(id, value) {
  const input = document.querySelector(`#${id}`);
  if (input) input.value = value;
}

export function getValue(id) {
  const valueId = id === "tripDate" && document.querySelector("#tripDateValue") ? "tripDateValue" : id;
  return document.querySelector(`#${valueId}`).value.trim();
}

export let probeProfileDepthsFeet = Array.from({ length: 12 }, (_, index) => index * 10);

export function probeTemperatureProfileEntries(profile = []) {
  return Array.isArray(profile) ? profile.filter((entry) => Number.isFinite(Number(entry?.depthFeet))) : [];
}

export function roundedProbeDisplayNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return trimNumber(Math.round(number));
}

export function displayProbeDepthValue(depthFeet) {
  const depth = convertUnitValue(depthFeet, "ft", unitPreference("depth"));
  return roundedProbeDisplayNumber(depth ?? depthFeet);
}

export function displayProbeDepth(depthFeet) {
  return `${displayProbeDepthValue(depthFeet)} ${unitSymbol("depth")}`;
}

export function displayProbeTemperatureNumber(value) {
  return roundedProbeDisplayNumber(value);
}

export function displayProbeTemperatureInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return text;
  const rounded = displayProbeTemperatureNumber(match[1]);
  return `${rounded}${match[2] ? ` ${match[2]}` : ""}`;
}

export function displayProbeTemperatureMeasurement(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return text;
  const rounded = displayProbeTemperatureNumber(match[1]);
  return `${rounded} ${match[2] || unitSymbol("waterTemperature")}`;
}

export function noaaProbeTemperatureProfileEntries(profile = {}) {
  const temperaturesByDepth = new Map();
  const temperatureUnit = unitPreference("waterTemperature");
  (Array.isArray(profile?.values) ? profile.values : []).forEach((value) => {
    const depthFeet = convertUnitValue(value?.depthMeters, "m", "ft");
    const temperature = convertUnitValue(value?.temperatureC, "C", temperatureUnit);
    if (!Number.isFinite(depthFeet) || !Number.isFinite(temperature)) return;
    // Keep the model's vertical layers distinct in the app's canonical feet
    // storage without exposing floating-point conversion noise in the editor.
    const normalizedDepth = Math.round(depthFeet * 1000) / 1000;
    const normalizedTemperature = Math.round(temperature * 1000) / 1000;
    temperaturesByDepth.set(normalizedDepth, {
      depthFeet: normalizedDepth,
      temperature: String(normalizedTemperature)
    });
  });
  return [...temperaturesByDepth.values()].sort((first, second) => first.depthFeet - second.depthFeet);
}

export function setProbeProfileImportStatus(message = "", isError = false) {
  const status = document.querySelector("#probeProfileImportStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", Boolean(message) && isError);
}

export function probeProfileImportSource() {
  if (isUsableCoordinates(ui.probeProfileImportCoordinates)) {
    return { coordinates: ui.probeProfileImportCoordinates, type: "map-point" };
  }
  const coordinates = selectedTripLocationCoordinates();
  return isUsableCoordinates(coordinates) ? { coordinates, type: "launch" } : null;
}

export function syncProbeProfileImportSourceNote() {
  const note = document.querySelector("#probeProfileSourceNote");
  const resetButton = document.querySelector("[data-clear-probe-profile-location]");
  const hasMapPoint = isUsableCoordinates(ui.probeProfileImportCoordinates);
  if (note) {
    note.textContent = hasMapPoint
      ? `NOAA will use your selected map point (${coordinateText(ui.probeProfileImportCoordinates)}) instead of the launch pin.`
      : "NOAA uses the selected launch / area fished pin by default. If it has no pin, it uses the waterbody pin.";
  }
  resetButton?.classList.toggle("hidden", !hasMapPoint);
}

export function setPendingProbeProfileImportCoordinates(coordinates) {
  ui.pendingProbeProfileImportCoordinates = isUsableCoordinates(coordinates) ? coordinates : null;
  if (els.probeProfileLocationCoordinates) {
    els.probeProfileLocationCoordinates.textContent = ui.pendingProbeProfileImportCoordinates
      ? `Selected point: ${coordinateText(ui.pendingProbeProfileImportCoordinates)}`
      : "Choose a point on the map.";
  }
  if (els.saveProbeProfileLocationButton) {
    els.saveProbeProfileLocationButton.disabled = !ui.pendingProbeProfileImportCoordinates;
  }
  if (!window.L || !ui.probeProfileLocationMap || !ui.pendingProbeProfileImportCoordinates) return;
  const point = [ui.pendingProbeProfileImportCoordinates.latitude, ui.pendingProbeProfileImportCoordinates.longitude];
  if (!ui.probeProfileLocationMarker) {
    ui.probeProfileLocationMarker = L.marker(point, { draggable: true }).addTo(ui.probeProfileLocationMap);
    ui.probeProfileLocationMarker.on("dragend", () => {
      const latLng = ui.probeProfileLocationMarker.getLatLng();
      setPendingProbeProfileImportCoordinates({ latitude: latLng.lat, longitude: latLng.lng });
    });
  } else {
    ui.probeProfileLocationMarker.setLatLng(point);
  }
  ui.probeProfileLocationMap.setView(point, Math.max(ui.probeProfileLocationMap.getZoom(), LOCATION_FOCUS_ZOOM));
}

export function ensureProbeProfileLocationMap(coordinates) {
  if (!window.L || !els.probeProfileLocationMap) return;
  if (!ui.probeProfileLocationMap) {
    ui.probeProfileLocationMap = L.map(els.probeProfileLocationMap, seamlessMapOptions());
    addSeamlessTileLayer(ui.probeProfileLocationMap);
    ui.probeProfileLocationMap.on("click", (event) => {
      setPendingProbeProfileImportCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
  }
  const hasCoordinates = isUsableCoordinates(coordinates);
  const center = hasCoordinates ? [coordinates.latitude, coordinates.longitude] : [43.7, -79.4];
  ui.probeProfileLocationMap.setView(center, hasCoordinates ? LOCATION_FOCUS_ZOOM : 7);
  setTimeout(() => ui.probeProfileLocationMap.invalidateSize(), 50);
  if (hasCoordinates) setPendingProbeProfileImportCoordinates(coordinates);
  else {
    setPendingProbeProfileImportCoordinates(null);
    ui.probeProfileLocationMarker?.remove();
    ui.probeProfileLocationMarker = null;
  }
}

export function openProbeProfileLocationDialog() {
  if (!els.probeProfileLocationDialog) return;
  const source = probeProfileImportSource();
  els.probeProfileLocationDialog.showModal();
  ensureProbeProfileLocationMap(source?.coordinates || null);
}

export function saveProbeProfileLocation() {
  if (!isUsableCoordinates(ui.pendingProbeProfileImportCoordinates)) return;
  ui.probeProfileImportCoordinates = { ...ui.pendingProbeProfileImportCoordinates };
  syncProbeProfileImportSourceNote();
  els.probeProfileLocationDialog?.close();
}

export function clearProbeProfileLocation() {
  ui.probeProfileImportCoordinates = null;
  ui.pendingProbeProfileImportCoordinates = null;
  syncProbeProfileImportSourceNote();
}

export function probeProfileCoordinatesMatch(first, second) {
  return Number(first?.latitude) === Number(second?.latitude)
    && Number(first?.longitude) === Number(second?.longitude);
}

export function probeProfileDisplayDepths(profile = []) {
  return [...new Set([
    ...probeProfileDepthsFeet,
    ...probeTemperatureProfileEntries(profile).map((entry) => Number(entry.depthFeet))
  ])].sort((first, second) => first - second);
}

export async function importNoaaProbeTemperatureProfile(button) {
  const source = probeProfileImportSource();
  if (!source) {
    setProbeProfileImportStatus("Choose a map point, or select a launch or waterbody with a saved map pin before importing NOAA data.", true);
    return;
  }
  const { coordinates } = source;

  if (collectProbeTemperatureProfile().length && !confirm("Replace the current probe temperature readings with the NOAA profile?")) {
    setProbeProfileImportStatus("NOAA import cancelled.");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.setAttribute?.("aria-busy", "true");
  button.textContent = "Loading NOAA…";
  setProbeProfileImportStatus("Loading NOAA water-column profile…");
  try {
    const time = tripConditionsTime(ui.tripDraft || {});
    const conditions = await window.noaaGreatLakesApi?.fishingConditions({
      time,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });
    const profile = conditions?.temperatureProfile;
    if (!profile?.available) throw new Error("No saved NOAA profile for the trip date");
    const importedProfile = noaaProbeTemperatureProfileEntries(profile);
    if (!importedProfile.length) throw new Error("NOAA profile contains no usable readings");
    if (!probeProfileCoordinatesMatch(coordinates, probeProfileImportSource()?.coordinates)) {
      setProbeProfileImportStatus("The NOAA source location changed while data loaded. Import again for the new location.", true);
      return;
    }
    // NOAA provides readings at its own model depths. Replace the editable
    // depth list as well, so old blank manual rows do not remain in the grid.
    probeProfileDepthsFeet = importedProfile.map((entry) => Number(entry.depthFeet));
    if (ui.tripDraft) ui.tripDraft.probeTemperatureProfile = structuredClone(importedProfile);
    renderProbeTemperatureProfile(importedProfile, { exactDepths: true });
    markTripFormChanged();
    clearTripFormMessage();
    setProbeProfileImportStatus(`Imported ${importedProfile.length} NOAA temperature reading${importedProfile.length === 1 ? "" : "s"} at the model's exact depths.`);
  } catch {
    setProbeProfileImportStatus("NOAA water-column data is unavailable for this location. Your current readings were not changed.", true);
  } finally {
    button.disabled = false;
    button.removeAttribute?.("aria-busy");
    button.textContent = originalLabel;
  }
}

export function renderProbeTemperatureProfile(profile = [], options = {}) {
  const grid = document.querySelector("#probeTemperatureGrid");
  if (!grid) return;
  const profileEntries = probeTemperatureProfileEntries(profile);
  const deepestSavedDepth = Math.max(...profileEntries.map((entry) => Number(entry.depthFeet)), 0);
  while (probeProfileDepthsFeet.at(-1) < deepestSavedDepth) {
    probeProfileDepthsFeet.push(probeProfileDepthsFeet.at(-1) + 10);
  }
  const temperaturesByDepth = new Map(profileEntries.map((entry) => [Number(entry.depthFeet), entry.temperature || ""]));
  const displayedDepths = options.exactDepths
    ? profileEntries.map((entry) => Number(entry.depthFeet))
    : probeProfileDisplayDepths(profileEntries);
  setHtml(grid, joinHtml(displayedDepths.map((depthFeet) => {
    const depthLabel = displayProbeDepth(depthFeet);
    const rawTemperature = String(temperaturesByDepth.get(depthFeet) ?? "").trim();
    const displayTemperature = displayProbeTemperatureInput(rawTemperature);
    return html`
      <label class="probe-temperature-cell">
        <span class="probe-temperature-depth">${depthLabel}</span>
        <input type="text" inputmode="decimal" data-probe-depth-feet="${depthFeet}" data-probe-temperature-raw="${rawTemperature}" data-probe-temperature-display="${displayTemperature}" value="${displayTemperature}" placeholder="—" aria-label="Probe temperature at ${depthLabel}" />
      </label>
    `;
  }), ""));
  renderProbeTemperatureProfileChart(profile);
}

export function collectProbeTemperatureProfile() {
  return [...document.querySelectorAll("#probeTemperatureGrid [data-probe-depth-feet]")]
    .map((input) => {
      const displayValue = input.dataset.probeTemperatureDisplay ?? "";
      const hasUnchangedDisplay = input.dataset.probeTemperatureDirty !== "true"
        && input.value === displayValue;
      return {
        depthFeet: Number(input.dataset.probeDepthFeet),
        temperature: hasUnchangedDisplay
          ? (input.dataset.probeTemperatureRaw ?? input.value.trim())
          : input.value.trim()
      };
    })
    .filter((entry) => entry.temperature);
}

export function addProbeProfileDepth() {
  const profile = collectProbeTemperatureProfile();
  probeProfileDepthsFeet.push(probeProfileDepthsFeet.at(-1) + 10);
  renderProbeTemperatureProfile(profile);
  const addedInput = document.querySelector(`#probeTemperatureGrid [data-probe-depth-feet="${probeProfileDepthsFeet.at(-1)}"]`);
  addedInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  addedInput?.focus({ preventScroll: true });
  markTripFormChanged();
}

export function numericProbeTemperature(value) {
  const match = String(value || "").trim().match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*([a-zA-Z°]+))?/);
  if (!match) return null;
  const number = Number(match[0].match(/-?(?:\d+(?:\.\d+)?|\.\d+)/)?.[0]);
  if (!Number.isFinite(number)) return null;
  const fromUnit = explicitMeasurementUnit(match[1]) || unitPreference("waterTemperature");
  return convertUnitValue(number, fromUnit, unitPreference("waterTemperature"));
}

export function numericProbeDepth(value) {
  const match = String(value || "").trim().match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*([a-zA-Z°]+))?/);
  if (!match) return null;
  const number = Number(match[0].match(/-?(?:\d+(?:\.\d+)?|\.\d+)/)?.[0]);
  if (!Number.isFinite(number)) return null;
  const fromUnit = explicitMeasurementUnit(match[1]) || unitPreference("depth");
  return convertUnitValue(number, fromUnit, "ft");
}

export function probeCatchDepthEntry(record = {}) {
  if (!record || record.detailsUnknown) return null;
  const ballDepth = numericProbeDepth(record.ballDepth);
  const cheater = String(record.presentation || "").toLowerCase() === "cheater"
    || String(record.setupLineId || "").endsWith("::cheater");
  if (cheater && Number.isFinite(ballDepth)) {
    return { depthFeet: ballDepth / 2, species: record.species || record.possibleSpecies || "" };
  }
  for (const field of ["depthDown", "ballDepth", "estimatedLureDepth", "estimatedDepth"]) {
    const depthFeet = numericProbeDepth(record[field]);
    if (Number.isFinite(depthFeet)) return { depthFeet, species: record.species || record.possibleSpecies || "" };
  }
  return null;
}

export function probeCatchDepths(catches = []) {
  return (Array.isArray(catches) ? catches : [])
    .map(probeCatchDepthEntry)
    .filter((entry) => entry && Number.isFinite(entry.depthFeet))
    .sort((a, b) => a.depthFeet - b.depthFeet);
}

export function collectProbeCatchDepths() {
  return probeCatchDepths(ui.tripDraft?.catches || []);
}

export const probeCatchColors = ["#f0b35b", "#e879f9", "#60a5fa", "#f87171", "#a3e635", "#c084fc", "#2dd4bf", "#fb7185"];

export function probeCatchSpecies(entry) {
  return String(entry?.species || "").trim() || "Unknown species";
}

export function probeCatchColor(species, speciesList = []) {
  const value = String(species || "Unknown species");
  const knownIndex = speciesList.indexOf(value);
  if (knownIndex >= 0) return probeCatchColors[knownIndex % probeCatchColors.length];
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index);
  return probeCatchColors[Math.abs(hash) % probeCatchColors.length];
}

export function probeTemperatureChartLegendItemsMarkup(catchDepths = []) {
  const species = [...new Set(catchDepths.map(probeCatchSpecies))];
  return html`<span><i class="probe-temperature-legend-line" aria-hidden="true"></i>Temperature profile</span>${species.length
    ? joinHtml(species.map((name) => html`<span><i class="probe-temperature-legend-dot" style="--probe-catch-color: ${probeCatchColor(name, species)}" aria-hidden="true"></i>${name}</span>`), "")
    : html`<span><i class="probe-temperature-legend-dot" aria-hidden="true"></i>Fish caught depth</span>`}`;
}

export function probeTemperatureChartLegendMarkup(catchDepths = []) {
  return html`<div class="probe-temperature-chart-legend" aria-label="Chart legend">${probeTemperatureChartLegendItemsMarkup(catchDepths)}</div>`;
}

export function probeTemperatureReadings(profile = []) {
  return probeTemperatureProfileEntries(profile)
    .map((entry) => ({
      depthFeet: Number(entry.depthFeet),
      temperature: String(entry.temperature || "").trim(),
      numericTemperature: numericProbeTemperature(entry.temperature)
    }))
    .filter((entry) => entry.temperature && Number.isFinite(entry.numericTemperature))
    .sort((a, b) => a.depthFeet - b.depthFeet);
}

export function probeChartScale(readings) {
  const values = readings.map((reading) => reading.numericTemperature);
  if (!values.length) return { min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(10, maximum - minimum);
  const step = span <= 18 ? 5 : span <= 36 ? 10 : 20;
  const min = Math.floor((minimum - step) / step) * step;
  const max = Math.max(Math.ceil((maximum + step) / step) * step, min + step * 2);
  return {
    min,
    max,
    step,
    ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step)
  };
}

export function interpolatedProbeTemperature(readings, depthFeet) {
  if (!readings.length) return null;
  if (depthFeet <= readings[0].depthFeet) return readings[0].numericTemperature;
  if (depthFeet >= readings.at(-1).depthFeet) return readings.at(-1).numericTemperature;
  for (let index = 1; index < readings.length; index += 1) {
    const deeper = readings[index];
    if (depthFeet > deeper.depthFeet) continue;
    const shallower = readings[index - 1];
    const depthSpan = deeper.depthFeet - shallower.depthFeet;
    if (!depthSpan) return deeper.numericTemperature;
    const progress = (depthFeet - shallower.depthFeet) / depthSpan;
    return shallower.numericTemperature + ((deeper.numericTemperature - shallower.numericTemperature) * progress);
  }
  return readings.at(-1).numericTemperature;
}

export function probeTemperatureChartTooltipText(temperature, depthFeet) {
  return `Temperature: ${displayProbeTemperatureNumber(temperature)} ${unitSymbol("waterTemperature")} · Depth: ${displayProbeDepth(depthFeet)}`;
}

export function bindProbeTemperatureChartTooltip(chart) {
  if (!chart || chart.dataset.tooltipBound) return;
  chart.dataset.tooltipBound = "true";
  const hideTooltip = () => {
    const tooltip = chart.querySelector(".probe-temperature-chart-tooltip");
    if (tooltip) tooltip.hidden = true;
  };
  const positionTooltip = (tooltip, clientX, clientY) => {
    const chartRect = chart.getBoundingClientRect();
    tooltip.hidden = false;
    const maxLeft = Math.max(8, chartRect.width - tooltip.offsetWidth - 8);
    const maxTop = Math.max(8, chartRect.height - tooltip.offsetHeight - 8);
    tooltip.style.left = `${Math.max(8, Math.min(clientX - chartRect.left + 14, maxLeft))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(clientY - chartRect.top + 14, maxTop))}px`;
  };
  const showPointTooltip = (target, clientX, clientY) => {
    const tooltip = chart.querySelector(".probe-temperature-chart-tooltip");
    if (!tooltip) return;
    tooltip.textContent = probeTemperatureChartTooltipText(
      Number(target.dataset.chartTemperature),
      Number(target.dataset.chartDepth)
    );
    positionTooltip(tooltip, clientX, clientY);
  };
  const showLineTooltip = (target, clientX, clientY) => {
    const tooltip = chart.querySelector(".probe-temperature-chart-tooltip");
    const svg = target.ownerSVGElement;
    if (!tooltip || !svg) return;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const rawX = ((clientX - rect.left) / rect.width) * viewBox.width;
    const rawY = ((clientY - rect.top) / rect.height) * viewBox.height;
    const plotLeft = Number(svg.dataset.chartPlotLeft);
    const plotTop = Number(svg.dataset.chartPlotTop);
    const plotWidth = Number(svg.dataset.chartPlotWidth);
    const plotHeight = Number(svg.dataset.chartPlotHeight);
    const scaleMin = Number(svg.dataset.chartScaleMin);
    const scaleMax = Number(svg.dataset.chartScaleMax);
    const depthMax = Number(svg.dataset.chartDepthMax);
    const temperature = scaleMin + (Math.max(0, Math.min(1, (rawX - plotLeft) / plotWidth)) * (scaleMax - scaleMin));
    const depthFeet = Math.max(0, Math.min(depthMax, ((rawY - plotTop) / plotHeight) * depthMax));
    tooltip.textContent = probeTemperatureChartTooltipText(temperature, depthFeet);
    positionTooltip(tooltip, clientX, clientY);
  };
  chart.addEventListener("pointermove", (event) => {
    const target = event.target.closest?.("[data-chart-point], [data-chart-line]");
    if (!target) return;
    if (target.matches("[data-chart-point]")) showPointTooltip(target, event.clientX, event.clientY);
    else showLineTooltip(target, event.clientX, event.clientY);
  });
  chart.addEventListener("pointerout", (event) => {
    const target = event.target.closest?.("[data-chart-point], [data-chart-line]");
    const nextTarget = event.relatedTarget?.closest?.("[data-chart-point], [data-chart-line]");
    if (target && target !== nextTarget) hideTooltip();
  });
  chart.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-chart-point]");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    showPointTooltip(target, rect.left + (rect.width / 2), rect.top + (rect.height / 2));
  });
  chart.addEventListener("focusout", (event) => {
    if (!event.relatedTarget || !chart.contains(event.relatedTarget)) hideTooltip();
  });
  chart.addEventListener("pointerleave", hideTooltip);
}

export function renderProbeTemperatureProfileChartMarkup(readings, options = {}) {
  const width = 620;
  const plot = { left: 58, right: 20, top: 34, bottom: 38 };
  const catchDepths = (Array.isArray(options.catchDepths) ? options.catchDepths : [])
    .filter((entry) => Number.isFinite(Number(entry?.depthFeet)));
  const deepestDepth = Math.max(readings.at(-1).depthFeet, ...catchDepths.map((entry) => Number(entry.depthFeet)), 10);
  // Keep the depth axis focused on the populated profile. Catch markers still
  // extend the range when a catch is deeper than the last temperature reading.
  const depthMax = Math.max(20, Math.ceil(deepestDepth / 20) * 20);
  // The editor is allowed to grow with a deeper profile so closely spaced
  // depth readings remain legible. The compact trip-report chart keeps its
  // fixed footprint.
  const height = options.compact
    ? 330
    : Math.max(360, plot.top + plot.bottom + ((depthMax / 20) * 36));
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const scale = probeChartScale(readings);
  const x = (temperature) => plot.left + ((temperature - scale.min) / (scale.max - scale.min)) * plotWidth;
  const y = (depthFeet) => plot.top + (depthFeet / depthMax) * plotHeight;
  const points = readings.map((reading) => `${x(reading.numericTemperature).toFixed(2)},${y(reading.depthFeet).toFixed(2)}`).join(" ");
  const areaPoints = `${plot.left},${y(readings[0].depthFeet).toFixed(2)} ${points} ${plot.left},${y(readings.at(-1).depthFeet).toFixed(2)}`;
  const horizontalGrid = joinHtml(Array.from({ length: Math.floor(depthMax / 20) + 1 }, (_, index) => index * 20)
    .map((depth) => html`<line x1="${plot.left}" y1="${y(depth).toFixed(2)}" x2="${width - plot.right}" y2="${y(depth).toFixed(2)}" />`), "");
  const verticalGrid = joinHtml(scale.ticks.map((tick) => html`<line x1="${x(tick).toFixed(2)}" y1="${plot.top}" x2="${x(tick).toFixed(2)}" y2="${height - plot.bottom}" />`), "");
  const xLabels = joinHtml(scale.ticks.map((tick) => html`<text x="${x(tick).toFixed(2)}" y="18" text-anchor="middle">${String(tick)}</text>`), "");
  const yLabels = joinHtml(Array.from({ length: Math.floor(depthMax / 20) + 1 }, (_, index) => index * 20)
    .map((depth) => html`<text x="${plot.left - 12}" y="${(y(depth) + 4).toFixed(2)}" text-anchor="end">${displayProbeDepthValue(depth)}</text>`), "");
  const dots = joinHtml(readings.map((reading) => html`
    <circle class="probe-temperature-point" data-chart-point="profile" data-chart-temperature="${reading.numericTemperature}" data-chart-depth="${reading.depthFeet}" cx="${x(reading.numericTemperature).toFixed(2)}" cy="${y(reading.depthFeet).toFixed(2)}" r="5" tabindex="0">
      <title>${`${displayProbeDepth(reading.depthFeet)}: ${displayProbeTemperatureMeasurement(reading.temperature)}`}</title>
    </circle>
  `), "");
  const catchGroups = new Map();
  const speciesList = [...new Set(catchDepths.map(probeCatchSpecies))];
  catchDepths.forEach((entry, index) => {
    const depthFeet = Number(entry.depthFeet);
    const group = catchGroups.get(depthFeet) || [];
    group.push({ entry, index });
    catchGroups.set(depthFeet, group);
  });
  const catchMarkers = joinHtml(catchDepths.map((entry, index) => {
    const depthFeet = Number(entry.depthFeet);
    const profileTemperature = interpolatedProbeTemperature(readings, depthFeet);
    const species = probeCatchSpecies(entry);
    const catchLabel = `${species} caught`;
    const profileTemperatureLabel = `${displayProbeTemperatureNumber(profileTemperature)} ${unitSymbol("waterTemperature")}`;
    const label = `${catchLabel} at ${displayProbeDepth(depthFeet)}; profile temperature approximately ${profileTemperatureLabel}`;
    const group = catchGroups.get(depthFeet) || [];
    const groupIndex = group.findIndex((item) => item.index === index);
    const spread = group.length > 1 ? (groupIndex - ((group.length - 1) / 2)) * 11 : 0;
    const markerX = Math.max(plot.left + 6, Math.min(width - plot.right - 6, x(profileTemperature) + spread));
    const color = probeCatchColor(species, speciesList);
    return html`<line class="probe-catch-depth-connector" x1="${x(profileTemperature).toFixed(2)}" y1="${y(depthFeet).toFixed(2)}" x2="${markerX.toFixed(2)}" y2="${y(depthFeet).toFixed(2)}" style="--probe-catch-color: ${color}" aria-hidden="true" />
      <circle class="probe-catch-depth-marker" data-chart-point="catch" data-chart-temperature="${profileTemperature}" data-chart-depth="${depthFeet}" cx="${markerX.toFixed(2)}" cy="${y(depthFeet).toFixed(2)}" r="6" tabindex="0" style="--probe-catch-color: ${color}"><title>${label}</title></circle>`;
  }), "");
  const axisUnit = unitSymbol("waterTemperature");
  const depthUnit = unitSymbol("depth");
  const titleId = `${options.idPrefix || "probeTemperatureChart"}Title`;
  const descriptionId = `${options.idPrefix || "probeTemperatureChart"}Description`;
  const catchDescription = catchDepths.length ? ` ${catchDepths.length} fish catch marker${catchDepths.length === 1 ? "" : "s"} appear on the temperature profile at their recorded depth.` : "";
  return html`
    <svg class="probe-temperature-chart-svg" viewBox="0 0 ${width} ${height}" data-chart-scale-min="${scale.min}" data-chart-scale-max="${scale.max}" data-chart-depth-max="${depthMax}" data-chart-plot-left="${plot.left}" data-chart-plot-top="${plot.top}" data-chart-plot-width="${plotWidth}" data-chart-plot-height="${plotHeight}" role="img" aria-labelledby="${titleId} ${descriptionId}">
      <title id="${titleId}">Probe temperature profile</title>
      <desc id="${descriptionId}">Water temperature in ${axisUnit} plotted against depth in ${depthUnit}; depth increases downward.${catchDescription}</desc>
      <g class="probe-temperature-grid-lines">${horizontalGrid}${verticalGrid}</g>
      <line class="probe-temperature-axis" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${height - plot.bottom}" />
      <line class="probe-temperature-axis" x1="${plot.left}" y1="${plot.top}" x2="${width - plot.right}" y2="${plot.top}" />
      <g class="probe-temperature-axis-labels">${xLabels}${yLabels}</g>
      <text class="probe-temperature-axis-title" x="${width / 2}" y="${height - 7}" text-anchor="middle">Temperature (${axisUnit})</text>
      <text class="probe-temperature-axis-title" transform="translate(14 ${height / 2}) rotate(-90)" text-anchor="middle">Depth (${depthUnit})</text>
      ${readings.length > 1 ? html`<polygon class="probe-temperature-area" points="${areaPoints}" />` : ""}
      ${readings.length > 1 ? html`<polyline class="probe-temperature-line" data-chart-line="true" points="${points}" />` : ""}
      <g class="probe-temperature-points">${dots}</g>
      <g class="probe-catch-depth-points" aria-label="Fish caught depths">${catchMarkers}</g>
    </svg>
  `;
}

export function renderProbeTemperatureProfileChart(profile = []) {
  const chart = document.querySelector("#probeTemperatureChart");
  if (!chart) return;
  bindProbeTemperatureChartTooltip(chart);
  const readings = probeTemperatureReadings(profile);
  const catchDepths = collectProbeCatchDepths();
  const legend = document.querySelector("#probeTemperatureChartLegend");
  if (legend) setHtml(legend, probeTemperatureChartLegendItemsMarkup(catchDepths));
  const summary = document.querySelector("#probeTemperatureChartSummary");
  if (summary) {
    summary.textContent = readings.length
      ? `Profile has ${readings.length} reading${readings.length === 1 ? "" : "s"}, from ${displayProbeDepth(readings[0].depthFeet)} to ${displayProbeDepth(readings.at(-1).depthFeet)}.${catchDepths.length ? ` ${catchDepths.length} fish catch marker${catchDepths.length === 1 ? "" : "s"} shown at catch depth.` : ""}`
      : "Add probe temperatures to see the profile chart.";
  }
  if (!readings.length) {
    setHtml(chart, html`
      <div class="probe-temperature-chart-empty">
        <span>Add at least two readings to see the temperature line.</span>
      </div>
    `);
    return;
  }
  setHtml(chart, html`${renderProbeTemperatureProfileChartMarkup(readings, { catchDepths })}<div class="probe-temperature-chart-tooltip" role="status" aria-live="polite" hidden></div>`);
}

export function setTripIntent(value) {
  const normalized = value === "experimental" ? "experimental" : "serious";
  const input = document.querySelector(`input[name="tripIntent"][value="${normalized}"]`);
  if (input) input.checked = true;
}

export function tripRatingValue(trip) {
  if (trip?.tripRating === null || trip?.tripRating === undefined || trip?.tripRating === "") return 1;
  const value = Number(trip.tripRating);
  if (!Number.isFinite(value)) return 1;
  if (value <= 1) return 1;
  return Math.min(4, Math.max(1, Math.round(value)));
}

export function setTripRating(value) {
  els.tripRating.value = String(tripRatingValue({ tripRating: value }));
  updateTripRatingLabel();
}

export function updateTripRatingLabel() {
  els.tripRatingLabel.textContent = tripRatingLabel(tripRatingValue({ tripRating: els.tripRating.value }));
}

export function tripRatingLabel(value) {
  const rating = tripRatingValue({ tripRating: value });
  return ["Bad", "Mediocre", "Good", "Outstanding"][rating - 1];
}

export function tripRatingClass(value) {
  return tripRatingLabel(value).toLowerCase().replaceAll(" ", "-");
}

export function mergePeople(...personLists) {
  const peopleById = new Map();
  const idsByName = new Map();
  personLists.flat().forEach((person) => {
    const name = person?.name?.trim();
    if (!person?.id || !name) return;
    const normalizedName = name.toLowerCase();
    const existingId = idsByName.get(normalizedName);
    if (existingId) {
      peopleById.set(existingId, { ...(peopleById.get(existingId) || {}), ...person, id: existingId, name });
      return;
    }
    peopleById.set(person.id, { ...(peopleById.get(person.id) || {}), ...person, id: person.id, name });
    idsByName.set(normalizedName, person.id);
  });
  return [...peopleById.values()].filter((person) => person.name);
}

export function tripIntent(trip) {
  return trip?.intent === "experimental" ? "experimental" : "serious";
}

export function intentLabel(value) {
  return value === "experimental" ? "Experimental" : "Serious";
}

export function addPersonRow(person = {}, { editNew = false } = {}) {
  const template = document.querySelector("#personRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.personId = person.id || createId();
  node.dataset.rowId = node.dataset.personId;
  if (ui.tripDraft && !ui.tripDraftHydrating && !ui.tripDraft.people.some((item) => item.id === node.dataset.personId)) {
    ui.tripDraft.people.push({ id: node.dataset.personId, name: person.name || "" });
  }
  node.querySelector(".person-name").value = person.name || "";
  els.personRows.append(node);
  applyTripDraftBindings(node);
  populatePersonSelects();
  if (editNew) {
    const select = node.querySelector(".person-select");
    const input = node.querySelector(".person-name");
    select.value = "__new__";
    input.classList.remove("hidden");
    node.dataset.focusPersonName = "true";
  }
}

export function collectPeople() {
  return [...els.personRows.querySelectorAll(".person-row")]
    .map((row) => personFromRow(row))
    .filter((person) => person.name);
}

export function personFromRow(row) {
  const select = row.querySelector(".person-select");
  const input = row.querySelector(".person-name");
  const selected = select?.value || "";
  if (selected && selected !== "__new__") {
    const existing = state.people.find((person) => person.id === selected)
      || collectNewPeople({ excludeRow: row }).find((person) => person.id === selected);
    return {
      ...existing,
      id: existing?.id || row.dataset.personId || selected,
      name: existing?.name || select.selectedOptions[0]?.textContent?.trim() || ""
    };
  }
  return {
    id: row.dataset.personId || createId(),
    name: input?.value.trim() || ""
  };
}

export function collectNewPeople({ excludeRow = null } = {}) {
  return [...els.personRows.querySelectorAll(".person-row")]
    .filter((row) => row !== excludeRow)
    .map((row) => {
      const select = row.querySelector(".person-select");
      const input = row.querySelector(".person-name");
      if (select?.value !== "__new__") return null;
      const name = input?.value.trim();
      return name ? { id: row.dataset.personId || createId(), name } : null;
    })
    .filter(Boolean);
}

export function syncPersonRowIds() {
  els.personRows.querySelectorAll(".person-row").forEach((row) => {
    const person = personFromRow(row);
    const name = person.name.trim().toLowerCase();
    const existingPerson = state.people.find((person) => person.name?.trim().toLowerCase() === name);
    if (existingPerson) row.dataset.personId = existingPerson.id;
  });
}

export function currentPeople() {
  syncPersonRowIds();
  return mergePeople(state.people, collectPeople());
}

export function populatePersonSelect(select, selectedId = "") {
  syncPersonRowIds();
  const people = mergePeople(collectPeople());
  const assignedPersonId = selectedId || (people.length === 1 ? people[0].id : "");
  setHtml(select, joinHtml([
    html`<option value="">Select person</option>`,
    ...people.map((person) => (
    html`<option value="${person.id}" ${person.id === selectedId ? "selected" : ""}>${person.name}</option>`
    ))
  ]));
  select.value = assignedPersonId;
}

export function populatePersonSelects() {
  populateDatalist(els.personOptions, currentPeople().map((person) => person.name).filter(Boolean));
  populatePersonRowSelects();
  document.querySelectorAll(".catch-person").forEach((select) => {
    populatePersonSelect(select, select.value);
  });
}

export function populatePersonRowSelects() {
  const allPeople = currentPeople();
  els.personRows.querySelectorAll(".person-row").forEach((row) => {
    const select = row.querySelector(".person-select");
    const input = row.querySelector(".person-name");
    const isAddingNew = select.value === "__new__";
    const customName = input.value.trim();
    const selectedId = row.dataset.personId || "";
    const hasExistingSelection = allPeople.some((person) => person.id === selectedId);
    const addingNew = isAddingNew || (!hasExistingSelection && customName);
    setHtml(select, joinHtml([
      html`<option value="">Select person</option>`,
      ...allPeople.map((person) => (
        html`<option value="${person.id}" ${person.id === selectedId ? "selected" : ""}>${person.name}</option>`
      )),
      html`<option value="__new__" ${addingNew ? "selected" : ""}>Add new person...</option>`
    ]));
    input.classList.toggle("hidden", select.value !== "__new__");
  });
}
