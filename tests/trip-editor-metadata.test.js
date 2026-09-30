import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { tripFromDraft } = await import("../static/js/trip-draft.js");

const existing = {
  id: "trip-1",
  structureType: "",
  coordinates: { latitude: 43.2, longitude: -79.5 },
  liveStatus: "completed",
  liveEvents: [{ id: "event-1", kind: "trip-ended", time: "12:00", title: "Trip ended" }],
  pausedAt: "2026-09-13T11:00:00.000Z",
  gearUsed: [{ id: "line-1", personId: "angler-1", startTime: "08:00" }],
  catches: [{
    id: "fish-1",
    flasherId: "",
    depth_m: 18.2,
    depth_ft: 59.7,
    lake_name: "Ontario",
    depth_source: "bathymetry",
    heroPhotoId: "photo-1",
    quantity: 3,
    cheaterDepth: "22",
    species: "Salmon",
    photos: [{ id: "photo-1", captureDate: "2026-09-13", category: "catch-photos", filename: "one.jpg" }]
  }],
  lostFish: []
};

const updated = tripFromDraft(existing, { state: { trips: [existing], locations: [], people: [], rodReelCombos: [], lures: [] } });
assert.equal(updated.gearUsed[0].personId, "angler-1");
assert.equal(updated.structureType, "");
assert.deepEqual(updated.coordinates, { latitude: 43.2, longitude: -79.5 });
assert.equal(updated.liveStatus, "completed");
assert.deepEqual(updated.liveEvents, [{ id: "event-1", kind: "trip-ended", time: "12:00", title: "Trip ended" }]);
assert.equal(updated.pausedAt, "2026-09-13T11:00:00.000Z");
assert.equal(updated.catches[0].flasherId, "");
assert.equal(updated.catches[0].quantity, 3);
assert.equal(updated.catches[0].cheaterDepth, "22");
assert.equal(updated.catches[0].depth_m, 18.2);
assert.equal(updated.catches[0].depth_ft, 59.7);
assert.equal(updated.catches[0].lake_name, "Ontario");
assert.equal(updated.catches[0].depth_source, "bathymetry");
assert.equal(updated.catches[0].heroPhotoId, "photo-1");
assert.equal(updated.catches[0].photos[0].captureDate, "2026-09-13");
