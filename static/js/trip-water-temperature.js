import { convertUnitValue, trimConvertedMeasurement } from "./app-units.js";
import { findLocationByIdOrName } from "./app-normalization.js";
import { isPointInsideGreatLake } from "./great-lakes-boundaries.js";
import { tripConditionsTime } from "./trip-condition-time.js";

const MAX_FORECAST_HOURS = 48;
const FORECAST_STEP_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;

export function tripWaterTemperatureLocationAvailable(trip = {}, coordinates = null) {
  const location = findLocationByIdOrName(trip.locationId, trip.location);
  if (!location) return false;
  if (typeof location.greatLakesOverride === "boolean") return location.greatLakesOverride;
  return isPointInsideGreatLake(location.coordinates) || isPointInsideGreatLake(coordinates);
}

export function tripWaterTemperatureLookup(trip = {}, now = Date.now()) {
  if (!trip.date) return null;
  let time;
  try {
    time = tripConditionsTime(trip);
  } catch {
    return null;
  }
  const target = Date.parse(time);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(target) || !Number.isFinite(nowMs)) return null;
  if (target <= nowMs && nowMs - target <= HOUR_MS) return { forecastHour: 0 };
  if (target <= nowMs) return { time };

  const hoursAhead = (target - nowMs) / HOUR_MS;
  if (hoursAhead > MAX_FORECAST_HOURS) return null;
  return { forecastHour: Math.round(hoursAhead / FORECAST_STEP_HOURS) * FORECAST_STEP_HOURS };
}

export function tripWaterTemperatureText(temperatureC, unit = "F") {
  if (temperatureC === null || temperatureC === undefined || temperatureC === "" || !Number.isFinite(Number(temperatureC))) return "";
  const value = convertUnitValue(temperatureC, "C", unit === "C" ? "C" : "F");
  if (!Number.isFinite(value)) return "";
  return trimConvertedMeasurement(Math.round(value * 10) / 10);
}
