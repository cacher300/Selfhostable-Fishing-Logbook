import { tripConditionsTime } from "./trip-condition-time.js";

export function isNiagaraRiver(name = "") {
  return /^(?:(?:upper|lower)\s+)?niagara(?:\s+river)?(?:\s*\((?:upper|lower)\))?$/i.test(String(name).trim());
}

export function clarityLookupTime(trip) {
  if (!isNiagaraRiver(trip.location) || !trip.date) return null;
  try { return tripConditionsTime(trip); } catch { return null; }
}
