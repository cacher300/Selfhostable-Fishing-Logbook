import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { automaticSpotId, coordinateDistanceMeters } = await import("../static/js/app-normalization.js");
const { validateFishingSpots, validatePrivatePhotoLocations } = await import("../static/js/settings-locations.js");

const center = { latitude: 43, longitude: -79 };
const north = { latitude: 43.001, longitude: -79 };
const boundaryRadius = coordinateDistanceMeters(center, north);
const boundarySpot = { id: "boundary", name: "Boundary", coordinates: center, radiusMeters: boundaryRadius };
assert.equal(automaticSpotId({ coordinates: north }, [boundarySpot]), "boundary");
assert.equal(automaticSpotId({ coordinates: { latitude: 44, longitude: -79 } }, [boundarySpot]), "");
assert.equal(automaticSpotId({}, [boundarySpot]), "");

const west = { id: "z-west", name: "West", coordinates: { latitude: 43, longitude: -79.001 }, radiusMeters: 500 };
const east = { id: "a-east", name: "East", coordinates: { latitude: 43, longitude: -78.999 }, radiusMeters: 500 };
assert.equal(automaticSpotId({ coordinates: center }, [west, east]), "a-east");
assert.equal(
  automaticSpotId({ manualCoordinates: west.coordinates, coordinates: east.coordinates }, [west, east]),
  "z-west",
);

assert.doesNotThrow(() => validateFishingSpots([east]));
assert.throws(() => validateFishingSpots([east, { ...west, id: "duplicate-name", name: "east" }]), /names must be unique/);
assert.throws(() => validateFishingSpots([{ id: "bad-radius", name: "Bad", coordinates: center, radiusMeters: 10 }]), /between 25 and 500/);
assert.throws(() => validateFishingSpots([east, { ...east, name: "East duplicate" }]), /unique IDs/);
assert.doesNotThrow(() => validatePrivatePhotoLocations([{
  id: "home", name: "Home", coordinates: center, radiusMeters: 10000, mobileMetadata: "preserved",
}]));
assert.throws(() => validatePrivatePhotoLocations([{
  id: "home", name: "Home", coordinates: center, radiusMeters: 10001,
}]), /between 25 and 10000/);
