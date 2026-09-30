import { html, joinHtml, setHtml } from "./html.js";
import { createId, defaultTimeValue } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { automaticSpotId, choiceLabel, optionChoices, optionLabels, spotName, trollingSpreadById } from "./app-normalization.js";
import { formatDisplayTime } from "./app-units.js";
import { els } from "./app-elements.js";
import { isUsableCoordinates } from "./app-media.js";
import { flashAutoFilledField, updateCatchLocationSummary } from "./locations.js";
import { syncUnitLabels } from "./settings.js";
import { formatDate, populateChoiceSelect, populateOptionSelect } from "./dashboard.js";
import { fishCoordinatesFromRow, manualCoordinatesFromRow, renderCatchPhotos, updateMetadataLockButtons } from "./photos.js";
import { getValue, populatePersonSelect, syncTripFormChrome } from "./trip-editor.js";
import { comboName, lureName, rodName } from "./gear-core.js";
import { populateComboSelect, populateFlasherSelect, populateLureSelect, renderFlasherPreview, renderLurePreview } from "./gear-pickers.js";
import { defaultSetupLineSide, renderLiveTrollingSpread, setupLineAutoLabel, setupLineSideLabel } from "./trolling-spread.js";
import { isTrollingTrip, populateStructureSelect, updateCheaterDepth, updateLeadcoreEstimatedDepth, updatePresentationFields, updateTrollingVisibility } from "./form-utils.js";
import { applyTripDraftBindings, findDraftRecord, insertTripRow, replaceDraftRecord, replaceTripRows, updateTripRow } from "./draft-binding.js";


export function addCatchRow(catchItem = {}) {
  return addFishRow(catchItem, { container: els.catchRows, lost: false });
}

export function addLostFishRow(fishItem = {}) {
  return addFishRow(fishItem, { container: els.lostFishRows, lost: true });
}

export function expandAndRevealTripRow(row) {
  if (!row) return;
  row.classList.remove("collapsed");
  row.querySelector("[data-toggle-row]")?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.querySelector("input:not([type=hidden]), select")?.focus({ preventScroll: true });
  });
}

export function defaultFishTime(catchItem = {}) {
  return catchItem.timeUnknown ? "" : (catchItem.time ?? (ui.tripDraft?.launchTime || getValue("launchTime") || defaultTimeValue));
}

export function populateCatchSpotSelect(row, catchItem = {}) {
  const select = row?.querySelector(".catch-spot");
  if (!select) return;
  const mode = catchItem.spotAssignmentMode === "manual" ? "manual" : "automatic";
  const requestedSpotId = String(catchItem.spotId || "");
  const automaticId = automaticSpotId({
    ...catchItem,
    manualCoordinates: manualCoordinatesFromRow(row),
    coordinates: fishCoordinatesFromRow(row)
  });
  const automaticName = spotName(automaticId);
  const automaticLabel = automaticName || "No spot match";
  setHtml(select, joinHtml([
    html`<option value="__automatic__">${automaticLabel}</option>`,
    html`<option value="__none__">No spot</option>`,
    ...state.spots.map((spot) => html`<option value="${spot.id}">${spot.name}</option>`)
  ]));
  select.value = mode === "automatic" ? "__automatic__" : (state.spots.some((spot) => spot.id === requestedSpotId) ? requestedSpotId : "__none__");
}

export function refreshCatchSpotSelect(row) {
  const select = row?.querySelector(".catch-spot");
  if (!select) return;
  const record = fishRecordForRow(row);
  const value = record.spotSelection || (record.spotAssignmentMode === "manual" ? (record.spotId || "__none__") : "__automatic__");
  populateCatchSpotSelect(row, {
    spotAssignmentMode: value === "__automatic__" ? "automatic" : "manual",
    spotId: value.startsWith("__") ? "" : value
  });
}

export function updateUnknownTimeField(row) {
  const unknown = Boolean(fishRecordForRow(row).timeUnknown);
  const timeInput = row.querySelector(".catch-time");
  if (!timeInput) return;
  if (unknown) timeInput.value = "";
  timeInput.disabled = Boolean(unknown);
  if (unknown) {
    updateTripRow(row.classList.contains("lost-fish-row") ? "lostFish" : "catches", row.dataset.catchId, { time: "" });
  }
}

export function setControlValue(control, value = "") {
  if (!control) return;
  if (control.type === "checkbox" || control.type === "radio") {
    control.checked = Boolean(value);
    return;
  }
  control.value = value;
}

