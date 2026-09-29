import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { speciesColor } = await import("../static/js/app-defaults.js");
const {
  catchSizePopupValue,
  filteredMapRecordsByDetails,
  mapRecordAngler,
  mapRecordLake,
  mapRecordsInViewport,
  mapRecordTrollingDirection,
  shouldShowMapDirectionArrow,
  visibleMapSpots,
} = await import("../static/js/maps.js");

setState({
  people: [{ id: "angler-1", name: "Alex" }],
  settings: {},
  spots: [],
});
const records = [
  {
    type: "catch",
    trip: { method: "Trolling", location: "Lake Ontario", people: [] },
    catchItem: { lake_name: "Ontario", direction: "NE", personId: "angler-1", released: true },
  },
  {
    type: "catch",
    trip: { method: "Casting", location: "Lake Erie", people: [] },
    catchItem: { lake_name: "Erie", direction: "N", personId: "", released: false },
  },
  {
    type: "trip-photo",
    trip: { method: "Trolling", location: "Lake Ontario" },
    media: {},
  },
];
const viewportRecords = [
  { type: "catch", coordinates: { latitude: 43.6, longitude: -79.2 }, trip: {}, catchItem: { species: "Largemouth Bass" } },
  { type: "catch", coordinates: { latitude: 44.8, longitude: -78.1 }, trip: {}, catchItem: { species: "Perch" } },
];
const viewportMap = {
  _loaded: true,
  getBounds: () => ({ contains: ([latitude, longitude]) => latitude >= 43 && latitude <= 44 && longitude >= -80 && longitude <= -79 }),
};

assert.deepEqual(
  structuredClone(mapRecordTrollingDirection(records[0])),
  { label: "NE", degrees: 45 },
);
assert.equal(mapRecordTrollingDirection(records[1]), null);
assert.equal(mapRecordLake(records[0]), "Lake Ontario");
assert.equal(mapRecordLake(records[1]), "Lake Erie");
assert.equal(mapRecordAngler(records[0]), "Alex");
assert.equal(speciesColor("Largemouth Bass"), "#8dbb55");
setState({
  people: [{ id: "angler-1", name: "Alex" }],
  settings: { speciesMapColors: { "Largemouth Bass": "#123456" } },
  spots: [{ id: "spot-1", name: "Point", coordinates: { latitude: 43.6, longitude: -79.1 }, radiusMeters: 100 }],
});
assert.equal(speciesColor("Largemouth Bass"), "#123456");
assert.equal(visibleMapSpots().length, 1);
assert.equal(shouldShowMapDirectionArrow(records[0]), true);
assert.equal(shouldShowMapDirectionArrow(records[0], { showDirectionArrows: false }), false);
assert.equal(shouldShowMapDirectionArrow(records[1]), false);
assert.equal(filteredMapRecordsByDetails(records, { lake: "Lake Ontario", method: "All methods", direction: "All directions", angler: "All anglers" }).length, 2);
assert.equal(filteredMapRecordsByDetails(records, { lake: "All lakes", method: "Trolling", direction: "NE", angler: "Alex", disposition: "Kept" }).length, 1);
assert.equal(filteredMapRecordsByDetails(records, { lake: "All lakes", method: "All methods", direction: "All directions", angler: "All anglers", disposition: "Released" }).length, 3);
assert.equal(mapRecordsInViewport(viewportMap, viewportRecords).map((record) => record.catchItem.species).join(","), "Largemouth Bass");
assert.equal(catchSizePopupValue({ length: "20", weight: "4" }), "4 lb · 20 in");
assert.equal(catchSizePopupValue({ length: "20" }), "20 in");
assert.equal(catchSizePopupValue({}), "");
