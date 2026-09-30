import { createId, defaultTimeValue } from "./app-defaults.js";
import { state } from "./app-state.js";
import { findLaunchByIdOrName } from "./app-normalization.js";
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

export function normalizedTripRating(value) {
  if (value === null || value === undefined || value === "") return 1;
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  if (number <= 1) return 1;
  return Math.min(4, Math.max(1, Math.round(number)));
}

export function mediaRefs(photos = []) {
  return ensureArray(photos).map(canonicalMediaRef).filter(Boolean);
}

function matchingCombo(comboId, appState = state) {
  return ensureArray(appState.rodReelCombos).find((combo) => String(combo.id) === String(comboId));
}

function lineMinutes(line) {
  return Math.max(0, calculateMinutes(line.startTime || "", line.endTime || ""));
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
  draft.people = ensureArray(draft.people).map((person) => ({ ...person, id: person.id || createId() }));
  draft.gearUsed = ensureArray(draft.gearUsed).map((line) => ({ ...line, id: line.id || createId() }));
  draft.catches = ensureArray(draft.catches).map((fish) => ({ ...fish, id: fish.id || createId() }));
  draft.lostFish = ensureArray(draft.lostFish).map((fish) => ({ ...fish, id: fish.id || createId() }));
  draft.notePhotos = mediaRefs(draft.notePhotos);
  return draft;
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

function fishHasDepthData(depthData) {
  return Boolean(depthData && Object.values(depthData).some((value) => value !== null && value !== undefined && value !== ""));
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
  delete base.manualLatitude;
  delete base.manualLongitude;
  delete base.rodSelect;
  delete base.spotSelection;
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
  return {
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
}