export function clearUnknownCatchDetails(row) {
  [
    ".catch-person",
    ".catch-time",
    ".catch-time-unknown",
    ".catch-released",
    ".catch-structure",
    ".catch-water-depth",
    ".catch-depth-down",
    ".catch-latitude",
    ".catch-longitude",
    ".catch-setup-line",
    ".catch-rod",
    ".catch-lure",
    ".catch-rigging",
    ".catch-rigging-details",
    ".catch-retrieve",
    ".catch-presentation",
    ".catch-direction",
    ".catch-fow",
    ".catch-gps-speed",
    ".catch-ball-speed",
    ".catch-ball-temp",
    ".catch-shaker",
    ".catch-ball-depth",
    ".catch-deepest-rigger",
    ".catch-flatline-weight-oz",
    ".catch-line-behind-board",
    ".catch-leadcore-colors",
    ".catch-estimated-lure-depth",
    ".catch-dipsey-setting",
    ".catch-line-out",
    ".catch-estimated-depth",
    ".catch-notes"
  ].forEach((selector) => setControlValue(row.querySelector(selector)));
  row.catchPhotos = [];
  row.catchWeatherData = null;
  row.catchMetadataLocks = { time: false, location: false, fow: false };
  row.dataset.metadataLockTime = "false";
  row.dataset.metadataLockLocation = "false";
  row.dataset.metadataLockFow = "false";
  delete row.dataset.lockedLocationLatitude;
  delete row.dataset.lockedLocationLongitude;
  updateTripRow(row.classList.contains("lost-fish-row") ? "lostFish" : "catches", row.dataset.catchId, {
    personId: "",
    time: "",
    timeUnknown: false,
    kept: false,
    structureType: "",
    waterDepth: "",
    depthDown: "",
    manualCoordinates: null,
    setupLineValue: "",
    setupLineId: "",
    setupLineTarget: "",
    rodId: "",
    lureId: "",
    rigging: "",
    riggingDetails: "",
    retrieve: "",
    presentation: "",
    direction: "",
    fowCaught: "",
    gpsSpeed: "",
    ballSpeed: "",
    ballTemp: "",
    shaker: false,
    ballDepth: "",
    deepestRigger: false,
    flatlineWeightOz: "",
    lineBehindBoard: "",
    leadcoreColors: "",
    estimatedLureDepth: "",
    dipseySetting: "",
    lineOut: "",
    estimatedDepth: "",
    notes: "",
    photos: [],
    weatherData: null,
    metadataLocks: { time: false, location: false, fow: false },
    lockedLocationCoordinates: null
  });
  renderCatchPhotos(row);
  renderLurePreview(row);
  updateMetadataLockButtons(row);
  updateCatchLocationSummary(row);
}

export function updateCatchDetailsUnknown(row, { clear = false } = {}) {
  if (!row) return;
  const detailsUnknown = Boolean(fishRecordForRow(row).detailsUnknown);
  if (detailsUnknown && clear) clearUnknownCatchDetails(row);
  row.classList.toggle("details-unknown", detailsUnknown);
  row.querySelectorAll(".catch-detail-optional:not(.catch-details-unknown-allowed)").forEach((field) => {
    field.classList.toggle("hidden", detailsUnknown);
  });
  updateUnknownTimeField(row);
  if (detailsUnknown) updatePresentationFields(row);
  else updateTrollingVisibility();
  updateRowSummary(row);
  renderLiveTrollingSpread();
}

export function defaultSetupStartTime(gearItem = {}) {
  return gearItem.startTime ?? (ui.tripDraft?.launchTime || getValue("launchTime") || defaultTimeValue);
}

export function defaultSetupEndTime(gearItem = {}) {
  return gearItem.endTime ?? (ui.tripDraft?.linesPulledTime || getValue("linesPulledTime") || defaultTimeValue);
}

export function syncTripTimesToBlankRows() {
  const startTime = ui.tripDraft?.launchTime || getValue("launchTime");
  const endTime = ui.tripDraft?.linesPulledTime || getValue("linesPulledTime");
  if (startTime) {
    document.querySelectorAll("#catchRows .catch-time, #lostFishRows .catch-time, #tripGearRows .trip-gear-start-time").forEach((field) => {
      const row = field.closest(".catch-row, .gear-used-row");
      const record = row?.classList.contains("gear-used-row") ? gearRecordForRow(row) : fishRecordForRow(row);
      if (record.timeUnknown) return;
      const current = row?.classList.contains("gear-used-row") ? record.startTime : record.time;
      if (!current) {
        field.value = startTime;
        const id = row?.dataset.catchId || row?.dataset.gearId || "";
        const collection = row?.classList.contains("gear-used-row") ? "gearUsed" : row?.classList.contains("lost-fish-row") ? "lostFish" : "catches";
        updateTripRow(collection, id, { [row?.classList.contains("gear-used-row") ? "startTime" : "time"]: startTime });
        flashAutoFilledField(field);
      }
    });
  }
  if (endTime) {
    document.querySelectorAll("#tripGearRows .trip-gear-end-time").forEach((field) => {
      const row = field.closest(".gear-used-row");
      if (!gearRecordForRow(row).endTime) {
        field.value = endTime;
        updateTripRow("gearUsed", row?.dataset.gearId, { endTime });
        flashAutoFilledField(field);
      }
    });
  }
  updateAllRowSummaries();
}

function hydratedFishRecord(catchItem = {}, { id, lost } = {}) {
  const setupLineValue = catchItem.setupLineValue || (catchItem.setupLineTarget === "cheater" ? `${catchItem.setupLineId || ""}::cheater` : catchItem.setupLineId || "");
  const manualCoordinates = isUsableCoordinates(catchItem.manualCoordinates)
    ? catchItem.manualCoordinates
    : (catchItem.coordinates?.manual && isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : null);
  return {
    ...catchItem,
    id: id || catchItem.id || createId(),
    detailsUnknown: Boolean(catchItem.detailsUnknown),
    species: lost ? "" : (catchItem.species || ""),
    possibleSpecies: catchItem.possibleSpecies || catchItem.species || "",
    kept: catchItem.released === undefined ? false : !Boolean(catchItem.released),
    length: lost ? "" : (catchItem.length || ""),
    weight: lost ? "" : (catchItem.weight || ""),
    time: defaultFishTime(catchItem),
    timeUnknown: Boolean(catchItem.timeUnknown),
    manualLatitude: manualCoordinates?.latitude ?? "",
    manualLongitude: manualCoordinates?.longitude ?? "",
    manualCoordinates,
    spotSelection: catchItem.spotAssignmentMode === "manual" ? (catchItem.spotId || "__none__") : "__automatic__",
    setupLineValue,
    setupLineId: setupLineValue.split("::")[0] || catchItem.setupLineId || catchItem.rodId || "",
    setupLineTarget: setupLineValue.endsWith("::cheater") ? "cheater" : (catchItem.setupLineTarget || ""),
    rodSelect: catchItem.setupLineId || catchItem.rodId || "",
    photos: structuredClone(catchItem.photos || [])
  };
}

