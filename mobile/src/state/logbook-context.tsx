import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { id, normalizeTrip, totals } from "../domain/logbook";
import { defaultLogbook } from "../domain/defaults";
import type { Catch, Coordinates, LiveEvent, LiveEventKind, Logbook, LostFish, MediaRef, SetupLine, Trip } from "../domain/types";
import { loadLogbook, saveLogbook } from "../storage/repository";
import { hydrateWebMediaUris } from "../storage/web-media";

type FishDraft = Partial<Catch & LostFish> & { lost?: boolean };
type Context = {
  logbook: Logbook; ready: boolean; activeTrip?: Trip; totals: ReturnType<typeof totals>;
  createTrip: (trip?: Partial<Trip>) => Promise<Trip | undefined>;
  updateTrip: (tripId: string, updater: (trip: Trip) => Trip) => Promise<void>;
  recordCatch: (draft?: FishDraft) => Promise<string | undefined>;
  addSetup: (draft?: Partial<SetupLine>) => Promise<string | undefined>;
  changeSetup: (lineId: string, patch?: Partial<SetupLine>) => Promise<string | undefined>;
  addLiveEvent: (kind: LiveEventKind, title: string, detail?: string, coordinates?: Coordinates | null, relatedId?: string) => Promise<void>;
  endTrip: () => Promise<void>; attachTripMedia: (media: MediaRef) => Promise<void>; setTripCoordinates: (coordinates: Coordinates) => Promise<void>; update: (next: Logbook) => Promise<void>;
};

const LogbookContext = createContext<Context | null>(null);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const event = (kind: LiveEventKind, title: string, detail?: string, coordinates?: Coordinates | null, relatedId?: string): LiveEvent => ({ id: id(), kind, time: nowTime(), title, detail, coordinates, relatedId });

