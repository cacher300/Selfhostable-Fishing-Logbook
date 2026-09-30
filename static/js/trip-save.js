import { state, ui } from "./app-state.js";
import { generatedTripTitle } from "./app-normalization.js";
import { saveTripRecord, upsertListValueInDraft } from "./actions.js";
import { cleanupDeletedMedia, markMediaEditSessionSaved, mediaReferenceKeys } from "./app-media.js";
import { enrichTripWithWeather, resolveTripWaveSnapshot, weatherWindText } from "./location-weather.js";
import { renderAll } from "./dashboard.js";
import { closeTripDialog, confirmTripSaveWarnings, deleteTripById, mergePeople, setTripSaveLoading, setValue, showTripFormMessage, validateTripForm } from "./trip-editor.js";
import { tripFromDraft } from "./trip-draft.js";
import { flushTripDraftBindings } from "./draft-binding.js";


function controlById(id) {
  return document.getElementById(id);
}

function controlTextById(id) {
  return String(controlById(id)?.value ?? "").trim();
}

function firstByClass(root, className) {
  return root?.getElementsByClassName?.(className)?.[0] || null;
}

function textByClass(root, className) {
  return String(firstByClass(root, className)?.value ?? "").trim();
}

function checkedByClass(root, className) {
  return Boolean(firstByClass(root, className)?.checked);
}

function optionAttr(control, attr) {
  return control?.selectedOptions?.[0]?.getAttribute(attr) || "";
}

function existingDraftRecord(collection, id) {
  return ui.tripDraft?.[collection]?.find((item) => String(item.id) === String(id)) || {};
}

function mediaRefsFromRow(row, existing) {
  return (row.catchPhotos || existing.photos || []).map((photo) => ({ ...photo })).filter((photo) => photo.category || photo.filename);
}

function manualCoordinatesFromControls(row) {
  const latitude = Number(textByClass(row, "catch-latitude"));
  const longitude = Number(textByClass(row, "catch-longitude"));
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
    ? { latitude, longitude, manual: true }
    : null;
}