function hydratedGearRecord(gearItem = {}, { id, rowIndex = 0 } = {}) {
  const matchingCombo = (gearItem.rodId || gearItem.reelId) && state.rodReelCombos.find((combo) => (
    combo.rodId === gearItem.rodId && combo.reelId === gearItem.reelId
  ));
  const comboId = gearItem.comboId || matchingCombo?.id || "";
  const combo = state.rodReelCombos.find((item) => item.id === comboId);
  const side = isTrollingTrip()
    ? (gearItem.side || defaultSetupLineSide(gearItem, rowIndex))
    : "";
  return {
    ...gearItem,
    id: id || gearItem.id || createId(),
    startTime: defaultSetupStartTime(gearItem),
    endTime: defaultSetupEndTime(gearItem),
    changeNote: gearItem.changeNote || gearItem.notes || "",
    side,
    lineLabel: gearItem.lineLabel || "",
    comboId,
    rodId: combo?.rodId || gearItem.rodId || "",
    reelId: combo?.reelId || gearItem.reelId || "",
    lureId: gearItem.lureId || "",
    presentation: gearItem.presentation || "",
    hasCheater: Boolean(gearItem.hasCheater),
    hasLeadcore: Boolean(gearItem.hasLeadcore),
    distanceBehind: gearItem.distanceBehind || "",
    dipseyDiverColor: gearItem.dipseyDiverColor || "",
    attachedWeightOz: gearItem.attachedWeightOz || "",
    rigging: gearItem.rigging || "",
    riggingDetails: gearItem.riggingDetails || "",
    leader: gearItem.leader || "",
    tippet: gearItem.tippet || "",
    cheaterLureId: gearItem.cheaterLureId || "",
    flasherId: gearItem.flasherId || ""
  };
}

