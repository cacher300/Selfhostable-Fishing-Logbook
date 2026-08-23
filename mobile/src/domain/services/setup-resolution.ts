import type { Catch, Logbook, SetupLine, Trip } from "../types";
import { timeToMinutes } from "./duration";

type UnknownRecord = Record<string, unknown>;
export type ResolvedCatch = Catch & UnknownRecord & { trip: Trip; setupLine?: SetupLine; lost?: boolean };

export function activeSetupLines(trip: Trip, time?: string): SetupLine[] {
  if (!time) return trip.gearUsed.filter(line => !line.endTime);
  const point = timeToMinutes(time);
  if (point === null) return [];
  return trip.gearUsed.filter(line => {
    const start = timeToMinutes(line.startTime), end = timeToMinutes(line.endTime);
    if (start === null) return false;
    const adjustedPoint = point < start && end !== null && end < start ? point + 1_440 : point;
    const adjustedEnd = end !== null && end < start ? end + 1_440 : end;
    return adjustedPoint >= start && (adjustedEnd === null || adjustedPoint <= adjustedEnd);
  });
}

export function resolveSetupLine(trip: Trip, lineId?: string): SetupLine | undefined {
  return lineId ? trip.gearUsed.find(line => line.id === lineId) : undefined;
}

/** Inherits a trolling setup's fields while retaining values recorded directly on the catch. */
export function resolveCatch(trip: Trip, catchItem: Catch, lost = false): ResolvedCatch {
  const line = resolveSetupLine(trip, catchItem.setupLineId);
  if (!line) return { ...catchItem, trip, lost };
  const record = catchItem as UnknownRecord, setup = line as UnknownRecord;
  const cheater = record.setupLineTarget === "cheater";
  const inherited = (key: string): unknown => record[key] || setup[key] || "";
  return {
    ...line, ...catchItem, trip, setupLine: line, lost,
    comboId: inherited("comboId"), rodId: inherited("rodId"), reelId: inherited("reelId"), side: inherited("side"), lineLabel: inherited("lineLabel"), direction: inherited("direction"),
    lureId: cheater ? inherited("cheaterLureId") || inherited("lureId") : inherited("lureId"),
    flasherId: cheater ? "" : inherited("flasherId"), presentation: inherited("presentation"),
    gpsSpeed: inherited("gpsSpeed") || inherited("speed"), ballSpeed: inherited("ballSpeed"), ballDepth: inherited("ballDepth"),
    lineBehindBoard: inherited("lineBehindBoard"), estimatedLureDepth: inherited("estimatedLureDepth"), dipseySetting: inherited("dipseySetting"), lineOut: inherited("lineOut"), estimatedDepth: inherited("estimatedDepth"),
    deepestRigger: Boolean(record.deepestRigger),
  } as unknown as ResolvedCatch;
}

export function gearName(logbook: Logbook, type: "lure" | "flasher" | "rod" | "reel" | "combo", id?: string): string {
  if (!id) return "";
  const source = type === "lure" ? logbook.lures : type === "flasher" ? logbook.flashers : type === "rod" ? logbook.rods : type === "reel" ? logbook.reels : logbook.rodReelCombos;
  const item = source.find(value => String(value.id || "") === id);
  if (!item) return "";
  if (type === "combo") return String(item.shortName || "") || [gearName(logbook, "rod", String(item.rodId || "")), gearName(logbook, "reel", String(item.reelId || ""))].filter(Boolean).join(" + ");
  return [item.brand, item.name].map(value => String(value || "").trim()).filter(Boolean).join(" ") || String(item.shortName || "");
}
