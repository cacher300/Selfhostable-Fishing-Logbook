const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: { randomUUID: () => "generated-id" },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { protocol: "file:" },
  mergePeople: (people = []) => people,
  isUsableCoordinates: (coordinates) => {
    const latitude = Number(coordinates?.latitude);
    const longitude = Number(coordinates?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      && (latitude !== 0 || longitude !== 0);
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-config.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), context);

const center = { latitude: 43, longitude: -79 };
const north = { latitude: 43.001, longitude: -79 };
const boundaryRadius = vm.runInContext(
  `coordinateDistanceMeters(${JSON.stringify(center)}, ${JSON.stringify(north)})`,
  context
);
const boundarySpot = { id: "boundary", name: "Boundary", coordinates: center, radiusMeters: boundaryRadius };
assert.equal(context.automaticSpotId({ coordinates: north }, [boundarySpot]), "boundary");
assert.equal(context.automaticSpotId({ coordinates: { latitude: 44, longitude: -79 } }, [boundarySpot]), "");
assert.equal(context.automaticSpotId({}, [boundarySpot]), "");

const west = { id: "z-west", name: "West", coordinates: { latitude: 43, longitude: -79.001 }, radiusMeters: 500 };
const east = { id: "a-east", name: "East", coordinates: { latitude: 43, longitude: -78.999 }, radiusMeters: 500 };
assert.equal(context.automaticSpotId({ coordinates: center }, [west, east]), "a-east");
assert.equal(
  context.automaticSpotId({ manualCoordinates: west.coordinates, coordinates: east.coordinates }, [west, east]),
  "z-west"
);

const normalized = context.normalizeState({
  schemaVersion: 1,
  lures: [],
  flashers: [],
  spots: [west, east],
  trips: [{
    id: "trip",
    catches: [
      { id: "auto", coordinates: center },
      { id: "manual", coordinates: center, spotAssignmentMode: "manual", spotId: "z-west" },
      { id: "none", coordinates: center, spotAssignmentMode: "manual", spotId: "" }
    ],
    lostFish: [],
    gearUsed: [],
    people: [],
    notePhotos: []
  }]
});
assert.equal(normalized.trips[0].catches[0].spotId, "a-east");
assert.equal(normalized.trips[0].catches[1].spotId, "z-west");
assert.equal(normalized.trips[0].catches[2].spotId, "");

const afterDelete = context.normalizeState({ ...normalized, spots: [east] });
assert.equal(afterDelete.trips[0].catches[0].spotId, "a-east");
assert.equal(afterDelete.trips[0].catches[1].spotId, "");
assert.equal(afterDelete.trips[0].catches[1].spotAssignmentMode, "manual");

const malformed = context.normalizeSpots([
  east,
  { ...west, id: "duplicate-name", name: "east" },
  { id: "bad-radius", name: "Bad", coordinates: center, radiusMeters: 10 }
]);
assert.deepEqual(JSON.parse(JSON.stringify(malformed)), [east]);

console.log("spot assignment tests passed");
