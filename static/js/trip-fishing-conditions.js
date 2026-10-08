import { convertUnitValue, explicitMeasurementUnit, formatUnitValue, unitPreference } from "./app-units.js";
import { currentDirectionLabel, currentSpeedLabel } from "./great-lakes-conditions.js";
import { isPointInsideGreatLake } from "./great-lakes-boundaries.js";
import { tripConditionsTime } from "./trip-condition-time.js";

function locationForTrip(trip = {}, locations = []) {
  const locationName = String(trip.location || "").trim().toLowerCase();
  return locations.find((item) => item.id === trip.locationId
    || String(item.name || "").trim().toLowerCase() === locationName);
}

export function isGreatLakesFishingTrip(trip = {}, locations = []) {
  const method = String(trip.method || "").trim().toLowerCase();
  if (!["trolling", "jigging"].includes(method)) return false;
  const location = locationForTrip(trip, locations);
  if (!location) return false;
  if (typeof location.greatLakesOverride === "boolean") return location.greatLakesOverride;
  return isPointInsideGreatLake(location.coordinates);
}

export function thermoclineDisplayValue(conditions = {}) {
  const profile = conditions.temperatureProfile || {};
  const topDepth = profile.thermocline?.topDepthMeters;
  if (typeof topDepth === "number" && Number.isFinite(topDepth)) return formatUnitValue(topDepth, "depth", "m", { decimals: 1 });
  if (profile.noThermocline) return "No distinct thermocline";
  return profile.available ? "Not identified" : "Unavailable";
}

function catchDepthMeters(catchItem = {}) {
  for (const raw of [catchItem.estimatedLureDepth, catchItem.depthDown, catchItem.estimatedDepth, catchItem.ballDepth]) {
    const match = String(raw ?? "").trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z]+))?$/);
    if (!match) continue;
    const unit = explicitMeasurementUnit(match[2]) || unitPreference("depth");
    const meters = convertUnitValue(match[1], unit, "m");
    if (Number.isFinite(meters) && meters >= 0) return meters;
  }
  return 0;
}

export function catchCurrentDisplayValues(conditions = {}, catchItem = {}) {
  const current = conditions.currentProfile || {};
  const readings = (current.values || []).filter((reading) => [
    reading.depthMeters, reading.speedMetersPerSecond, reading.directionDegrees
  ].every((value) => typeof value === "number" && Number.isFinite(value)));
  const targetDepth = catchDepthMeters(catchItem);
  const reading = readings.reduce((nearest, item) => (
    !nearest || Math.abs(Number(item.depthMeters) - targetDepth) < Math.abs(Number(nearest.depthMeters) - targetDepth) ? item : nearest
  ), null);
  if (!reading) return { speed: "Unavailable", direction: "Unavailable", note: "" };

  const speed = Number(reading.speedMetersPerSecond);
  const degrees = Math.round(Number(reading.directionDegrees)) % 360;
  const direction = speed < 0.001 ? "Still" : `Toward ${currentDirectionLabel(degrees)} (${degrees}°)`;
  const depth = current.surfaceOnly
    ? "Surface current only"
    : `Current near ${formatUnitValue(Number(reading.depthMeters), "depth", "m", { decimals: 1 })}`;
  return { speed: currentSpeedLabel(speed), direction, note: depth };
}

export async function loadSavedFishingConditions(trip, coordinates, catchItem = null) {
  const api = window.noaaGreatLakesApi;
  if (typeof api?.fishingConditions !== "function") throw new Error("Saved Great Lakes conditions are unavailable.");
  return api.fishingConditions({
    time: tripConditionsTime(trip, catchItem),
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude)
  });
}

export function signalCatchFishingConditionsChanged(row) {
  row?.dispatchEvent?.(new Event("fishingconditionschange", { bubbles: true }));
}
