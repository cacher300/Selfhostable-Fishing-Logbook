import type { Logbook, SetupLine, Trip } from "../types";
import { fishCount, timeToMinutes } from "./duration";
import { gearName, resolveCatch } from "./setup-resolution";

export type TimelineType = "Setup" | "Catch" | "Lost" | "Photo" | "Live";
export type TimelineItem = { type: TimelineType; time?: string; sortTime: number; title: string; summary: string; note?: string; chips: string[]; photos?: unknown[]; setupRows?: Array<SetupLine & { action: "Deployed" | "Pulled" }> };
const typeOrder: Record<TimelineType, number> = { Live: 0, Setup: 1, Catch: 2, Lost: 3, Photo: 4 };
const minute = (value?: string) => timeToMinutes(value) ?? 9_999;

export function tripTimeline(logbook: Logbook, trip: Trip): TimelineItem[] {
  const grouped = new Map<string, { deployed: SetupLine[]; pulled: SetupLine[]; notes: string[] }>();
  const eventAt = (time: string) => { const key = time.slice(0, 5); const current = grouped.get(key) || { deployed: [], pulled: [], notes: [] }; grouped.set(key, current); return current; };
  trip.gearUsed.forEach(line => {
    if (line.startTime) { const event = eventAt(line.startTime); event.deployed.push(line); if (line.changeNote) event.notes.push(String(line.changeNote)); }
    if (line.endTime && line.endTime.slice(0, 5) !== String(trip.endTime || trip.linesPulledTime || "").slice(0, 5)) eventAt(line.endTime).pulled.push(line);
  });
  const setup = [...grouped.entries()].map(([time, event]): TimelineItem => ({ type: "Setup", time, sortTime: minute(time), title: event.pulled.length && event.deployed.length ? "Setup change" : event.deployed.length ? `${event.deployed.length} ${event.deployed.length === 1 ? "rod deployed" : "rods deployed"}` : `${event.pulled.length} ${event.pulled.length === 1 ? "rod pulled" : "rods pulled"}`, summary: "", note: [...new Set(event.notes)].join(" / "), chips: [], setupRows: [...event.pulled.map(line => ({ ...line, action: "Pulled" as const })), ...event.deployed.map(line => ({ ...line, action: "Deployed" as const }))] }));
  const catches = trip.catches.map((item, index): TimelineItem => { const record = resolveCatch(trip, item); const lure = [gearName(logbook, "lure", String(record.lureId || "")), gearName(logbook, "flasher", String(record.flasherId || ""))].filter(Boolean).join(" + "); return { type: "Catch", time: item.time, sortTime: minute(item.time), title: item.species || `Catch ${index + 1}`, summary: [item.released ? "Released" : "Kept", record.lineLabel, record.depthDown ? `${record.depthDown} down` : "", record.fowCaught ? `${record.fowCaught} water` : ""].filter(Boolean).join(" · "), note: String(item.notes || ""), chips: [lure, record.gpsSpeed ? `GPS ${record.gpsSpeed}` : "", record.ballSpeed ? `Ball ${record.ballSpeed}` : ""].filter(Boolean), photos: item.photos }; });
  const lost = trip.lostFish.map((item, index): TimelineItem => { const record = resolveCatch(trip, item, true); return { type: "Lost", time: item.time, sortTime: minute(item.time), title: String(item.possibleSpecies || item.species || `Lost Fish ${index + 1}`), summary: "", note: String(item.notes || ""), chips: [record.lineLabel ? String(record.lineLabel) : "", record.depthDown ? `${record.depthDown} down` : ""].filter(Boolean) }; });
  const photos = (trip.notePhotos || []).map((photo): TimelineItem => { const data = photo as Record<string, unknown>; const time = String(data.captureTime || ""); return { type: "Photo", time, sortTime: minute(time), title: String(data.caption || data.filename || "Trip photo"), summary: "", chips: [], photos: [photo] }; });
  const synthesizedKinds = new Set(["setup-added","setup-changed","catch","lost","photo"]);
  const live = (trip.liveEvents || []).filter(item => !synthesizedKinds.has(item.kind)).map((item):TimelineItem => ({type:"Live",time:item.time,sortTime:minute(item.time),title:item.title,summary:item.detail||"",chips:[item.kind.replaceAll("-"," ")],note:""}));
  return [...live, ...setup, ...catches, ...lost, ...photos].sort((a, b) => a.sortTime - b.sortTime || typeOrder[a.type] - typeOrder[b.type] || a.title.localeCompare(b.title));
}

export function setupOutcome(trip: Trip, line: SetupLine): { landed: number; lost: number } {
  return { landed: trip.catches.filter(item => item.setupLineId === line.id && (item as Record<string, unknown>).setupLineTarget !== "cheater").reduce((sum, item) => sum + fishCount(item), 0), lost: trip.lostFish.filter(item => item.setupLineId === line.id && (item as Record<string, unknown>).setupLineTarget !== "cheater").length };
}
