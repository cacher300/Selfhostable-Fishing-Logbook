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
  isUsableCoordinates: () => false
};

context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-config.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const normalized = context.normalizeState({
  schemaVersion: 1,
  trips: [{
    id: "trip",
    catches: [{ ballSpeed: 0, ballTemp: 0 }],
    lostFish: [{ ballSpeed: 0, ballTemp: 0 }],
    gearUsed: [],
    people: [],
    notePhotos: []
  }]
});

assert.strictEqual(normalized.trips[0].catches[0].ballSpeed, 0);
assert.strictEqual(normalized.trips[0].catches[0].ballTemp, 0);
assert.strictEqual(normalized.trips[0].lostFish[0].ballSpeed, 0);
assert.strictEqual(normalized.trips[0].lostFish[0].ballTemp, 0);

console.log("numeric zero measurements are preserved during normalization");
