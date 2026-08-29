const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  number: (value) => Number(value) || 0,
  fishCount: () => 1,
  trimNumber: (value) => String(Math.round(Number(value) * 100) / 100),
  formatPercent: (value, total) => total ? `${Math.round((value / total) * 100)}%` : "0%",
  unitSymbol: () => "ft",
  setupLineMinutes: () => 60
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/stats-scope.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/stats-performance.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/stats.js", "utf8"), context);

assert.equal(context.saneStatsNumber("", { min: 0 }), null);
assert.equal(context.saneStatsNumber("33 mph", { min: 0.1, max: 15 }), null);
assert.equal(context.saneStatsNumber("2.4 mph", { min: 0.1, max: 15 }), 2.4);

const deltaRows = context.summarizeSpeedDelta([
  { gpsSpeed: "2.4", ballSpeed: "2.0", trip: { id: "a" } },
  { gpsSpeed: "2.2", ballSpeed: "2.3", trip: { id: "b" } },
  { gpsSpeed: "2.0", ballSpeed: "2.5", trip: { id: "c" } },
  { gpsSpeed: "2.0", ballSpeed: "33", trip: { id: "bad" } }
]);
assert.deepEqual(deltaRows.map((row) => row[0]), ["Ball slower", "Matched", "Ball faster"]);

const thermocline = context.tripThermoclineDepth({
  probeTemperatureProfile: [
    { depthFeet: 0, temperature: 68 },
    { depthFeet: 20, temperature: 66 },
    { depthFeet: 40, temperature: 54 },
    { depthFeet: 60, temperature: 52 }
  ]
});
assert.equal(thermocline, 30);

console.log("new stats field tests passed");