export function LogbookProvider({ children }: { children: React.ReactNode }) {
  const [logbook, setLogbook] = useState(defaultLogbook), [ready, setReady] = useState(false);
  useEffect(() => { loadLogbook().then(hydrateWebMediaUris).then(setLogbook).finally(() => setReady(true)); }, []);
  const update = useCallback(async (next: Logbook) => { const saved = await saveLogbook(next); setLogbook(saved); }, []);
  const activeTrip = useMemo(() => logbook.trips.find(trip => !trip.endTime && trip.liveStatus !== "completed"), [logbook]);
  const updateTrip = useCallback(async (tripId: string, updater: (trip: Trip) => Trip) => { await update({ ...logbook, trips: logbook.trips.map(trip => trip.id === tripId ? normalizeTrip(updater(trip)) : trip) }); }, [logbook, update]);

  const createTrip = useCallback(async (draft: Partial<Trip> = {}) => {
    if (activeTrip) return activeTrip;
    const now = new Date(), time = nowTime();
    const trip = normalizeTrip({ id: id(), title: `${now.toISOString().slice(0, 10)} Live Trip`, date: now.toISOString().slice(0, 10), method: "Trolling", linesSetTime: time, startTime: time, catches: [], lostFish: [], gearUsed: [], people: [], notePhotos: [], liveStatus: "active", liveEvents: [event("trip-started", "Trip started", [draft.location, draft.method].filter(Boolean).join(" · "))], ...draft } as Trip);
    await update({ ...logbook, trips: [...logbook.trips, trip] }); return trip;
  }, [activeTrip, logbook, update]);

  const recordCatch = useCallback(async (draft: FishDraft = {}) => {
    if (!activeTrip) return undefined;
    const lost = Boolean(draft.lost), setup = activeTrip.gearUsed.find(line => line.id === draft.setupLineId) || activeTrip.gearUsed.find(line => !line.endTime), entryId = id();
    const fish = { id: entryId, time: nowTime(), photos: [], setupLineId: setup?.id, setupLineTarget: setup?.lineLabel, presentation: setup?.presentation, rodId: setup?.rodId, lureId: setup?.lureId, flasherId: setup?.flasherId, ...draft } as Catch;
    delete (fish as FishDraft).lost;
    await updateTrip(activeTrip.id, trip => ({ ...trip, catches: lost ? trip.catches : [...trip.catches, fish], lostFish: lost ? [...trip.lostFish, { ...fish, possibleSpecies: draft.possibleSpecies || draft.species || trip.targetSpecies, released: false } as LostFish] : trip.lostFish, liveEvents: [...(trip.liveEvents || []), event(lost ? "lost" : "catch", lost ? "Fish lost" : `${draft.species || trip.targetSpecies || "Fish"} landed`, setup?.lineLabel || "No setup selected", draft.coordinates, entryId)] }));
    return entryId;
  }, [activeTrip, updateTrip]);

  const addSetup = useCallback(async (draft: Partial<SetupLine> = {}) => {
    if (!activeTrip) return undefined;
    const lineId = id(), line: SetupLine = { id: lineId, startTime: nowTime(), side: ["port", "center", "starboard"][activeTrip.gearUsed.filter(item => !item.endTime).length % 3], lineLabel: `Rod ${activeTrip.gearUsed.length + 1}`, presentation: "downrigger", ...draft };
    await updateTrip(activeTrip.id, trip => ({ ...trip, gearUsed: [...trip.gearUsed, line], liveEvents: [...(trip.liveEvents || []), event("setup-added", `${line.lineLabel} added`, [line.side, line.presentation].filter(Boolean).join(" · "), undefined, line.id)] })); return lineId;
  }, [activeTrip, updateTrip]);

  const changeSetup = useCallback(async (lineId: string, patch: Partial<SetupLine> = {}) => {
    if (!activeTrip) return undefined; const previous = activeTrip.gearUsed.find(line => line.id === lineId); if (!previous) return undefined;
    const time = nowTime(), nextId = id(), next = { ...previous, ...patch, id: nextId, startTime: time, endTime: "", changeNote: patch.changeNote || "Setup changed live" };
    await updateTrip(activeTrip.id, trip => ({ ...trip, gearUsed: [...trip.gearUsed.map(line => line.id === lineId ? { ...line, endTime: time } : line), next], liveEvents: [...(trip.liveEvents || []), event("setup-changed", `${next.lineLabel || "Setup"} changed`, next.changeNote, undefined, nextId)] })); return nextId;
  }, [activeTrip, updateTrip]);

  const addLiveEvent = useCallback(async (kind: LiveEventKind, title: string, detail?: string, coordinates?: Coordinates | null, relatedId?: string) => { if (activeTrip) await updateTrip(activeTrip.id, trip => ({ ...trip, liveEvents: [...(trip.liveEvents || []), event(kind, title, detail, coordinates, relatedId)] })); }, [activeTrip, updateTrip]);
  const endTrip = useCallback(async () => { if (!activeTrip) return; const time = nowTime(); await updateTrip(activeTrip.id, trip => ({ ...trip, endTime: time, linesPulledTime: time, liveStatus: "completed", gearUsed: trip.gearUsed.map(line => line.endTime ? line : { ...line, endTime: time }), liveEvents: [...(trip.liveEvents || []), event("trip-ended", "Trip ended", `${trip.catches.length} landed · ${trip.lostFish.length} lost`)] })); }, [activeTrip, updateTrip]);
  const attachTripMedia = useCallback(async (media: MediaRef) => { if (activeTrip) await updateTrip(activeTrip.id, trip => ({ ...trip, notePhotos: [...(trip.notePhotos || []), media], liveEvents: [...(trip.liveEvents || []), event("photo", "Photo added", media.caption || media.filename, media.coordinates, media.id)] })); }, [activeTrip, updateTrip]);
  const setTripCoordinates = useCallback(async (coordinates: Coordinates) => { if (activeTrip) await updateTrip(activeTrip.id, trip => ({ ...trip, coordinates, liveEvents: [...(trip.liveEvents || []), event("location-changed", "Location updated", `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`, coordinates)] })); }, [activeTrip, updateTrip]);
  const value = useMemo(() => ({ logbook, ready, activeTrip, totals: totals(logbook), createTrip, updateTrip, recordCatch, addSetup, changeSetup, addLiveEvent, endTrip, attachTripMedia, setTripCoordinates, update }), [logbook, ready, activeTrip, createTrip, updateTrip, recordCatch, addSetup, changeSetup, addLiveEvent, endTrip, attachTripMedia, setTripCoordinates, update]);
  return <LogbookContext.Provider value={value}>{children}</LogbookContext.Provider>;
}
export function useLogbook() { const context = useContext(LogbookContext); if (!context) throw new Error("LogbookProvider is required"); return context; }
