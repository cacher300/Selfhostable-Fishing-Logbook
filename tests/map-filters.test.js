const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: { randomUUID: () => "generated-id" },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { protocol: "file:" },
  window: {},
  document: { querySelector: () => null },
  isVideoMedia: () => false,
  isUsableCoordinates: () => true
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-config.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/maps.js", "utf8"), context);

vm.runInContext(`state.people = [{ id: "angler-1", name: "Alex" }]`, context);
const records = [
  {
    type: "catch",
    trip: { method: "Trolling", location: "Lake Ontario", people: [] },
    catchItem: { lake_name: "Ontario", direction: "NE", personId: "angler-1", released: true }
  },
  {
    type: "catch",
    trip: { method: "Casting", location: "Lake Erie", people: [] },
    catchItem: { lake_name: "Erie", direction: "N", personId: "", released: false }
  },
  {
    type: "trip-photo",
    trip: { method: "Trolling", location: "Lake Ontario" },
    media: {}
  }
];
context.testRecords = records;

assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext(`mapRecordTrollingDirection(testRecords[0])`, context))),
  { label: "NE", degrees: 45 }
);
assert.equal(vm.runInContext(`mapRecordTrollingDirection(testRecords[1])`, context), null);
assert.equal(vm.runInContext(`mapRecordLake(testRecords[0])`, context), "Lake Ontario");
assert.equal(vm.runInContext(`mapRecordLake(testRecords[1])`, context), "Lake Erie");
assert.equal(vm.runInContext(`mapRecordAngler(testRecords[0])`, context), "Alex");
assert.equal(vm.runInContext(`shouldShowMapDirectionArrow(testRecords[0])`, context), true);
assert.equal(vm.runInContext(`shouldShowMapDirectionArrow(testRecords[0], { showDirectionArrows: false })`, context), false);
assert.equal(vm.runInContext(`shouldShowMapDirectionArrow(testRecords[1])`, context), false);
assert.equal(vm.runInContext(`filteredMapRecordsByDetails(testRecords, { lake: "Lake Ontario", method: "All methods", direction: "All directions", angler: "All anglers" }).length`, context), 2);
assert.equal(vm.runInContext(`filteredMapRecordsByDetails(testRecords, { lake: "All lakes", method: "Trolling", direction: "NE", angler: "Alex", disposition: "Kept" }).length`, context), 1);
assert.equal(vm.runInContext(`filteredMapRecordsByDetails(testRecords, { lake: "All lakes", method: "All methods", direction: "All directions", angler: "All anglers", disposition: "Released" }).length`, context), 3);

console.log("map filter tests passed");
