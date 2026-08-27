import { defaultLogbook } from "./defaults";
import type { Catch, Coordinates, Logbook, SetupLine, Trip } from "./types";

export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function usableCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Coordinates; const latitude = Number(candidate.latitude), longitude = Number(candidate.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && (latitude !== 0 || longitude !== 0) ? { latitude, longitude } : null;
}
export function normalizeLogbook(input: Partial<Logbook> | null | undefined): Logbook {
  const logbook = structuredClone(defaultLogbook); Object.assign(logbook, input ?? {}); logbook.schemaVersion = 1;
  for (const key of ["species","methods","lureTypes","flasherTypes","waterClarities","weatherTypes","reelStyles","rodTypes","lineTypes","lureBladeTypes","lureSpoonSizes","trollingDirections","lures","flashers","reels","rods","rodReelCombos","people","locations","trips"] as const) if (!Array.isArray(logbook[key])) (logbook[key] as unknown) = structuredClone(defaultLogbook[key]);
  logbook.mediaInbox = Array.isArray(logbook.mediaInbox) ? logbook.mediaInbox : [];
  logbook.settings = { ...defaultLogbook.settings, ...(input?.settings ?? {}) }; logbook.trips = logbook.trips.filter(Boolean).map(normalizeTrip); return logbook;
}
export function normalizeTrip(raw: Trip): Trip {
  const trip = { ...raw }; trip.id ||= id(); trip.date ||= new Date().toISOString().slice(0, 10); trip.title ||= `${trip.date} ${trip.targetSpecies ? `${trip.targetSpecies} ` : ""}Trip`;
  trip.linesSetTime ||= trip.startTime || ""; trip.linesPulledTime ||= trip.endTime || ""; trip.startTime = trip.linesSetTime; trip.endTime = trip.linesPulledTime;
  trip.catches = Array.isArray(trip.catches) ? trip.catches.map(c => ({ ...c, id: c.id || id(), photos: Array.isArray(c.photos) ? c.photos : [], coordinates: usableCoordinates(c.coordinates) })) : [];
  trip.lostFish = Array.isArray(trip.lostFish) ? trip.lostFish.map(c => ({ ...c, id: c.id || id() })) : []; trip.gearUsed = Array.isArray(trip.gearUsed) ? trip.gearUsed.map(s => ({ ...s, id: s.id || id() })) : []; trip.notePhotos = Array.isArray(trip.notePhotos) ? trip.notePhotos : []; trip.liveEvents = Array.isArray(trip.liveEvents) ? trip.liveEvents : []; return trip;
}
export function activeSetupAt(trip: Trip, time: string): SetupLine[] { return trip.gearUsed.filter(line => line.startTime <= time && (!line.endTime || line.endTime >= time)); }
export function tripDurationHours(trip: Trip): number { const startTime = trip.linesSetTime || trip.startTime || trip.launchTime, endTime = trip.linesPulledTime || trip.endTime; if (!trip.date || !startTime || !endTime) return 0; const start = new Date(`${trip.date}T${startTime}`); const end = new Date(`${trip.date}T${endTime}`); if (end < start) end.setDate(end.getDate() + 1); return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000); }
export function totals(logbook: Logbook) { const trips = logbook.trips.length, landed = logbook.trips.reduce((sum, trip) => sum + trip.catches.length, 0), lost = logbook.trips.reduce((sum, trip) => sum + trip.lostFish.length, 0), hours = logbook.trips.reduce((sum, trip) => sum + tripDurationHours(trip), 0); return { trips, landed, lost, hours, fishPerHour: hours ? landed / hours : 0 }; }
export function addCatch(trip: Trip, partial: Partial<Catch>, lost = false): Trip { const entry: Catch = { id: id(), time: new Date().toTimeString().slice(0, 5), species: "", photos: [], ...partial }; return { ...trip, [lost ? "lostFish" : "catches"]: [...(lost ? trip.lostFish : trip.catches), entry] }; }
