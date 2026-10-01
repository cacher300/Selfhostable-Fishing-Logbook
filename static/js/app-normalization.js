import { validateLogbook } from "./generated/logbook-schema-rules.js";
import { createId, defaults } from "./app-defaults.js";
import { state } from "./app-state.js";
import { isUsableCoordinates } from "./app-media.js";

export function normalizeCoordinates(coordinates) {
  if (!coordinates || typeof coordinates !== "object") return null;
  const normalized = {
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude)
  };
  return isUsableCoordinates(normalized) ? normalized : null;
}

export function coordinateDistanceMeters(first, second) {
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

export function automaticSpotId(catchItem, spots = state.spots || []) {
  const coordinates = normalizeCoordinates(catchItem?.manualCoordinates) || normalizeCoordinates(catchItem?.coordinates);
  if (!coordinates) return "";
  const matches = spots.flatMap((spot) => {
    const distance = coordinateDistanceMeters(coordinates, spot.coordinates);
    return distance <= Number(spot.radiusMeters) ? [{ id: spot.id, distance }] : [];
  });
  matches.sort((first, second) => first.distance - second.distance || first.id.localeCompare(second.id));
  return matches[0]?.id || "";
}

export function spotName(spotId) {
  return state.spots.find((spot) => spot.id === spotId)?.name || "";
}

export function slugId(prefix, value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${prefix}-${slug}` : createId();
}

export function locationNames() {
  return state.locations.map((location) => location.name).filter(Boolean);
}

export function findLocationByIdOrName(id, name) {
  return state.locations.find((location) => location.id === id)
    || state.locations.find((location) => location.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

export function findLaunchByIdOrName(location, id, name) {
  if (!location) return null;
  return (location.launches || []).find((launch) => launch.id === id)
    || (location.launches || []).find((launch) => launch.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

export function tripLocationRecord(trip) {
  return findLocationByIdOrName(trip?.locationId, trip?.location);
}

export function tripLaunchRecord(trip) {
  return findLaunchByIdOrName(tripLocationRecord(trip), trip?.launchId, trip?.launch);
}

export function tripWeatherCoordinates(trip) {
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

export function tripNamingKey(trip) {
  return [trip?.targetSpecies, trip?.method]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("\u0000");
}

export function generatedTripTitle(trip, trips = []) {
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

/** Throw unless `document` is a valid v2 logbook (shared schema + semantic rules). */
export function validateState(document) {
  const { valid, error } = validateLogbook(document);
  if (!valid) throw new Error(error || "The logbook is not a valid v2 document.");
  return document;
}

export function slugOptionValue(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function optionChoices(key) {
  const choices = Array.isArray(state[key]) ? state[key] : [];
  if (key !== "trollingPresentations") return choices;
  return choices.filter((item) => (
    String(item?.value || "").toLowerCase() !== "cheater" && String(item?.label || "").toLowerCase() !== "cheater"
  ));
}

export function optionLabels(key) {
  const values = Array.isArray(state[key]) ? state[key] : ["lureBeadSizes", "meatRigTypes", "softPlasticTypes"].includes(key) ? defaults[key] : [];
  return values.map((item) => typeof item === "object" ? item?.label || item?.value : item);
}

export function choiceLabel(key, value) {
  const text = String(value || "");
  return optionChoices(key).find((item) => item.value === text)?.label || text;
}

export function hasFishHawk() {
  return state.settings?.hasFishHawk !== false;
}

export function currentTrollingSpreads() {
  return Array.isArray(state.settings?.trollingSpreads) ? state.settings.trollingSpreads : [];
}

export function currentSavedSetups(setups = state.settings?.savedSetups) {
  return Array.isArray(setups) ? setups : [];
}

export function trollingSpreadById(spreadId = "", spreads = state.settings?.trollingSpreads) {
  return (Array.isArray(spreads) ? spreads : []).find((item) => item?.id === spreadId)?.spread || [];
}
