function normalizeCoordinates(coordinates) {
  if (!coordinates || typeof coordinates !== "object") return null;
  const normalized = {
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude)
  };
  return isUsableCoordinates(normalized) ? normalized : null;
}

function coordinateDistanceMeters(first, second) {
  if (!isUsableCoordinates(first) || !isUsableCoordinates(second)) return Number.POSITIVE_INFINITY;
  const earthRadius = 6371000;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const deltaLatitude = toRadians(second.latitude - first.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const latitudeOne = toRadians(first.latitude);
  const latitudeTwo = toRadians(second.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function automaticSpotId(catchItem, spots = state.spots || []) {
  const coordinates = normalizeCoordinates(catchItem?.manualCoordinates) || normalizeCoordinates(catchItem?.coordinates);
  if (!coordinates) return "";
  const matches = spots.flatMap((spot) => {
    const distance = coordinateDistanceMeters(coordinates, spot.coordinates);
    return distance <= Number(spot.radiusMeters) ? [{ id: spot.id, distance }] : [];
  });
  matches.sort((first, second) => first.distance - second.distance || first.id.localeCompare(second.id));
  return matches[0]?.id || "";
}

function normalizeCatchSpotAssignment(catchItem, spots = state.spots || []) {
  const mode = catchItem?.spotAssignmentMode === "manual" ? "manual" : "automatic";
  const spotIds = new Set(spots.map((spot) => spot.id));
  const requestedId = String(catchItem?.spotId || "").trim();
  return {
    ...catchItem,
    spotAssignmentMode: mode,
    spotId: mode === "manual"
      ? (spotIds.has(requestedId) ? requestedId : "")
      : automaticSpotId(catchItem, spots)
  };
}

function spotName(spotId) {
  return state.spots.find((spot) => spot.id === spotId)?.name || "";
}

function slugId(prefix, value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${prefix}-${slug}` : createId();
}

function locationNames() {
  return state.locations.map((location) => location.name).filter(Boolean);
}

function findLocationByIdOrName(id, name) {
  return state.locations.find((location) => location.id === id)
    || state.locations.find((location) => location.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

function findLaunchByIdOrName(location, id, name) {
  if (!location) return null;
  return (location.launches || []).find((launch) => launch.id === id)
    || (location.launches || []).find((launch) => launch.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

function tripLocationRecord(trip) {
  return findLocationByIdOrName(trip?.locationId, trip?.location);
}

function tripLaunchRecord(trip) {
  return findLaunchByIdOrName(tripLocationRecord(trip), trip?.launchId, trip?.launch);
}

function tripWeatherCoordinates(trip) {
  const launch = tripLaunchRecord(trip);
  if (isUsableCoordinates(launch?.coordinates)) {
    return { type: "launch", name: launch.name, coordinates: launch.coordinates };
  }
  const location = tripLocationRecord(trip);
  if (isUsableCoordinates(location?.coordinates)) {
    return { type: "location", name: location.name, coordinates: location.coordinates };
  }
  return null;
}

function tripNamingKey(trip) {
  return [trip?.targetSpecies, trip?.method]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("\u0000");
}

function generatedTripTitle(trip, trips = []) {
  const records = Array.isArray(trips) ? trips : [];
  const currentIndex = records.findIndex((item) => item === trip
    || (String(item?.id || "") && String(item?.id || "") === String(trip?.id || "")));
  const recordsThroughTrip = currentIndex >= 0 ? records.slice(0, currentIndex + 1) : records;
  const matchingTrips = recordsThroughTrip.filter((item) => tripNamingKey(item) === tripNamingKey(trip));
  const currentTripMatches = currentIndex >= 0 && tripNamingKey(records[currentIndex]) === tripNamingKey(trip);
  const number = matchingTrips.length + (currentTripMatches ? 0 : 1);
  const labels = [String(trip?.targetSpecies || "").trim(), String(trip?.method || "").trim()].filter(Boolean);
  return `${labels.join(" ") || "Fishing"} Trip #${number}`;
}

function shouldGenerateTripTitle(trip) {
  return !String(trip?.title || "").trim();
}

function validateState(document) {
  if (!document || typeof document !== "object" || document.schemaVersion !== 2) {
    throw new Error("Only v2 logbooks are supported.");
  }
  for (const key of ["species", "methods", "riggings", "lureTypes", "flasherTypes", "waterClarities", "structureOptions", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "flyCategories", "flyPresentations", "waterLevels", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "spots", "expeditions", "trips"]) {
    if (!Array.isArray(document[key])) throw new Error(`Missing v2 collection: ${key}`);
  }
  if (!document.settings || typeof document.settings !== "object") throw new Error("Missing v2 settings.");
  if (document.settings.chopRanges !== undefined) validateChopRanges(document.settings.chopRanges);
  const uploadCategories = new Set(["catch-photos", "trip-photos", "lures", "flashers", "reels", "rods", "queue"]);
  const checkMedia = (items, label) => {
    if (!Array.isArray(items)) throw new Error(`${label} must be a list.`);
    for (const item of items) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id
        || !uploadCategories.has(item.category) || typeof item.filename !== "string" || !item.filename
        || /[/\\]/.test(item.filename)) {
        throw new Error(`${label} contains an invalid v2 media reference.`);
      }
    }
  };
  for (const key of ["lures", "flashers", "reels", "rods"]) {
    for (const gear of document[key]) {
      checkMedia(gear.media || [], `${key} media`);
    }
  }
  for (const trip of document.trips) {
    checkMedia(trip.notePhotos || [], "Trip note photos");
    for (const fish of [...(trip.catches || []), ...(trip.lostFish || [])]) {
      checkMedia(fish.photos || [], "Fish photos");
    }
  }
  return document;
}

function slugOptionValue(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function optionChoices(key) {
  const choices = Array.isArray(state[key]) ? state[key] : [];
  if (key !== "trollingPresentations") return choices;
  return choices.filter((item) => (
    String(item?.value || "").toLowerCase() !== "cheater" && String(item?.label || "").toLowerCase() !== "cheater"
  ));
}

function optionLabels(key) {
  const values = Array.isArray(state[key]) ? state[key] : [];
  return values.map((item) => typeof item === "object" ? item?.label || item?.value : item);
}

function choiceLabel(key, value) {
  const text = String(value || "");
  return optionChoices(key).find((item) => item.value === text)?.label || text;
}


function hasFishHawk() {
  return state.settings?.hasFishHawk !== false;
}

function currentTrollingSpreads() {
  return Array.isArray(state.settings?.trollingSpreads) ? state.settings.trollingSpreads : [];
}

function currentSavedSetups(setups = state.settings?.savedSetups) {
  return Array.isArray(setups) ? setups : [];
}

function trollingSpreadById(spreadId = "", spreads = state.settings?.trollingSpreads) {
  return (Array.isArray(spreads) ? spreads : []).find((item) => item?.id === spreadId)?.spread || [];
}
