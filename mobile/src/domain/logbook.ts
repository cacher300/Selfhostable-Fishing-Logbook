import { tripHours } from "./services/duration";
import { assignCatchSpot } from "./services/spots";
import { defaultLogbook } from "./defaults";
import type { Catch, Coordinates, Logbook, SetupLine, Trip } from "./types";

export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function defaultTrollingSpreadForSpecies(logbook: Logbook, targetSpecies = ""): SetupLine[] {
  const target = targetSpecies.trim();
  const presets = Array.isArray(logbook.settings.defaultTrollingSpreads) ? logbook.settings.defaultTrollingSpreads : [];
  return presets.find(item => item?.targetSpecies === target)?.spread
    || presets.find(item => !item?.targetSpecies)?.spread
    || logbook.settings.defaultTrollingSpread
    || [];
}
export function prepareTrollingSpread(source: SetupLine[], startTime: string): SetupLine[] {
  return source.map((line, index) => ({ ...structuredClone(line), id: id(), startTime, endTime: "", lineLabel: line.lineLabel || `Rod ${index + 1}` }));
}
export function previousTrollingTripForSpecies(logbook: Logbook, current: Pick<Trip, "id" | "date" | "targetSpecies">): Trip | undefined {
  const target = String(current.targetSpecies || "").trim();
  if (!target) return undefined;
  return logbook.trips
    .filter(trip => trip.id !== current.id && String(trip.method || "").toLowerCase() === "trolling" && String(trip.targetSpecies || "").trim() === target && trip.gearUsed.length > 0 && (!current.date || !trip.date || trip.date < current.date))
    .sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")))[0];
}
export function usableCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Coordinates; const latitude = Number(candidate.latitude), longitude = Number(candidate.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && (latitude !== 0 || longitude !== 0) ? { latitude, longitude } : null;
}
export function normalizeLogbook(input: Partial<Logbook> | null | undefined): Logbook {
  const logbook = structuredClone(defaultLogbook); Object.assign(logbook, input ?? {}); logbook.schemaVersion = 1;
  for (const key of ["riggings","structureOptions","expeditions","spots","species","methods","lureTypes","flasherTypes","waterClarities","weatherTypes","reelStyles","rodTypes","lineTypes","lureBladeTypes","lureSpoonSizes","trollingDirections","lures","flashers","reels","rods","rodReelCombos","people","locations","trips"] as const) if (!Array.isArray(logbook[key])) (logbook[key] as unknown) = structuredClone(defaultLogbook[key]);
  logbook.species = logbook.species.flatMap(value => String(value).trim().toLowerCase() === "crappie" ? ["Black Crappie", "White Crappie"] : [value]);
  logbook.lureTypes = logbook.lureTypes.slice().sort((a, b) => a.localeCompare(b));
  logbook.mediaInbox = Array.isArray(logbook.mediaInbox) ? logbook.mediaInbox : [];
  logbook.settings = { ...defaultLogbook.settings, ...(input?.settings ?? {}) };
  logbook.settings.defaultTrollingSpread = Array.isArray(logbook.settings.defaultTrollingSpread) ? logbook.settings.defaultTrollingSpread : [];
  logbook.settings.defaultTrollingSpreads = Array.isArray(logbook.settings.defaultTrollingSpreads)
    ? logbook.settings.defaultTrollingSpreads.flatMap(item => item && Array.isArray(item.spread) ? [{ ...item, targetSpecies: String(item.targetSpecies || "").trim(), spread: item.spread }] : [])
    : [];
  logbook.trips = logbook.trips.filter(Boolean).map(raw => { const trip = normalizeTrip(raw); return { ...trip, catches: trip.catches.map(fish => assignCatchSpot(fish, logbook.spots)) }; }); return logbook;
}
export function normalizeTrip(raw: Trip): Trip {
  const trip = { ...raw }; trip.id ||= id(); trip.date ||= new Date().toISOString().slice(0, 10); trip.title ||= `${trip.date} ${trip.targetSpecies ? `${trip.targetSpecies} ` : ""}Trip`;
  trip.linesSetTime ||= trip.startTime || ""; trip.linesPulledTime ||= trip.endTime || ""; trip.startTime = trip.linesSetTime; trip.endTime = trip.linesPulledTime; trip.hours = tripHours(trip);
  trip.catches = Array.isArray(trip.catches) ? trip.catches.map(c => ({ ...c, id: c.id || id(), photos: Array.isArray(c.photos) ? c.photos : [], coordinates: usableCoordinates(c.coordinates) })) : [];
  trip.lostFish = Array.isArray(trip.lostFish) ? trip.lostFish.map(c => ({ ...c, id: c.id || id() })) : []; trip.gearUsed = Array.isArray(trip.gearUsed) ? trip.gearUsed.map(s => ({ ...s, id: s.id || id() })) : []; trip.notePhotos = Array.isArray(trip.notePhotos) ? trip.notePhotos : []; trip.liveEvents = Array.isArray(trip.liveEvents) ? trip.liveEvents : []; return trip;
}
export function activeSetupAt(trip: Trip, time: string): SetupLine[] { return trip.gearUsed.filter(line => line.startTime <= time && (!line.endTime || line.endTime >= time)); }
export function tripDurationHours(trip: Trip): number { return tripHours(trip); }
export function totals(logbook: Logbook) { const trips = logbook.trips.length, landed = logbook.trips.reduce((sum, trip) => sum + trip.catches.length, 0), lost = logbook.trips.reduce((sum, trip) => sum + trip.lostFish.length, 0), hours = logbook.trips.reduce((sum, trip) => sum + tripDurationHours(trip), 0); return { trips, landed, lost, hours, fishPerHour: hours ? landed / hours : 0 }; }
export function addCatch(trip: Trip, partial: Partial<Catch>, lost = false): Trip { const entry: Catch = { id: id(), time: new Date().toTimeString().slice(0, 5), species: "", photos: [], ...partial }; return { ...trip, [lost ? "lostFish" : "catches"]: [...(lost ? trip.lostFish : trip.catches), entry] }; }
