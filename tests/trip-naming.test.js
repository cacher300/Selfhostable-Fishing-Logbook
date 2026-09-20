const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: require("crypto").webcrypto,
  mergePeople: (...lists) => lists.flat()
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const normalized = vm.runInContext(`normalizeState({
  ...structuredClone(defaults),
  trips: [
    { id: "one", title: "", date: "2026-09-01", targetSpecies: "Salmon", method: "Trolling" },
    { id: "two", title: "Custom title", date: "2026-09-02", targetSpecies: "Salmon", method: "Trolling" },
    { id: "three", title: "", date: "2026-09-03", targetSpecies: "Salmon", method: "Trolling" },
    { id: "four", title: "", date: "2026-09-04", targetSpecies: "Salmon", method: "Casting" }
  ]
})`, context);

assert.deepEqual(
  normalized.trips.map((trip) => trip.title),
  ["Salmon Trolling Trip #1", "Custom title", "Salmon Trolling Trip #3", "Salmon Casting Trip #1"]
);
assert.equal(context.generatedTripTitle({ id: "two", targetSpecies: "Walleye", method: "Trolling" }, normalized.trips), "Walleye Trolling Trip #1");

console.log("trip naming tests passed");
