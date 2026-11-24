import { isUsableCoordinates } from "./app-media.js";
import { coordinateDistanceMeters } from "./app-normalization.js";
import { pointInPolygon } from "./drifts.js";
import { greatLakeNameAt } from "./great-lakes-boundaries.js";

const WATERBODY_PIN_RANGE_METERS = 500;

function nearbyNames(point, { spots, drifts, locations }) {
  const names = [
    ...spots.filter(spot => coordinateDistanceMeters(point, spot.coordinates) <= spot.radiusMeters)
      .map(spot => spot.lake || spot.waterbody),
    ...drifts.filter(drift => pointInPolygon(point, drift.polygon))
      .map(drift => drift.waterbody)
  ].filter(name => typeof name === "string" && name.trim());
  if (names.length) return names;

  const lake = greatLakeNameAt(point);
  if (lake) return [lake];

  return locations.filter(location => [location.coordinates, ...(location.launches || []).map(launch => launch.coordinates)]
    .some(pin => coordinateDistanceMeters(point, pin) <= WATERBODY_PIN_RANGE_METERS))
    .map(location => location.name);
}

// A drift needs a majority of matching vertices, with no conflicting name.
export function detectWaterbody(points, logbook) {
  if (!points.every(isUsableCoordinates)) return "";
  const names = new Map();
  let matched = 0;
  for (const point of points) {
    const candidates = nearbyNames(point, logbook);
    if (candidates.length) matched += 1;
    for (const candidate of candidates) {
      const name = candidate.trim();
      if (name) names.set(name.toLowerCase(), name);
    }
    if (names.size > 1) return "";
  }
  return matched > points.length / 2 && names.size === 1 ? names.values().next().value : "";
}
