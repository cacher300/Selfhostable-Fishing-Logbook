import { createId, defaultTimeValue } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { findLaunchByIdOrName } from "./app-normalization.js";
import { els } from "./app-elements.js";
import { canonicalMediaRef, isUsableCoordinates } from "./app-media.js";
import { chopLabelForWaveHeight } from "./settings-core.js";
import { calculateHours, calculateMinutes } from "./stats.js";
import { weatherWindText } from "./location-weather.js";

export function trimText(value) {
  return String(value ?? "").trim();
}

export function tripMethodFlags(method = "") {
  const key = trimText(method).toLowerCase();
  return {
    trolling: key === "trolling",
    casting: key === "casting",
    flyFishing: key === "fly fishing"
  };
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function controlValue(selector, root = document) {
  const control = root?.querySelector?.(selector);
  return trimText(control?.value || "");
}

function controlChecked(selector, root = document) {
  return Boolean(root?.querySelector?.(selector)?.checked);
}

function selectedRodId(select) {
  return select?.selectedOptions?.[0]?.dataset?.rodId || "";
}

function getTripControlValue(id) {
  const valueId = id === "tripDate" && document.querySelector("#tripDateValue") ? "tripDateValue" : id;
  return controlValue(`#${valueId}`);
}

function selectedTripIntent() {
  return document.querySelector('input[name="tripIntent"]:checked')?.value || "serious";
}

export function normalizedTripRating(value) {
  if (value === null || value === undefined || value === "") return 1;
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  if (number <= 1) return 1;
  return Math.min(4, Math.max(1, Math.round(number)));
}

function stableRowId(row, datasetKey) {
  if (!row?.dataset) return createId();
  if (!row.dataset[datasetKey]) row.dataset[datasetKey] = row.dataset.rowId || createId();
  return row.dataset[datasetKey];
}

function lineMinutes(line) {
  return Math.max(0, calculateMinutes(line.startTime || "", line.endTime || ""));
}

function matchingCombo(comboId, appState = state) {
  return ensureArray(appState.rodReelCombos).find((combo) => String(combo.id) === String(comboId));
}

function rowUsesSoftPlastic(row, lureId, appState = state) {
  const id = lureId || controlValue(".catch-lure, .trip-gear-lure", row);
  const lure = ensureArray(appState.lures).find((item) => String(item.id) === String(id));
  return trimText(lure?.type).toLowerCase() === "soft plastic";
}

function metadataLocksFromRow(row) {
  const fromDataset = (field) => row?.dataset?.[`metadataLock${field[0].toUpperCase()}${field.slice(1)}`];
  const existing = row?.catchMetadataLocks || {};
  return {
    time: fromDataset("time") === undefined ? Boolean(existing.time) : fromDataset("time") === "true",
    location: fromDataset("location") === undefined ? Boolean(existing.location) : fromDataset("location") === "true",
    fow: fromDataset("fow") === undefined ? Boolean(existing.fow) : fromDataset("fow") === "true"
  };
}

function lockedCoordinatesFromRow(row) {
  if (!metadataLocksFromRow(row).location) return null;
  const coordinates = {
    latitude: Number(row?.dataset?.lockedLocationLatitude),
    longitude: Number(row?.dataset?.lockedLocationLongitude)
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function manualCoordinatesFromRow(row) {
  const coordinates = {
    latitude: Number(controlValue(".catch-latitude", row)),
    longitude: Number(controlValue(".catch-longitude", row)),
    manual: true
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function gpsTaggedCatchPhotos(row) {
  return ensureArray(row?.catchPhotos).filter((photo) => isUsableCoordinates(photo.coordinates));
}

function photoTimestampValue(photo) {
  const timestamp = photo?.capturedAt
    || (photo?.captureDate && photo?.captureTime ? `${photo.captureDate}T${photo.captureTime}` : "")
    || (photo?.captureDate ? `${photo.captureDate}T00:00:00` : "");
  const value = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(value) ? value : null;
}

function selectedPhotoLocation(row) {
  const tagged = gpsTaggedCatchPhotos(row);
  if (!tagged.length) return null;
  const selected = tagged.find((photo) => photo.id === row?.dataset?.photoLocationId);
  if (selected) return selected;
  const timestamped = tagged
    .map((photo, index) => ({ photo, index, timestamp: photoTimestampValue(photo) }))
    .filter((item) => item.timestamp !== null)
    .sort((first, second) => first.timestamp - second.timestamp || first.index - second.index);
  return timestamped.at(-1)?.photo || tagged.at(-1) || null;
}

function selectedHeroPhoto(row) {
  const photos = ensureArray(row?.catchPhotos);
  if (!photos.length) return null;
  return photos.find((photo) => photo.id === row?.dataset?.heroPhotoId) || photos[0];
}

function fishCoordinatesFromRow(row) {
  return manualCoordinatesFromRow(row) || lockedCoordinatesFromRow(row) || selectedPhotoLocation(row)?.coordinates || null;
}

function mediaRefs(photos = []) {
  return ensureArray(photos).map(canonicalMediaRef).filter(Boolean);
}

function notePhotosFromForm() {
  const captions = new Map([...els.notePhotoGrid?.querySelectorAll?.("[data-note-photo]") || []].map((card) => [
    card.dataset.notePhoto,
    controlValue(".note-photo-caption", card)
  ]));
  return mediaRefs(ui.activeNotePhotos).map((photo) => ({
    ...photo,
    caption: captions.get(photo.id) ?? photo.caption ?? ""
  })).filter((photo) => photo.category);
}

function collectNewPeopleFromRows(rows, excludeRow = null) {
  return rows
    .filter((row) => row !== excludeRow)
    .map((row) => {
      const selected = controlValue(".person-select", row);
      if (selected !== "__new__") return null;
      const name = controlValue(".person-name", row);
      return name ? { id: stableRowId(row, "personId"), name } : null;
    })
    .filter(Boolean);
}

function personFromRow(row, rows) {
  const selected = controlValue(".person-select", row);
  if (selected && selected !== "__new__") {
    const existing = ensureArray(state.people).find((person) => person.id === selected)
      || collectNewPeopleFromRows(rows, row).find((person) => person.id === selected);
    return {
      ...(existing || {}),
      id: existing?.id || row.dataset?.personId || selected,
      name: existing?.name || row.querySelector?.(".person-select")?.selectedOptions?.[0]?.textContent?.trim() || ""
    };
  }
  return {
    id: stableRowId(row, "personId"),
    name: controlValue(".person-name", row)
  };
}

function peopleFromForm() {
  const rows = [...els.personRows?.querySelectorAll?.(".person-row") || []];
  return rows.map((row) => personFromRow(row, rows)).filter((person) => person.name);
}

function gearDraftsFromForm(existingTrip, appState = state) {
  return [...els.tripGearRows?.querySelectorAll?.(".gear-used-row") || []].map((row) => {
    const id = stableRowId(row, "gearId");
    const existing = ensureArray(existingTrip?.gearUsed).find((line) => line.id === id) || {};
    const comboId = controlValue(".trip-gear-combo", row);
    const combo = matchingCombo(comboId, appState);
    const lureId = controlValue(".trip-gear-lure", row);
    const presentation = controlValue(".catch-presentation", row);
    return {
      ...existing,
      id,
      startTime: controlValue(".trip-gear-start-time", row),
      endTime: controlValue(".trip-gear-end-time", row),
      changeNote: controlValue(".trip-gear-change-note", row),
      side: controlValue(".trip-gear-side", row),
      lineLabel: controlValue(".trip-gear-line-label", row),
      hasLeadcore: controlChecked(".trip-gear-leadcore", row),
      comboId,
      rodId: combo?.rodId || "",
      reelId: combo?.reelId || "",
      lureId,
      rigging: rowUsesSoftPlastic(row, lureId, appState) ? controlValue(".trip-gear-rigging", row) : "",
      riggingDetails: rowUsesSoftPlastic(row, lureId, appState) ? controlValue(".trip-gear-rigging-details", row) : "",
      leader: controlValue(".trip-gear-leader", row),
      tippet: controlValue(".trip-gear-tippet", row),
      flasherId: controlValue(".trip-gear-flasher", row),
      presentation,
      distanceBehind: controlValue(".trip-gear-distance-behind", row),
      dipseyDiverColor: controlValue(".trip-gear-dipsey-diver-color", row),
      attachedWeightOz: controlValue(".trip-gear-attached-weight", row),
      hasCheater: controlChecked(".trip-gear-cheater", row),
      cheaterLureId: controlValue(".trip-gear-cheater-lure", row)
    };
  });
}

function fishDraftsFromForm(container, existingTrip, { lost = false, appState = state } = {}) {
  const existingItems = ensureArray(lost ? existingTrip?.lostFish : existingTrip?.catches);
  return [...container?.querySelectorAll?.(".catch-row") || []].map((row) => {
    const id = stableRowId(row, "catchId");
    const existing = existingItems.find((fish) => fish.id === id) || {};
    const detailsUnknown = !lost && controlChecked(".catch-details-unknown", row);
    const spotSelection = controlValue(".catch-spot", row) || "__automatic__";
    const setupLineValue = controlValue(".catch-setup-line", row);
    const rodSelect = row.querySelector?.(".catch-rod");
    const lureId = controlValue(".catch-lure", row);
    return {
      ...existing,
      id,
      detailsUnknown,
      personId: controlValue(".catch-person", row),
      species: lost ? "" : controlValue(".catch-species", row),
      possibleSpecies: lost ? controlValue(".catch-possible-species", row) : "",
      kept: controlChecked(".catch-released", row),
      released: existing.released,
      length: lost ? "" : controlValue(".catch-length", row),
      weight: lost ? "" : controlValue(".catch-weight", row),
      spotAssignmentMode: spotSelection === "__automatic__" ? "automatic" : "manual",
      spotId: spotSelection.startsWith("__") ? "" : spotSelection,
      structureType: controlValue(".catch-structure", row),
      time: controlValue(".catch-time", row),
      timeUnknown: controlChecked(".catch-time-unknown", row),
      waterDepth: controlValue(".catch-water-depth", row),
      depthDown: controlValue(".catch-depth-down", row),
      presentation: controlValue(".catch-presentation", row),
      direction: controlValue(".catch-direction", row),
      fowCaught: controlValue(".catch-fow", row),
      gpsSpeed: controlValue(".catch-gps-speed", row),
      ballSpeed: controlValue(".catch-ball-speed", row),
      ballTemp: controlValue(".catch-ball-temp", row),
      shaker: controlChecked(".catch-shaker", row),
      retrieve: controlValue(".catch-retrieve", row),
      flyPresentation: controlValue(".catch-fly-presentation", row),
      rigging: rowUsesSoftPlastic(row, lureId, appState) ? controlValue(".catch-rigging", row) : "",
      riggingDetails: rowUsesSoftPlastic(row, lureId, appState) ? controlValue(".catch-rigging-details", row) : "",
      ballDepth: controlValue(".catch-ball-depth", row),
      deepestRigger: controlChecked(".catch-deepest-rigger", row),
      flatlineWeightOz: controlValue(".catch-flatline-weight-oz", row),
      lineBehindBoard: controlValue(".catch-line-behind-board", row),
      leadcoreColors: controlValue(".catch-leadcore-colors", row),
      estimatedLureDepth: controlValue(".catch-estimated-lure-depth", row),
      dipseySetting: controlValue(".catch-dipsey-setting", row),
      lineOut: controlValue(".catch-line-out", row),
      estimatedDepth: controlValue(".catch-estimated-depth", row),
      notes: controlValue(".catch-notes", row),
      metadataLocks: metadataLocksFromRow(row),
      lockedLocationCoordinates: lockedCoordinatesFromRow(row),
      manualCoordinates: manualCoordinatesFromRow(row),
      coordinates: fishCoordinatesFromRow(row),
      photoLocationId: selectedPhotoLocation(row)?.id || "",
      heroPhotoId: selectedHeroPhoto(row)?.id || "",
      photos: mediaRefs(row.catchPhotos || []),
      weatherData: row.catchWeatherData || existing.weatherData || null,
      depthData: row.catchDepthData ? structuredClone(row.catchDepthData) : null,
      setupLineValue,
      setupLineId: setupLineValue.split("::")[0] || controlValue(".catch-rod", row),
      setupLineTarget: setupLineValue.endsWith("::cheater") ? "cheater" : "",
      rodId: selectedRodId(rodSelect) || existing.rodId || "",
      lureId
    };
  });
}

export function createTripDraft(trip = null, options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const draft = trip ? structuredClone(trip) : {
    id: "",
    title: "",
    date: today,
    expeditionId: "",
    location: "",
    locationId: "",
    launch: "",
    launchId: "",
    launchTime: defaultTimeValue,
    linesPulledTime: defaultTimeValue,
    idleHours: "",
    targetSpecies: "",
    method: "",
    intent: "serious",
    tripRating: 1,
    waterTemp: "",
    probeTemperatureProfile: [],
    waterClarity: "",
    flyHatch: "",
    waterLevel: "",
    weather: "",
    waveHeight: "",
    waveChop: "",
    wind: "",
    weatherData: null,
    structure: "",
    notes: "",
    notePhotos: [],
    people: [],
    gearUsed: [],
    catches: [],
    lostFish: []
  };
  draft.people = ensureArray(draft.people);
  draft.gearUsed = ensureArray(draft.gearUsed).map((line) => ({ ...line, id: line.id || createId() }));
  draft.catches = ensureArray(draft.catches).map((fish) => ({ ...fish, id: fish.id || createId() }));
  draft.lostFish = ensureArray(draft.lostFish).map((fish) => ({ ...fish, id: fish.id || createId() }));
  return draft;
}

export function tripDraftFromForm(options = {}) {
  const appState = options.state || state;
  const existingTrip = options.existingTrip || ensureArray(appState.trips).find((trip) => trip.id === getTripControlValue("tripId"));
  const draft = createTripDraft(existingTrip || null);
  Object.assign(draft, {
    id: getTripControlValue("tripId") || draft.id || createId(),
    title: getTripControlValue("tripTitle"),
    date: getTripControlValue("tripDate"),
    expeditionId: getTripControlValue("tripExpedition"),
    locationId: getTripControlValue("tripLocation"),
    launchId: getTripControlValue("tripLaunch"),
    launchTime: getTripControlValue("launchTime"),
    linesPulledTime: getTripControlValue("linesPulledTime"),
    idleHours: getTripControlValue("tripIdleTime"),
    targetSpecies: getTripControlValue("targetSpecies"),
    method: getTripControlValue("method"),
    intent: selectedTripIntent(),
    tripRating: normalizedTripRating(els.tripRating?.value),
    waterTemp: getTripControlValue("waterTemp"),
    waterClarity: getTripControlValue("waterClarity"),
    flyHatch: getTripControlValue("flyHatch"),
    waterLevel: getTripControlValue("waterLevel"),
    weather: getTripControlValue("weather"),
    waveHeight: getTripControlValue("waveHeight"),
    structure: getTripControlValue("structure"),
    notes: getTripControlValue("tripNotes"),
    weatherData: ui.activeTripWeatherData || draft.weatherData || null,
    notePhotos: notePhotosFromForm(),
    people: peopleFromForm(),
    gearUsed: gearDraftsFromForm(existingTrip, appState),
    catches: fishDraftsFromForm(els.catchRows, existingTrip, { appState }),
    lostFish: fishDraftsFromForm(els.lostFishRows, existingTrip, { lost: true, appState })
  });
  if (typeof options.probeTemperatureProfile === "function") {
    draft.probeTemperatureProfile = options.probeTemperatureProfile();
  }
  return draft;
}

export function syncTripDraftFromForm(options = {}) {
  if (!els.tripDialog?.open && !options.force) return ui.tripDraft || null;
  ui.tripDraft = tripDraftFromForm(options);
  return ui.tripDraft;
}

function fishHasDepthData(depthData) {
  return Boolean(depthData && Object.values(depthData).some((value) => value !== null && value !== undefined && value !== ""));
}

export function normalizeSetupLine(line = {}, context = {}) {
  const flags = context.methodFlags || tripMethodFlags(context.method);
  const combo = matchingCombo(line.comboId, context.state || state);
  const presentation = trimText(line.presentation);
  const leadcoreCapable = ["Outside Board", "Inside Board", "Chute Rod", "flatline-leadcore", "flatline"].includes(presentation);
  const dipseyColorCapable = ["high-diver", "low-diver"].includes(presentation.toLowerCase().replace(/[\s_]+/g, "-"));
  const attachedWeightCapable = leadcoreCapable;
  const downrigger = ["downrigger", "Downrigger"].includes(presentation);
  const normalized = {
    ...line,
    id: line.id || createId(),
    startTime: trimText(line.startTime),
    endTime: trimText(line.endTime),
    changeNote: trimText(line.changeNote),
    side: flags.trolling ? trimText(line.side) : "",
    lineLabel: flags.trolling ? trimText(line.lineLabel) : "",
    hasLeadcore: flags.trolling && leadcoreCapable ? Boolean(line.hasLeadcore) : false,
    comboId: trimText(line.comboId),
    rodId: combo?.rodId || trimText(line.rodId),
    reelId: combo?.reelId || trimText(line.reelId),
    lureId: trimText(line.lureId),
    rigging: trimText(line.rigging),
    riggingDetails: trimText(line.riggingDetails),
    leader: flags.flyFishing ? trimText(line.leader) : "",
    tippet: flags.flyFishing ? trimText(line.tippet) : "",
    flasherId: flags.trolling ? trimText(line.flasherId) : "",
    presentation: flags.trolling ? presentation : "",
    distanceBehind: flags.trolling ? trimText(line.distanceBehind) : "",
    dipseyDiverColor: flags.trolling && dipseyColorCapable ? trimText(line.dipseyDiverColor) : "",
    attachedWeightOz: flags.trolling && attachedWeightCapable ? trimText(line.attachedWeightOz) : "",
    hasCheater: flags.trolling && downrigger ? Boolean(line.hasCheater) : false,
    cheaterLureId: flags.trolling && downrigger && line.hasCheater ? trimText(line.cheaterLureId) : ""
  };
  normalized.lureMinutes = normalized.lureId ? lineMinutes(normalized) : 0;
  normalized.flasherMinutes = flags.trolling && normalized.flasherId ? lineMinutes(normalized) : 0;
  return normalized;
}

function setupLineIsNotEmpty(item) {
  return Boolean(
    item.startTime || item.endTime || item.changeNote || item.lineLabel || item.hasLeadcore
    || item.comboId || item.rodId || item.reelId || item.lureId || item.rigging || item.riggingDetails
    || item.flasherId || item.lureMinutes || item.flasherMinutes || item.presentation || item.distanceBehind
    || item.dipseyDiverColor || item.attachedWeightOz || item.hasCheater || item.cheaterLureId
  );
}

export function normalizeFish(fish = {}, context = {}) {
  const flags = context.methodFlags || tripMethodFlags(context.method);
  const lost = Boolean(context.lost);
  const detailsUnknown = !lost && Boolean(fish.detailsUnknown);
  const setupLineValue = trimText(fish.setupLineValue || (fish.setupLineTarget === "cheater" ? `${fish.setupLineId || ""}::cheater` : fish.setupLineId || ""));
  const isCheater = setupLineValue.endsWith("::cheater") || fish.setupLineTarget === "cheater";
  const setupLineId = setupLineValue.split("::")[0] || trimText(fish.setupLineId);
  const presentation = trimText(fish.presentation);
  const mainDownrigger = ["downrigger", "Downrigger"].includes(presentation);
  const base = {
    ...fish,
    id: fish.id || createId(),
    detailsUnknown,
    personId: detailsUnknown ? "" : trimText(fish.personId),
    species: lost ? "" : trimText(fish.species),
    possibleSpecies: lost ? trimText(fish.possibleSpecies || fish.species) : "",
    released: detailsUnknown || lost ? false : !Boolean(fish.kept),
    length: lost ? "" : trimText(fish.length),
    weight: lost ? "" : trimText(fish.weight),
    spotAssignmentMode: fish.spotAssignmentMode === "manual" ? "manual" : "automatic",
    spotId: fish.spotAssignmentMode === "manual" ? trimText(fish.spotId) : "",
    structureType: detailsUnknown ? "" : trimText(fish.structureType),
    time: detailsUnknown ? "" : trimText(fish.time),
    timeUnknown: detailsUnknown ? false : Boolean(fish.timeUnknown),
    waterDepth: detailsUnknown ? "" : trimText(fish.waterDepth),
    depthDown: detailsUnknown ? "" : trimText(fish.depthDown),
    presentation: !detailsUnknown && flags.trolling ? presentation : "",
    direction: !detailsUnknown && flags.trolling ? trimText(fish.direction) : "",
    fowCaught: !detailsUnknown && (flags.trolling || lost) ? trimText(fish.fowCaught) : "",
    gpsSpeed: !detailsUnknown && flags.trolling ? trimText(fish.gpsSpeed) : "",
    ballSpeed: !detailsUnknown && flags.trolling ? trimText(fish.ballSpeed) : "",
    ballTemp: !detailsUnknown && flags.trolling ? trimText(fish.ballTemp) : "",
    shaker: !detailsUnknown && flags.trolling ? Boolean(fish.shaker) : false,
    retrieve: !detailsUnknown && flags.casting ? trimText(fish.retrieve) : "",
    flyPresentation: !detailsUnknown && flags.flyFishing ? trimText(fish.flyPresentation) : "",
    rigging: !detailsUnknown && !flags.trolling ? trimText(fish.rigging) : "",
    riggingDetails: !detailsUnknown && !flags.trolling ? trimText(fish.riggingDetails) : "",
    ballDepth: !detailsUnknown && flags.trolling ? trimText(fish.ballDepth) : "",
    deepestRigger: !detailsUnknown && flags.trolling && mainDownrigger && !isCheater ? Boolean(fish.deepestRigger) : false,
    flatlineWeightOz: !detailsUnknown && flags.trolling ? trimText(fish.flatlineWeightOz) : "",
    lineBehindBoard: !detailsUnknown && flags.trolling ? trimText(fish.lineBehindBoard) : "",
    leadcoreColors: !detailsUnknown && flags.trolling ? trimText(fish.leadcoreColors) : "",
    estimatedLureDepth: !detailsUnknown && flags.trolling ? trimText(fish.estimatedLureDepth) : "",
    dipseySetting: !detailsUnknown && flags.trolling ? trimText(fish.dipseySetting) : "",
    lineOut: !detailsUnknown && flags.trolling ? trimText(fish.lineOut) : "",
    estimatedDepth: !detailsUnknown && flags.trolling ? trimText(fish.estimatedDepth) : "",
    notes: trimText(fish.notes),
    metadataLocks: detailsUnknown ? { time: false, location: false, fow: false } : {
      time: Boolean(fish.metadataLocks?.time),
      location: Boolean(fish.metadataLocks?.location),
      fow: Boolean(fish.metadataLocks?.fow)
    },
    lockedLocationCoordinates: detailsUnknown ? null : (isUsableCoordinates(fish.lockedLocationCoordinates) ? fish.lockedLocationCoordinates : null),
    manualCoordinates: detailsUnknown ? null : (isUsableCoordinates(fish.manualCoordinates) ? fish.manualCoordinates : null),
    coordinates: detailsUnknown ? null : (isUsableCoordinates(fish.coordinates) ? fish.coordinates : null),
    photoLocationId: detailsUnknown ? "" : trimText(fish.photoLocationId),
    heroPhotoId: detailsUnknown ? "" : trimText(fish.heroPhotoId),
    photos: detailsUnknown ? [] : mediaRefs(fish.photos)
  };
  if (!detailsUnknown && fish.weatherData) base.weatherData = fish.weatherData;
  else if (detailsUnknown) delete base.weatherData;
  if (!detailsUnknown && fishHasDepthData(fish.depthData)) Object.assign(base, fish.depthData);
  delete base.depthData;
  delete base.setupLineValue;
  delete base.kept;
  if (!detailsUnknown && flags.trolling) {
    return {
      ...base,
      setupLineId,
      setupLineTarget: isCheater ? "cheater" : "",
      lureId: trimText(fish.lureId)
    };
  }
  return {
    ...base,
    setupLineId: trimText(fish.setupLineId),
    setupLineTarget: "",
    rodId: trimText(fish.rodId),
    lureId: trimText(fish.lureId),
    presentation: ""
  };
}

function fishIsNotEmpty(item) {
  return Boolean(
    item.species || item.possibleSpecies || item.time || item.length || item.weight || item.detailsUnknown
    || item.timeUnknown || item.waterDepth || item.structureType || item.depthDown || item.rodId
    || item.setupLineId || item.lureId || item.presentation || item.direction || item.fowCaught
    || item.gpsSpeed || item.ballSpeed || item.ballTemp || item.shaker || item.retrieve
    || item.rigging || item.riggingDetails || item.ballDepth || item.deepestRigger
    || item.flatlineWeightOz || item.lineBehindBoard || item.leadcoreColors || item.estimatedLureDepth
    || item.dipseySetting || item.lineOut || item.estimatedDepth || isUsableCoordinates(item.manualCoordinates)
    || item.notes || ensureArray(item.photos).length
  );
}

export function tripFromDraft(draft = {}, context = {}) {
  const appState = context.state || state;
  const flags = tripMethodFlags(draft.method);
  const location = ensureArray(appState.locations).find((item) => item.id === trimText(draft.locationId));
  const launch = findLaunchByIdOrName(location, trimText(draft.launchId), draft.launch || "");
  const idleHours = Number(draft.idleHours || 0);
  const normalizedIdleHours = Number.isFinite(idleHours) ? Math.max(0, idleHours) : 0;
  const weatherData = draft.weatherData || null;
  const waveHeight = trimText(draft.waveHeight);
  const method = trimText(draft.method);
  const base = {
    ...structuredClone(draft),
    id: trimText(draft.id) || createId(),
    title: trimText(draft.title),
    date: trimText(draft.date),
    expeditionId: trimText(draft.expeditionId),
    location: location?.name || trimText(draft.location),
    locationId: location?.id || trimText(draft.locationId),
    launch: launch?.name || trimText(draft.launch),
    launchId: launch?.id || trimText(draft.launchId),
    launchTime: trimText(draft.launchTime),
    linesPulledTime: trimText(draft.linesPulledTime),
    idleHours: normalizedIdleHours,
    hours: Math.max(0, calculateHours(draft.launchTime || "", draft.linesPulledTime || "") - normalizedIdleHours),
    targetSpecies: trimText(draft.targetSpecies),
    method,
    intent: draft.intent === "experimental" ? "experimental" : "serious",
    tripRating: normalizedTripRating(draft.tripRating),
    waterTemp: trimText(draft.waterTemp),
    probeTemperatureProfile: ensureArray(draft.probeTemperatureProfile).filter((entry) => entry?.temperature),
    waterClarity: trimText(draft.waterClarity),
    flyHatch: flags.flyFishing ? trimText(draft.flyHatch) : "",
    waterLevel: flags.flyFishing ? trimText(draft.waterLevel) : "",
    weather: trimText(draft.weather),
    waveHeight,
    waveChop: chopLabelForWaveHeight(waveHeight),
    wind: weatherWindText(weatherData),
    weatherData,
    structure: trimText(draft.structure),
    notes: trimText(draft.notes),
    notePhotos: mediaRefs(draft.notePhotos),
    people: ensureArray(draft.people).map((person) => ({ ...person, name: trimText(person.name) })).filter((person) => person.id && person.name),
    gearUsed: ensureArray(draft.gearUsed)
      .map((line) => normalizeSetupLine(line, { state: appState, method, methodFlags: flags }))
      .filter(setupLineIsNotEmpty),
    catches: ensureArray(draft.catches)
      .map((fish) => normalizeFish(fish, { state: appState, method, methodFlags: flags, lost: false }))
      .filter(fishIsNotEmpty),
    lostFish: ensureArray(draft.lostFish)
      .map((fish) => normalizeFish(fish, { state: appState, method, methodFlags: flags, lost: true }))
      .filter(fishIsNotEmpty)
  };
  return base;
}
