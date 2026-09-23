const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const field = (value = "") => ({ value, checked: false, selectedOptions: [{ dataset: { rodId: "" } }] });
const gearRow = { dataset: { gearId: "line-1" }, querySelector: selector => field(selector === ".trip-gear-start-time" ? "08:00" : "") };
const fishRow = {
  dataset: { catchId: "fish-1" },
  catchDepthData: { depth_m: 18.2, depth_ft: 59.7, lake_name: "Ontario", depth_source: "bathymetry" },
  catchWeatherData: { wind: "NE" },
  querySelector: selector => field(selector === ".catch-species" ? "Salmon" : "")
};
const existing = {
  id: "trip-1", structureType: "", coordinates: { latitude: 43.2, longitude: -79.5 },
  liveStatus: "completed", liveEvents: [{ id: "event-1", kind: "trip-ended", time: "12:00", title: "Trip ended" }],
  pausedAt: "2026-09-13T11:00:00.000Z", gearUsed: [{ id: "line-1", personId: "angler-1" }],
  catches: [{ id: "fish-1", flasherId: "", depth_m: 18.2, heroPhotoId: "photo-1", quantity: 3, cheaterDepth: "22" }], lostFish: []
};
const context = {
  console, state: { trips: [existing], locations: [] }, activeTripWeatherData: null,
  els: {
    tripGearRows: { querySelectorAll: () => [gearRow] },
    catchRows: { querySelectorAll: () => [fishRow] },
    lostFishRows: { querySelectorAll: () => [] }, tripRating: { value: "" }
  },
  getValue: key => key === "tripId" ? "trip-1" : "",
  isTrollingTrip: () => false, isCastingTrip: () => false, isFlyFishingTrip: () => false,
  collectPeople: () => [], selectedComboForRow: () => null,
  isSoftPlasticLureRow: () => false, setupMinutesFromRow: () => 0,
  isUsableCoordinates: () => false, catchMetadataLocksPayload: () => ({}),
  lockedPhotoCoordinatesFromRow: () => null, manualCoordinatesFromRow: () => null,
  fishCoordinatesFromRow: () => null, catchPhotoLocationById: () => ({ id: "photo-1" }),
  selectedCatchHeroPhoto: () => ({ id: "photo-1" }),
  collectCatchPhotos: () => [{ id: "photo-1", captureDate: "2026-09-13", category: "catch-photos", filename: "one.jpg" }],
  hasCatchDepthData: data => Object.values(data).some(value => value !== null && value !== ""),
  findLaunchByIdOrName: () => null, chopLabelForWaveHeight: () => "",
  idleHoursFromForm: () => 0, calculateHours: () => 0,
  getTripIntent: () => "", tripRatingValue: () => "", collectProbeTemperatureProfile: () => [],
  weatherWindText: () => "", collectNotePhotos: () => []
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/trip-save.js", "utf8"), context);
const updated = context.collectTripFromForm();
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
console.log("trip editor metadata preservation tests passed");
