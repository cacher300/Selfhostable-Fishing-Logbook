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
vm.runInContext(fs.readFileSync("static/js/settings-locations.js", "utf8"), context);

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

const assigned = [
  context.normalizeCatchSpotAssignment({ id: "auto", coordinates: center }, [west, east]),
  context.normalizeCatchSpotAssignment({ id: "manual", coordinates: center, spotAssignmentMode: "manual", spotId: "z-west" }, [west, east]),
  context.normalizeCatchSpotAssignment({ id: "none", coordinates: center, spotAssignmentMode: "manual", spotId: "" }, [west, east])
];
assert.equal(assigned[0].spotId, "a-east");
assert.equal(assigned[1].spotId, "z-west");
assert.equal(assigned[2].spotId, "");

const afterDelete = context.normalizeCatchSpotAssignment(assigned[1], [east]);
assert.equal(afterDelete.spotId, "");
assert.equal(afterDelete.spotAssignmentMode, "manual");

assert.doesNotThrow(() => context.validateFishingSpots([east]));
assert.throws(() => context.validateFishingSpots([east, { ...west, id: "duplicate-name", name: "east" }]), /names must be unique/);
assert.throws(() => context.validateFishingSpots([{ id: "bad-radius", name: "Bad", coordinates: center, radiusMeters: 10 }]), /between 25 and 500/);
assert.throws(() => context.validateFishingSpots([east, { ...east, name: "East duplicate" }]), /unique IDs/);
assert.doesNotThrow(() => context.validatePrivatePhotoLocations([{
  id: "home", name: "Home", coordinates: center, radiusMeters: 10000, mobileMetadata: "preserved"
}]));
assert.throws(() => context.validatePrivatePhotoLocations([{
  id: "home", name: "Home", coordinates: center, radiusMeters: 10001
}]), /between 25 and 10000/);

console.log("spot assignment tests passed");
