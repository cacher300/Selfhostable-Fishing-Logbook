import type { Trip } from "../types";

/** Parses an HH:mm value without depending on device locale or time zone. */
export function timeToMinutes(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
}

/** A finish earlier than the start is interpreted as an overnight trip. */
export function durationMinutes(start: unknown, end: unknown): number {
  const startMinutes = timeToMinutes(start), endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return (endMinutes < startMinutes ? endMinutes + 1_440 : endMinutes) - startMinutes;
}

export function durationHours(start: unknown, end: unknown): number {
  return durationMinutes(start, end) / 60;
}

export function numericValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function firstNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function fishCount(record: Record<string, unknown> | null | undefined): number {
  if (!record) return 0;
  const raw = record.quantity;
  return raw === undefined || raw === "" ? 1 : Math.max(0, numericValue(raw));
}

export function tripHours(trip: Trip): number {
  const start = trip.linesSetTime || trip.startTime || trip.launchTime;
  const end = trip.linesPulledTime || trip.endTime;
  if (timeToMinutes(start) === null || timeToMinutes(end) === null) return Math.max(0, numericValue(trip.hours));
  return Math.max(0, durationHours(start, end) - Math.max(0, numericValue(trip.idleHours)));
}

export function setupMinutes(line: Record<string, unknown>): number {
  const recorded = Math.max(numericValue(line.lureMinutes), numericValue(line.flasherMinutes));
  return recorded || durationMinutes(line.startTime, line.endTime);
}

export function hoursLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 hr";
  const rounded = Math.round(minutes * 10) / 10;
  return rounded < 60 ? `${rounded} min` : `${Math.round((rounded / 60) * 100) / 100} hr`;
}
