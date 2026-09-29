import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { diffLogbook } = await import("../static/js/logbook-sync.js");

const collectionKeys = new Set(["trips", "species"]);
const objectCollectionKeys = new Set(["trips"]);
const options = { collectionKeys, objectCollectionKeys };

const base = {
  trips: [{ id: "one", title: "One" }, { id: "two", title: "Two" }],
  species: ["Walleye", "Salmon"],
  settings: { units: { depth: "ft" } },
};

assert.deepEqual(diffLogbook(base, {
  ...base,
  trips: [...base.trips, { id: "three", title: "Three" }],
}, options), {
  fullSave: false,
  changes: [{ op: "upsert", collection: "trips", record: { id: "three", title: "Three" }, index: 2 }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  trips: [{ id: "one", title: "Updated" }, base.trips[1]],
}, options), {
  fullSave: false,
  changes: [{ op: "upsert", collection: "trips", record: { id: "one", title: "Updated" } }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  trips: [base.trips[1]],
}, options), {
  fullSave: false,
  changes: [{ op: "delete", collection: "trips", id: "one" }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  trips: [base.trips[1], base.trips[0]],
}, options), {
  fullSave: false,
  changes: [{ op: "replace", collection: "trips", items: [base.trips[1], base.trips[0]] }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  species: ["Salmon", "Walleye"],
}, options), {
  fullSave: false,
  changes: [{ op: "replace", collection: "species", items: ["Salmon", "Walleye"] }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  settings: { units: { depth: "m" } },
}, options), {
  fullSave: false,
  changes: [{ op: "settings", value: { units: { depth: "m" } } }],
});

assert.deepEqual(diffLogbook(base, {
  ...base,
  unexpected: true,
}, options), { fullSave: true, changes: [] });

const many = {
  ...base,
  trips: Array.from({ length: 202 }, (_, index) => ({ id: `trip-${index}`, title: String(index) })),
};
assert.deepEqual(diffLogbook({ ...base, trips: [] }, many, options), { fullSave: true, changes: [] });
