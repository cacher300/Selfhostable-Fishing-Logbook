import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body>
  ${[
    "tripId", "tripTitle", "tripDate", "tripExpedition", "tripLocation", "tripLaunch",
    "launchTime", "linesPulledTime", "targetSpecies", "method", "waterTemp", "waterClarity",
    "flyHatch", "waterLevel", "weather", "waveHeight", "structure", "tripNotes", "tripIdleTime",
  ].map((id) => `<input id="${id}">`).join("")}
</body></html>`);

const { els } = await import("../static/js/app-elements.js");
const { setState } = await import("../static/js/app-state.js");
const { collectTripFromForm } = await import("../static/js/trip-save.js");

const field = (value = "") => ({
  value,
  checked: false,
  selectedOptions: [{ dataset: { rodId: "" }, textContent: "" }],
  dataset: {},
});
function fieldMap(values = {}) {
  const fields = new Map();
  return (selector) => {
    if (!fields.has(selector)) fields.set(selector, field(values[selector] || ""));
    return fields.get(selector);
  };
}

const gearRow = {
  dataset: { gearId: "line-1" },
  querySelector: fieldMap({ ".trip-gear-start-time": "08:00" }),
};
const fishRow = {
  dataset: { catchId: "fish-1", heroPhotoId: "photo-1" },
  catchPhotos: [{ id: "photo-1", captureDate: "2026-09-13", category: "catch-photos", filename: "one.jpg" }],
  catchDepthData: { depth_m: 18.2, depth_ft: 59.7, lake_name: "Ontario", depth_source: "bathymetry" },
  catchWeatherData: { wind: "NE" },
  querySelector: fieldMap({
    ".catch-species": "Salmon",
    ".catch-person": "",
    ".catch-length": "",
    ".catch-weight": "",
    ".catch-structure": "",
    ".catch-time": "",
    ".catch-water-depth": "",
    ".catch-depth-down": "",
    ".catch-rod": "",
    ".catch-lure": "",
    ".catch-notes": "",
  }),
};

const existing = {
  id: "trip-1",
  structureType: "",
  coordinates: { latitude: 43.2, longitude: -79.5 },
  liveStatus: "completed",
  liveEvents: [{ id: "event-1", kind: "trip-ended", time: "12:00", title: "Trip ended" }],
  pausedAt: "2026-09-13T11:00:00.000Z",
  gearUsed: [{ id: "line-1", personId: "angler-1" }],
  catches: [{ id: "fish-1", flasherId: "", depth_m: 18.2, heroPhotoId: "photo-1", quantity: 3, cheaterDepth: "22" }],
  lostFish: [],
};
setState({ trips: [existing], locations: [], people: [], rodReelCombos: [], lures: [] });

document.querySelector("#tripId").value = "trip-1";
els.tripGearRows = { querySelectorAll: () => [gearRow] };
els.catchRows = { querySelectorAll: () => [fishRow] };
els.lostFishRows = { querySelectorAll: () => [] };
els.personRows = { querySelectorAll: () => [] };
els.notePhotoGrid = { querySelectorAll: () => [] };
els.tripRating = { value: "" };

const updated = collectTripFromForm();
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