// TRANSITIONAL: several editor helpers (row templates, photo/queue autofill,
// weather/depth enrichment, saved setups and spreads, location picker) still
// write form controls directly instead of updating ui.tripDraft. Until they
// do, this re-reads the editor into the draft before saving so none of their
// changes are lost. Remove it once every writer goes through draft-binding.js.
function refreshTripDraftFromEditor() {
  if (!ui.tripDraft) return;
  const form = document.getElementById("tripForm");
  Object.assign(ui.tripDraft, {
    id: controlTextById("tripId") || ui.tripDraft.id,
    title: controlTextById("tripTitle"),
    date: controlTextById("tripDateValue") || ui.tripDraft.date,
    expeditionId: controlTextById("tripExpedition"),
    locationId: controlTextById("tripLocation"),
    launchId: controlTextById("tripLaunch"),
    launchTime: controlTextById("launchTime"),
    linesPulledTime: controlTextById("linesPulledTime"),
    idleHours: controlTextById("tripIdleTime"),
    targetSpecies: controlTextById("targetSpecies"),
    method: controlTextById("method"),
    intent: form?.elements?.["tripIntent"]?.value || ui.tripDraft.intent || "serious",
    tripRating: controlTextById("tripRating") || ui.tripDraft.tripRating,
    waterTemp: controlTextById("waterTemp"),
    waterClarity: controlTextById("waterClarity"),
    flyHatch: controlTextById("flyHatch"),
    waterLevel: controlTextById("waterLevel"),
    weather: controlTextById("weather"),
    waveHeight: controlTextById("waveHeight"),
    structure: controlTextById("structure"),
    notes: controlTextById("tripNotes"),
    notePhotos: (ui.activeNotePhotos || []).map((photo) => ({ ...photo }))
  });
  ui.tripDraft.people = [...document.getElementsByClassName("person-row")].map((row) => {
    const select = firstByClass(row, "person-select");
    const selected = String(select?.value || "");
    if (selected && selected !== "__new__") {
      const existing = state.people.find((person) => person.id === selected) || {};
      return { ...existing, id: existing.id || selected, name: existing.name || optionAttr(select, "label") || select?.selectedOptions?.[0]?.textContent?.trim() || "" };
    }
    return { id: row.getAttribute("data-person-id") || row.getAttribute("data-row-id") || "", name: textByClass(row, "person-name") };
  }).filter((person) => person.id && person.name);
  ui.tripDraft.gearUsed = [...document.getElementsByClassName("gear-used-row")].map((row) => {
    const id = row.getAttribute("data-gear-id") || row.getAttribute("data-row-id") || "";
    const comboId = textByClass(row, "trip-gear-combo");
    const combo = state.rodReelCombos.find((item) => item.id === comboId);
    return {
      ...existingDraftRecord("gearUsed", id),
      id,
      startTime: textByClass(row, "trip-gear-start-time"),
      endTime: textByClass(row, "trip-gear-end-time"),
      changeNote: textByClass(row, "trip-gear-change-note"),
      side: textByClass(row, "trip-gear-side"),
      lineLabel: textByClass(row, "trip-gear-line-label"),
      hasLeadcore: checkedByClass(row, "trip-gear-leadcore"),
      comboId,
      rodId: combo?.rodId || "",
      reelId: combo?.reelId || "",
      lureId: textByClass(row, "trip-gear-lure"),
      rigging: textByClass(row, "trip-gear-rigging"),
      riggingDetails: textByClass(row, "trip-gear-rigging-details"),
      leader: textByClass(row, "trip-gear-leader"),
      tippet: textByClass(row, "trip-gear-tippet"),
      flasherId: textByClass(row, "trip-gear-flasher"),
      presentation: textByClass(row, "catch-presentation"),
      distanceBehind: textByClass(row, "trip-gear-distance-behind"),
      dipseyDiverColor: textByClass(row, "trip-gear-dipsey-diver-color"),
      attachedWeightOz: textByClass(row, "trip-gear-attached-weight"),
      hasCheater: checkedByClass(row, "trip-gear-cheater"),
      cheaterLureId: textByClass(row, "trip-gear-cheater-lure")
    };
  });
  const fishRows = (collection, lost) => [...document.getElementById(lost ? "lostFishRows" : "catchRows")?.getElementsByClassName("catch-row") || []].map((row) => {
    const id = row.getAttribute("data-catch-id") || row.getAttribute("data-row-id") || "";
    const existing = existingDraftRecord(collection, id);
    const spotSelection = textByClass(row, "catch-spot") || "__automatic__";
    const rodControl = firstByClass(row, "catch-rod");
    const setupLineValue = textByClass(row, "catch-setup-line");
    return {
      ...existing,
      id,
      detailsUnknown: !lost && checkedByClass(row, "catch-details-unknown"),
      personId: textByClass(row, "catch-person"),
      species: lost ? "" : textByClass(row, "catch-species"),
      possibleSpecies: lost ? textByClass(row, "catch-possible-species") : "",
      kept: checkedByClass(row, "catch-released"),
      length: lost ? "" : textByClass(row, "catch-length"),
      weight: lost ? "" : textByClass(row, "catch-weight"),
      spotAssignmentMode: spotSelection === "__automatic__" ? "automatic" : "manual",
      spotId: spotSelection.startsWith("__") ? "" : spotSelection,
      structureType: textByClass(row, "catch-structure"),
      time: textByClass(row, "catch-time"),
      timeUnknown: checkedByClass(row, "catch-time-unknown"),
      waterDepth: textByClass(row, "catch-water-depth"),
      depthDown: textByClass(row, "catch-depth-down"),
      presentation: textByClass(row, "catch-presentation"),
      direction: textByClass(row, "catch-direction"),
      fowCaught: textByClass(row, "catch-fow"),
      gpsSpeed: textByClass(row, "catch-gps-speed"),
      ballSpeed: textByClass(row, "catch-ball-speed"),
      ballTemp: textByClass(row, "catch-ball-temp"),
      shaker: checkedByClass(row, "catch-shaker"),
      retrieve: textByClass(row, "catch-retrieve"),
      flyPresentation: textByClass(row, "catch-fly-presentation"),
      rigging: textByClass(row, "catch-rigging"),
      riggingDetails: textByClass(row, "catch-rigging-details"),
      ballDepth: textByClass(row, "catch-ball-depth"),
      deepestRigger: checkedByClass(row, "catch-deepest-rigger"),
      flatlineWeightOz: textByClass(row, "catch-flatline-weight-oz"),
      lineBehindBoard: textByClass(row, "catch-line-behind-board"),
      leadcoreColors: textByClass(row, "catch-leadcore-colors"),
      estimatedLureDepth: textByClass(row, "catch-estimated-lure-depth"),
      dipseySetting: textByClass(row, "catch-dipsey-setting"),
      lineOut: textByClass(row, "catch-line-out"),
      estimatedDepth: textByClass(row, "catch-estimated-depth"),
      notes: textByClass(row, "catch-notes"),
      setupLineValue,
      setupLineId: setupLineValue.split("::")[0] || textByClass(row, "catch-rod"),
      setupLineTarget: setupLineValue.endsWith("::cheater") ? "cheater" : "",
      rodId: optionAttr(rodControl, "data-rod-id") || existing.rodId || "",
      lureId: textByClass(row, "catch-lure"),
      manualCoordinates: manualCoordinatesFromControls(row),
      photos: mediaRefsFromRow(row, existing),
      depthData: row.catchDepthData || existing.depthData || null,
      weatherData: row.catchWeatherData || existing.weatherData || null,
      heroPhotoId: row.getAttribute("data-hero-photo-id") || existing.heroPhotoId || "",
      photoLocationId: row.getAttribute("data-photo-location-id") || existing.photoLocationId || ""
    };
  });
  ui.tripDraft.catches = fishRows("catches", false);
  ui.tripDraft.lostFish = fishRows("lostFish", true);
}