export function addFishRow(catchItem = {}, { container, lost }) {
  const template = document.querySelector("#catchRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  if (lost) node.classList.add("lost-fish-row");
  node.dataset.rowId = createId();
  node.dataset.catchId = catchItem.id || node.dataset.rowId;
  const collection = lost ? "lostFish" : "catches";
  const existingDraft = findDraftRecord(collection, node.dataset.catchId);
  const draftRecord = hydratedFishRecord(existingDraft || catchItem, { id: node.dataset.catchId, lost });
  if (ui.tripDraft && !existingDraft) replaceDraftRecord(collection, draftRecord);
  node.catchPhotos = structuredClone(draftRecord.photos || []);
  node.dataset.photoLocationId = draftRecord.photoLocationId || "";
  node.dataset.heroPhotoId = draftRecord.heroPhotoId || "";
  node.catchMetadataLocks = {
    time: Boolean(draftRecord.metadataLocks?.time),
    location: Boolean(draftRecord.metadataLocks?.location),
    fow: Boolean(draftRecord.metadataLocks?.fow)
  };
  node.dataset.metadataLockTime = String(node.catchMetadataLocks.time);
  node.dataset.metadataLockLocation = String(node.catchMetadataLocks.location);
  node.dataset.metadataLockFow = String(node.catchMetadataLocks.fow);
  const lockedLocationCoordinates = isUsableCoordinates(draftRecord.lockedLocationCoordinates)
    ? draftRecord.lockedLocationCoordinates
    : (node.catchMetadataLocks.location && isUsableCoordinates(draftRecord.coordinates) ? draftRecord.coordinates : null);
  if (lockedLocationCoordinates) {
    node.dataset.lockedLocationLatitude = lockedLocationCoordinates.latitude;
    node.dataset.lockedLocationLongitude = lockedLocationCoordinates.longitude;
  }
  node.catchWeatherData = draftRecord.weatherData || null;
  node.catchDepthData = {
    depth_m: draftRecord.depth_m ?? null,
    depth_ft: draftRecord.depth_ft ?? null,
    lake_name: draftRecord.lake_name ?? null,
    depth_source: draftRecord.depth_source ?? null
  };
  node.querySelector(".remove-catch").setAttribute("aria-label", lost ? "Remove lost fish" : "Remove catch");
  node.querySelector(".catch-released-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-details-unknown-field").classList.remove("hidden");
  node.querySelector(".catch-species-field").classList.toggle("hidden", lost);
  node.querySelector(".possible-species-field").classList.toggle("hidden", !lost);
  node.querySelector(".catch-length-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-weight-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-water-depth-field").classList.remove("hidden");
  node.querySelector(".catch-depth-down-field").classList.remove("hidden");
  node.querySelector(".catch-photo-title").textContent = lost ? "Missed fish photos" : "Catch photos";
  node.querySelector(".catch-photo-title").classList.remove("hidden");
  node.querySelector(".catch-photo-editor").classList.remove("hidden");
  node.querySelector(".catch-spot-field").classList.remove("hidden");

  populatePersonSelect(node.querySelector(".catch-person"), draftRecord.personId || "");
  populateOptionSelect(node.querySelector(".catch-species"), state.species, "Select species");
  populateOptionSelect(node.querySelector(".catch-possible-species"), state.species, "Select possible species");
  populateStructureSelect(node.querySelector(".catch-structure"), draftRecord.structureType || "");
  populateOptionSelect(node.querySelector(".catch-rigging"), state.riggings, "Select rigging");
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", draftRecord.presentation || "");
  populateOptionSelect(node.querySelector(".catch-direction"), optionLabels("trollingDirections"), "Select direction");
  node.querySelector(".catch-species").value = lost ? "" : (draftRecord.species || "");
  node.querySelector(".catch-possible-species").value = draftRecord.possibleSpecies || "";
  node.querySelector(".catch-details-unknown").checked = Boolean(draftRecord.detailsUnknown);
  // Keep the current `released` field used by stats and reports.
  node.querySelector(".catch-released").checked = Boolean(draftRecord.kept);
  node.querySelector(".catch-length").value = draftRecord.length || "";
  node.querySelector(".catch-weight").value = draftRecord.weight || "";
  node.querySelector(".catch-time").value = draftRecord.time || "";
  node.querySelector(".catch-time-unknown").checked = Boolean(draftRecord.timeUnknown);
  updateUnknownTimeField(node);
  node.querySelector(".catch-water-depth").value = draftRecord.waterDepth || "";
  node.querySelector(".catch-depth-down").value = draftRecord.depthDown || "";
  node.querySelector(".catch-latitude").value = draftRecord.manualLatitude ?? "";
  node.querySelector(".catch-longitude").value = draftRecord.manualLongitude ?? "";
  populateCatchSpotSelect(node, draftRecord);
  updateCatchLocationSummary(node);
  node.querySelector(".catch-presentation").value = draftRecord.presentation || "";
  node.querySelector(".catch-direction").value = draftRecord.direction || "";
  node.querySelector(".catch-fow").value = draftRecord.fowCaught || "";
  node.querySelector(".catch-gps-speed").value = draftRecord.gpsSpeed ?? "";
  node.querySelector(".catch-ball-speed").value = draftRecord.ballSpeed || "";
  node.querySelector(".catch-ball-temp").value = draftRecord.ballTemp || "";
  node.querySelector(".catch-shaker").checked = Boolean(draftRecord.shaker);
  node.querySelector(".catch-retrieve").value = draftRecord.retrieve || "";
  node.querySelector(".catch-rigging").value = draftRecord.rigging || "";
  node.querySelector(".catch-rigging-details").value = draftRecord.riggingDetails || "";
  populateOptionSelect(node.querySelector(".catch-fly-presentation"), optionLabels("flyPresentations"), "Select presentation");
  node.querySelector(".catch-fly-presentation").value = draftRecord.flyPresentation || "";
  node.querySelector(".catch-ball-depth").value = draftRecord.ballDepth || "";
  node.querySelector(".catch-deepest-rigger").checked = Boolean(draftRecord.deepestRigger);
  node.querySelector(".catch-flatline-weight-oz").value = draftRecord.flatlineWeightOz || "";
  node.querySelector(".catch-line-behind-board").value = draftRecord.lineBehindBoard || "";
  node.querySelector(".catch-leadcore-colors").value = draftRecord.leadcoreColors || "";
  node.querySelector(".catch-estimated-lure-depth").value = catchItem.estimatedLureDepth || "";
  node.querySelector(".catch-dipsey-setting").value = draftRecord.dipseySetting || "";
  node.querySelector(".catch-line-out").value = draftRecord.lineOut || "";
  node.querySelector(".catch-estimated-depth").value = draftRecord.estimatedDepth || "";
  node.querySelector(".catch-notes").value = draftRecord.notes || "";
  node.querySelector(".catch-setup-line").dataset.selectedSetupLine = draftRecord.setupLineTarget === "cheater"
    ? `${draftRecord.setupLineId}::cheater`
    : (draftRecord.setupLineId || "");
  node.querySelector(".catch-rod").dataset.selectedRodId = draftRecord.rodId || "";
  populateLureSelect(node.querySelector(".catch-lure"), draftRecord.lureId || "");
  populateCatchRodSelect(
    node.querySelector(".catch-rod"),
    draftRecord.rodId || "",
    draftRecord.setupLineId || ""
  );
  syncCatchRiggingFromSetupLine(node);
  renderLurePreview(node);
  renderCatchPhotos(node);
  updateMetadataLockButtons(node);
  updatePresentationFields(node);

  container.append(node);
  applyTripDraftBindings(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  populateCatchRodSelects();
  updateCatchDetailsUnknown(node);
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  return node;
}

export function duplicateCatchRow(sourceRow) {
  if (!sourceRow || sourceRow.classList.contains("lost-fish-row")) return null;

  const sourceId = sourceRow.dataset.catchId || sourceRow.dataset.rowId || "";
  const source = findDraftRecord("catches", sourceId) || {};
  const sourceCoordinates = fishCoordinatesFromRow(sourceRow);
  const sourceManualCoordinates = manualCoordinatesFromRow(sourceRow);
  const record = structuredClone(source);
  record.id = createId();
  record.time = "";
  record.timeUnknown = false;
  record.photos = [];
  record.heroPhotoId = "";
  record.photoLocationId = "";
  record.metadataLocks = { ...(record.metadataLocks || {}), time: false };
  if (!sourceManualCoordinates && sourceCoordinates) {
    record.manualCoordinates = { latitude: sourceCoordinates.latitude, longitude: sourceCoordinates.longitude, manual: true };
    record.manualLatitude = sourceCoordinates.latitude;
    record.manualLongitude = sourceCoordinates.longitude;
  }
  const sourceIndex = [...els.catchRows.querySelectorAll(".catch-row")].indexOf(sourceRow);
  insertTripRow("catches", record, sourceIndex + 1);
  const duplicate = addFishRow(record, { container: els.catchRows, lost: false });
  sourceRow.after(duplicate);
  duplicate.classList.add("collapsed");
  duplicate.querySelector("[data-toggle-row]")?.setAttribute("aria-expanded", "false");
  return duplicate;
}

export function addTripGearRow(gearItem = {}) {
  const template = document.querySelector("#tripGearRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.rowId = createId();
  node.dataset.gearId = gearItem.id || node.dataset.rowId;
  const existingDraft = findDraftRecord("gearUsed", node.dataset.gearId);
  const draftRecord = hydratedGearRecord(existingDraft || gearItem, {
    id: node.dataset.gearId,
    rowIndex: els.tripGearRows.querySelectorAll(".gear-used-row").length
  });
  if (ui.tripDraft && !existingDraft) replaceDraftRecord("gearUsed", draftRecord);
  node.querySelector(".trip-gear-start-time").value = draftRecord.startTime;
  node.querySelector(".trip-gear-end-time").value = draftRecord.endTime;
  node.querySelector(".trip-gear-change-note").value = draftRecord.changeNote || "";
  const side = draftRecord.side || "";
  populateChoiceSelect(node.querySelector(".trip-gear-side"), optionChoices("setupLineSides"), "Select side", side);
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", draftRecord.presentation || "");
  node.querySelector(".trip-gear-side").value = side;
  node.querySelector(".trip-gear-line-label").value = draftRecord.lineLabel || "";
  populateComboSelect(node.querySelector(".trip-gear-combo"), draftRecord.comboId || "");
  node.querySelector(".catch-presentation").value = draftRecord.presentation || "";
  node.querySelector(".trip-gear-cheater").checked = Boolean(draftRecord.hasCheater);
  node.querySelector(".trip-gear-leadcore").checked = Boolean(draftRecord.hasLeadcore);
  node.querySelector(".trip-gear-distance-behind").value = draftRecord.distanceBehind || "";
  node.querySelector(".trip-gear-dipsey-diver-color").value = draftRecord.dipseyDiverColor || "";
  node.querySelector(".trip-gear-attached-weight").value = draftRecord.attachedWeightOz || "";
  populateLureSelect(node.querySelector(".trip-gear-lure"), draftRecord.lureId || "");
  populateOptionSelect(node.querySelector(".trip-gear-rigging"), state.riggings, "Select rigging");
  node.querySelector(".trip-gear-rigging").value = draftRecord.rigging || "";
  node.querySelector(".trip-gear-rigging-details").value = draftRecord.riggingDetails || "";
  node.querySelector(".trip-gear-leader").value = draftRecord.leader || "";
  node.querySelector(".trip-gear-tippet").value = draftRecord.tippet || "";
  populateLureSelect(node.querySelector(".trip-gear-cheater-lure"), draftRecord.cheaterLureId || "");
  populateFlasherSelect(node.querySelector(".trip-gear-flasher"), draftRecord.flasherId || "");
  renderLurePreview(node);
  renderFlasherPreview(node);
  updatePresentationFields(node);

  els.tripGearRows.append(node);
  applyTripDraftBindings(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  return node;
}

export function applyStartupTrollingSpread() {
  if (ui.activeTripId || !isTrollingTrip() || ui.newTripStartupSpreadApplied) return false;
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  ui.newTripStartupSpreadApplied = true;
  if (rows.length) return false;
  const spread = trollingSpreadById(state.settings?.defaultTrollingSpreadId);
  if (!spread.length) return false;
  spread.forEach((item) => addTripGearRow({
    comboId: item.comboId,
    side: item.side,
    presentation: item.presentation,
    dipseyDiverColor: item.dipseyDiverColor || "",
    lureId: "",
    flasherId: "",
    cheaterLureId: "",
    hasCheater: false
  }));
  [...els.tripGearRows.querySelectorAll(".gear-used-row")].slice(-spread.length).forEach((row) => {
    row.dataset.autoAddedSpread = "true";
  });
  return true;
}

export function previousTrollingTripForTargetSpecies() {
  const targetSpecies = getValue("targetSpecies").trim();
  const tripDate = getValue("tripDate");
  if (!targetSpecies) return null;
  return state.trips
    .filter((trip) => (
      trip.id !== ui.activeTripId
      && String(trip.method || "").toLowerCase() === "trolling"
      && String(trip.targetSpecies || "").trim() === targetSpecies
      && Array.isArray(trip.gearUsed)
      && trip.gearUsed.length
      && (!tripDate || !trip.date || String(trip.date) < tripDate)
    ))
    .sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")))[0] || null;
}

export function syncLastTrollingSpreadImportButton() {
  const button = els.importLastTrollingSpreadButton;
  if (!button) return;
  const sourceTrip = isTrollingTrip() ? previousTrollingTripForTargetSpecies() : null;
  button.disabled = !sourceTrip;
  button.title = sourceTrip
    ? `Import the spread from ${formatDate(sourceTrip.date)}`
    : "Choose a target species with a previous trolling trip to import its spread.";
}

export function lastTripSpreadGearItem(gearItem) {
  return {
    comboId: gearItem.comboId || "",
    rodId: gearItem.rodId || "",
    reelId: gearItem.reelId || "",
    side: gearItem.side || "",
    lineLabel: gearItem.lineLabel || "",
    presentation: gearItem.presentation || "",
    dipseyDiverColor: gearItem.dipseyDiverColor || "",
    hasLeadcore: Boolean(gearItem.hasLeadcore),
    distanceBehind: gearItem.distanceBehind || "",
    lureId: gearItem.lureId || "",
    rigging: gearItem.rigging || "",
    riggingDetails: gearItem.riggingDetails || "",
    flasherId: gearItem.flasherId || "",
    hasCheater: Boolean(gearItem.hasCheater),
    cheaterLureId: gearItem.cheaterLureId || ""
  };
}

export function importLastTrollingSpread() {
  const sourceTrip = previousTrollingTripForTargetSpecies();
  if (!sourceTrip) {
    alert("No previous trolling trip with this target species has a spread to import.");
    return;
  }
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  const onlyAutoAddedRows = rows.length > 0 && rows.every((row) => row.dataset.autoAddedSpread === "true");
  if (rows.length && !onlyAutoAddedRows && !window.confirm("Replace the current setup with the spread from your last matching trip?")) return;

  rows.forEach((row) => row.remove());
  replaceTripRows("gearUsed", []);
  sourceTrip.gearUsed.forEach((gearItem) => addTripGearRow(lastTripSpreadGearItem(gearItem)));
  populateSetupLineSelects();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  ui.tripFormUserChanged = true;
  syncTripFormChrome();
}

export function setupLineLabelFromRow(row, index) {
  return setupLineLabel(gearRecordForRow(row), index);
}

export function catchRodPickerLabelFromRow(row, index, { cheater = false } = {}) {
  return catchRodPickerLabel(gearRecordForRow(row), index, { cheater });
}

export function gearRecordForRow(row) {
  const id = row?.dataset?.gearId || "";
  return findDraftRecord("gearUsed", id) || {};
}

export function fishRecordForRow(row) {
  const collection = row?.classList?.contains?.("lost-fish-row") ? "lostFish" : "catches";
  return findDraftRecord(collection, row?.dataset?.catchId || row?.dataset?.rowId || "") || {};
}

export function setupLineLabel(record = {}, index = 0) {
  const customLabel = String(record.lineLabel || "").trim();
  if (customLabel) return customLabel;
  return setupLineAutoLabel({
    side: isTrollingTrip() ? record.side || "" : "",
    presentation: isTrollingTrip() ? record.presentation || "" : "",
    comboId: record.comboId || "",
    lureId: record.lureId || "",
    flasherId: record.flasherId || ""
  }, index);
}

export function catchRodPickerLabel(record = {}, index = 0, { cheater = false } = {}) {
  const customLabel = String(record.lineLabel || "").trim();
  const identity = customLabel || [
    isTrollingTrip() ? setupLineSideLabel(record.side) : "",
    isTrollingTrip() ? choiceLabel("trollingPresentations", record.presentation) : `Rod ${index + 1}`
  ].filter(Boolean).join(" ");
  const lureId = cheater
    ? record.cheaterLureId || ""
    : record.lureId || "";
  const lure = lureId.startsWith("__type__:") ? "" : lureName(lureId);
  return [cheater ? `${identity} — Cheater` : identity, lure].filter(Boolean).join(" / ");
}

export function setupLineOptions(draft = ui.tripDraft) {
  return (Array.isArray(draft?.gearUsed) ? draft.gearUsed : []).flatMap((record, index) => {
    const mainOption = {
      id: record.id || createId(),
      label: catchRodPickerLabel(record, index),
      startTime: record.startTime || "",
      endTime: record.endTime || ""
    };
    if (!record.hasCheater) return [mainOption];
    return [
      mainOption,
      {
        id: `${record.id}::cheater`,
        label: catchRodPickerLabel(record, index, { cheater: true }),
        startTime: record.startTime || "",
        endTime: record.endTime || ""
      }
    ];
  });
}

export const setupLineOptionsFromForm = setupLineOptions;

export function setupLineIsActiveAtTime(option, catchTime) {
  if (!catchTime || !option.startTime || !option.endTime) return true;
  if (option.startTime <= option.endTime) return catchTime >= option.startTime && catchTime <= option.endTime;
  return catchTime >= option.startTime || catchTime <= option.endTime;
}

export function populateSetupLineSelect(select, selectedId = "") {
  const catchRow = select.closest(".catch-row");
  const catchRecord = fishRecordForRow(catchRow);
  const catchTime = catchRecord.timeUnknown
    ? ""
    : (catchRecord.time || "");
  const options = setupLineOptions().filter((option) => setupLineIsActiveAtTime(option, catchTime));
  const selected = selectedId || catchRecord.setupLineValue || catchRecord.setupLineId || select.dataset.selectedSetupLine || "";
  select.dataset.selectedSetupLine = "";
  setHtml(select, html`<option value="">Select rod</option>${joinHtml(options.map((item) => (
    html`<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${item.label}</option>`
  )), "")}`);
}

export function populateSetupLineSelects() {
  document.querySelectorAll(".catch-setup-line").forEach((select) => {
    const record = fishRecordForRow(select.closest(".catch-row"));
    populateSetupLineSelect(select, record.setupLineValue || record.setupLineId || "");
  });
  document.querySelectorAll("#catchRows .catch-row").forEach(syncCatchMethodToSetupLine);
}

export const TROLLING_SETUP_ROW_ORDER = [
  "starboard|outside board",
  "starboard|inside board",
  "starboard|high diver",
  "starboard|low diver",
  "starboard|downrigger",
  "center|chute rod",
  "port|downrigger",
  "port|low diver",
  "port|high diver",
  "port|inside board",
  "port|outside board"
];

export function sortTrollingSetupRows() {
  if (!isTrollingTrip() || !els.tripGearRows) return;
  const order = new Map(TROLLING_SETUP_ROW_ORDER.map((value, index) => [value, index]));
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  rows.sort((first, second) => {
    const rowKey = (row) => [
      gearRecordForRow(row).side,
      gearRecordForRow(row).presentation
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    const firstOrder = order.get(rowKey(first)) ?? TROLLING_SETUP_ROW_ORDER.length;
    const secondOrder = order.get(rowKey(second)) ?? TROLLING_SETUP_ROW_ORDER.length;
    return firstOrder - secondOrder || rows.indexOf(first) - rows.indexOf(second);
  });
  rows.forEach((row) => els.tripGearRows.append(row));
}

export function rodOptionFromGearRow(row, index) {
  return rodOptionFromGearRecord(gearRecordForRow(row), index);
}

export function rodOptionFromGearRecord(record = {}, index = 0) {
  const combo = selectedComboForRecord(record);
  const rodId = combo?.rodId || "";
  const lureId = String(record.lureId || "").startsWith("__type__:") ? "" : (record.lureId || "");
  const fallbackLabel = setupLineLabel(record, index);
  const label = [
    comboName(record.comboId || "") || rodName(rodId) || fallbackLabel,
    lureName(lureId)
  ].filter(Boolean).join(" / ");
  return {
    id: record.id || createId(),
    rodId,
    lureId,
    label: label || fallbackLabel || `Rod ${index + 1}`
  };
}

export function catchRodOptions(draft = ui.tripDraft) {
  return (Array.isArray(draft?.gearUsed) ? draft.gearUsed : [])
    .map((record, index) => rodOptionFromGearRecord(record, index))
    .filter((item) => item.rodId);
}

export const catchRodOptionsFromForm = catchRodOptions;

export function populateCatchRodSelect(select, selectedRodId = "", selectedOptionId = "") {
  if (!select) return;
  const rowRecord = fishRecordForRow(select.closest(".catch-row"));
  const selected = selectedRodId || rowRecord.rodId || select.dataset.selectedRodId || "";
  const options = catchRodOptions();
  const selectedOption = options.find((item) => item.id === selectedOptionId)?.id
    || options.find((item) => item.id === rowRecord.setupLineId)?.id
    || options.find((item) => item.rodId === selected)?.id
    || "";
  select.dataset.selectedRodId = "";
  setHtml(select, html`<option value="">Select rod</option>${joinHtml(options.map((item) => (
    html`<option value="${item.id}" data-rod-id="${item.rodId}" data-lure-id="${item.lureId}" ${item.id === selectedOption ? "selected" : ""}>${item.label}</option>`
  )), "")}`);
}

export function populateCatchRodSelects() {
  document.querySelectorAll(".catch-rod").forEach((select) => {
    const record = fishRecordForRow(select.closest(".catch-row"));
    populateCatchRodSelect(select, record.rodId || "", record.setupLineId || record.rodSelect || "");
  });
}

export function syncDirectCatchRodToLure(row) {
  if (!row) return;
  const record = fishRecordForRow(row);
  const option = catchRodOptions().find((item) => item.id === (record.setupLineId || record.rodSelect || ""));
  const lureId = option?.lureId || "";
  const patch = {
    setupLineId: option?.id || record.setupLineId || "",
    rodId: option?.rodId || record.rodId || "",
    lureId: lureId || record.lureId || ""
  };
  if (lureId) {
    const lureSelect = row.querySelector(".catch-lure");
    populateLureSelect(lureSelect, lureId);
  }
  updateTripRow(row.classList.contains("lost-fish-row") ? "lostFish" : "catches", row.dataset?.catchId || row.dataset?.rowId, patch);
  syncCatchRiggingFromSetupLine(row);
  renderLurePreview(row);
  updateRowSummary(row);
}

export function syncCatchRiggingFromSetupLine(row) {
  if (!row) return;
  const record = fishRecordForRow(row);
  const setup = findDraftRecord("gearUsed", record.setupLineId || record.rodSelect || "");
  if (!setup) return;

  const rigging = row.querySelector(".catch-rigging");
  const riggingDetails = row.querySelector(".catch-rigging-details");
  const riggingValue = setup.rigging || "";
  const riggingDetailsValue = setup.riggingDetails || "";
  if (rigging) rigging.value = riggingValue;
  if (riggingDetails) riggingDetails.value = riggingDetailsValue;
  updateTripRow(row.classList.contains("lost-fish-row") ? "lostFish" : "catches", row.dataset?.catchId || row.dataset?.rowId, {
    rigging: riggingValue,
    riggingDetails: riggingDetailsValue
  });
}

export function syncCatchMethodToSetupLine(row) {
  const record = fishRecordForRow(row);
  const selectedValue = record.setupLineValue || record.setupLineId || row.querySelector(".catch-setup-line")?.value || "";
  const presentationSelect = row.querySelector(".catch-presentation");
  if (!presentationSelect) return;

  const setupLineId = selectedValue.split("::")[0];
  const setup = findDraftRecord("gearUsed", setupLineId);
  const isCheater = selectedValue.endsWith("::cheater");
  if (isCheater && ![...presentationSelect.options].some((option) => option.value === "Cheater")) {
    presentationSelect.add(new Option("Cheater", "Cheater"));
  }
  const presentation = isCheater
    ? "Cheater"
    : (setup?.presentation || "");
  presentationSelect.value = presentation;
  updateTripRow(row.classList.contains("lost-fish-row") ? "lostFish" : "catches", row.dataset?.catchId || row.dataset?.rowId, {
    setupLineValue: selectedValue,
    setupLineId,
    setupLineTarget: isCheater ? "cheater" : "",
    presentation
  });
  updatePresentationFields(row);
  updateCheaterDepth(row);
  updateLeadcoreEstimatedDepth(row);
}

export function selectedText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

export function summaryOption(select, placeholders = []) {
  const text = selectedText(select);
  return placeholders.includes(text) ? "" : text;
}

export function rowNumber(row, selector) {
  return [...row.parentElement.querySelectorAll(selector)].indexOf(row) + 1;
}

export function fishRowLabel(row) {
  if (row.classList.contains("lost-fish-row")) return `Lost Fish ${rowNumber(row, ".lost-fish-row")}`;
  return `Catch ${rowNumber(row, ".catch-row:not(.lost-fish-row)")}`;
}

export function catchSetupSummary(row) {
  const record = fishRecordForRow(row);
  const selectedValue = record.setupLineValue || record.setupLineId || "";
  if (!selectedValue) return "";
  const setupLineId = selectedValue.split("::")[0];
  const setup = findDraftRecord("gearUsed", setupLineId);
  if (!setup) return "";
  const label = [
    setupLineSideLabel(setup.side),
    choiceLabel("trollingPresentations", setup.presentation)
  ].filter(Boolean).join(" ");
  return selectedValue.endsWith("::cheater") ? `${label} Cheater` : label;
}

export function catchLurePreviewName(row) {
  const lureId = fishRecordForRow(row).lureId || "";
  const lure = state.lures.find((item) => item.id === lureId);
  return lure?.name || "";
}

export function updateRowSummary(row) {
  const summary = row.querySelector(".collapsible-row-summary");
  if (!summary) return;

  if (row.classList.contains("catch-row")) {
    const record = fishRecordForRow(row);
    const released = !record.kept && !row.classList.contains("lost-fish-row");
    const trolling = isTrollingTrip();
    const pieces = [
      fishRowLabel(row),
      row.classList.contains("lost-fish-row")
        ? record.possibleSpecies
        : record.species,
      released ? "Released" : "",
      record.timeUnknown ? "Unknown time" : formatDisplayTime(record.time),
      trolling
        ? catchSetupSummary(row)
        : [
            catchRodOptions().find((item) => item.id === (record.setupLineId || record.rodSelect))?.label || "",
            lureName(record.lureId)
          ].filter(Boolean).join(" / "),
    ].filter(Boolean);
    summary.textContent = pieces.join(" · ");
    return;
  }

  const pieces = [
    `Rod ${rowNumber(row, ".gear-used-row")}`,
    isTrollingTrip() ? setupLineSideLabel(gearRecordForRow(row).side) : "",
    choiceLabel("trollingPresentations", gearRecordForRow(row).presentation) || gearRecordForRow(row).presentation || ""
  ].filter(Boolean);
  summary.textContent = pieces.join(" / ");
}

export let baseUpdateRowSummary;

export function updateAllRowSummaries() {
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updateRowSummary);
}

export function selectedComboForRow(row) {
  return selectedComboForRecord(gearRecordForRow(row));
}

export function selectedComboForRecord(record = {}) {
  return state.rodReelCombos.find((combo) => combo.id === record.comboId);
}

export function setup() {
  baseUpdateRowSummary = updateRowSummary;

  updateRowSummary = function updateRowSummaryWithDetails(row) {
    baseUpdateRowSummary(row);
    if (!row.classList.contains("catch-row")) return;
  
    const summary = row.querySelector(".collapsible-row-summary");
    const detail = row.querySelector(".collapsible-row-detail");
    if (!summary || !detail) return;
  
    const record = fishRecordForRow(row);
    const species = row.classList.contains("lost-fish-row")
      ? record.possibleSpecies || ""
      : record.species || "";
    const size = row.classList.contains("lost-fish-row")
      ? ""
      : [record.length || "", record.weight || ""].filter(Boolean).join(" / ");
    const time = record.timeUnknown
      ? "Unknown time"
      : formatDisplayTime(record.time || "");
    const lure = isTrollingTrip()
      ? catchSetupSummary(row)
      : catchLurePreviewName(row);
  
    summary.textContent = fishRowLabel(row);
    detail.textContent = [species, size, time, lure].filter(Boolean).join(" \u2022 ");
  };
}
