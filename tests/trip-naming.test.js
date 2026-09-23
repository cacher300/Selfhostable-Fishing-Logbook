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

const trips = [
  { id: "one", title: "Salmon Trolling Trip #1", date: "2026-09-01", targetSpecies: "Salmon", method: "Trolling" },
  { id: "two", title: "Custom title", date: "2026-09-02", targetSpecies: "Salmon", method: "Trolling" },
  { id: "three", title: "Salmon Trolling Trip #3", date: "2026-09-03", targetSpecies: "Salmon", method: "Trolling" }
];
assert.equal(context.generatedTripTitle({ targetSpecies: "Salmon", method: "Trolling" }, trips), "Salmon Trolling Trip #4");
assert.equal(context.generatedTripTitle({ id: "two", targetSpecies: "Walleye", method: "Trolling" }, trips), "Walleye Trolling Trip #1");
assert.equal(trips[1].title, "Custom title");

console.log("trip naming tests passed");