export async function saveTrip(event) {
  return persistTrip(event, { draft: false });
}

export async function saveTripAsDraft(event) {
  return persistTrip(event, { draft: true });
}

export async function persistTrip(event, { draft = false } = {}) {
  event.preventDefault();
  if (!draft && !validateTripForm()) return;
  if (!draft && !confirmTripSaveWarnings()) return;
  setTripSaveLoading(true, draft ? "draft" : "save");

  try {
    flushTripDraftBindings(event.currentTarget);
    flushTripDraftBindings(document.getElementById("tripDialog"));
    refreshTripDraftFromEditor();
    let trip = tripFromDraft(ui.tripDraft, { state });
    // Keep a stable id in the form so a retry after a failed request updates
    // the same in-memory trip instead of creating a duplicate.
    setValue("tripId", trip.id);
    if (ui.tripDraft) ui.tripDraft.id = trip.id;
    trip.isDraft = draft;
    trip.title = trip.title || generatedTripTitle(trip, state.trips);
    trip = await enrichTripWithWeather(trip);
    trip = resolveTripWaveSnapshot(trip);
    trip.wind = weatherWindText(trip.weatherData);
    ui.activeTripWeatherData = trip.weatherData || null;
    if (ui.tripDraft) ui.tripDraft.weatherData = trip.weatherData || null;

    const index = state.trips.findIndex((item) => item.id === trip.id);
    const previousMedia = index >= 0 ? [...mediaReferenceKeys(state.trips[index])] : [];

    await saveTripRecord(trip, (draftState) => {
      draftState.people = mergePeople(draftState.people, trip.people);
      upsertListValueInDraft(draftState, "species", trip.targetSpecies);
      upsertListValueInDraft(draftState, "methods", trip.method);
      upsertListValueInDraft(draftState, "waterClarities", trip.waterClarity);
      upsertListValueInDraft(draftState, "waterLevels", trip.waterLevel);
      trip.catches.forEach((catchItem) => upsertListValueInDraft(draftState, "flyPresentations", catchItem.flyPresentation));
      upsertListValueInDraft(draftState, "weatherTypes", trip.weather);
      trip.catches.forEach((catchItem) => upsertListValueInDraft(draftState, "species", catchItem.species));
      trip.lostFish.forEach((fish) => upsertListValueInDraft(draftState, "species", fish.possibleSpecies));
    });
    markMediaEditSessionSaved("trip");
    const currentMedia = mediaReferenceKeys(trip);
    await cleanupDeletedMedia(previousMedia.filter((key) => !currentMedia.has(key)));
    closeTripDialog({ force: true });
    renderAll();
  } catch (error) {
    console.error("Could not save trip.", error);
    setTripSaveLoading(false);
    showTripFormMessage(error.message || "The trip could not be saved. Check that required fields are filled and try again.");
  }
}

export async function deleteActiveTrip() {
  if (!ui.activeTripId) return;
  try {
    await deleteTripById(ui.activeTripId, { closeEditor: true });
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
