const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: { randomUUID: () => "test-id" },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { protocol: "file:" }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-config.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);

const previousUnits = {
  depth: "ft", speed: "mph", windSpeed: "mph", waterTemperature: "F",
  waveHeight: "ft", fishLength: "in", fishWeight: "lb"
};
const nextUnits = {
  ...previousUnits,
  depth: "m", speed: "kph", windSpeed: "kph", waterTemperature: "C",
  waveHeight: "m", fishLength: "cm", fishWeight: "kg"
};

vm.runInContext(`state = {
  settings: { units: ${JSON.stringify(nextUnits)} },
  reels: [{ maxDrag: "20", lineHistory: [{ weight: "30" }] }],
  trips: [{
    waterTemp: "50",
    waveHeight: "6 ft",
    structure: "40-60 FOW",
    wind: "W 10 mph, gust 15 mph",
    catches: [{
      length: "24", weight: "5 lb", waterDepth: "50", depthDown: "20",
      fowCaught: "40 FOW", speed: "2", ballDepth: "15", lineBehindBoard: "60",
      estimatedLureDepth: "18", lineOut: "75", estimatedDepth: "22"
    }],
    lostFish: [],
    gearUsed: []
  }]
};`, context);

context.convertStoredMeasurements(previousUnits, nextUnits);
const state = vm.runInContext("state", context);
const trip = state.trips[0];
const catchItem = trip.catches[0];

assert.equal(trip.waterTemp, "10");
assert.equal(trip.waveHeight, "1.829 m");
assert.equal(trip.structure, "12.192-18.288 FOW");
assert.equal(trip.wind, "W 16.093 kph, gust 24.14 kph");
assert.equal(catchItem.length, "60.96");
assert.equal(catchItem.weight, "2.268 kg");
assert.equal(catchItem.waterDepth, "15.24");
assert.equal(catchItem.fowCaught, "12.192 FOW");
assert.equal(catchItem.speed, "3.219");
assert.equal(catchItem.lineOut, "22.86");
assert.equal(state.reels[0].maxDrag, "9.072");
assert.equal(state.reels[0].lineHistory[0].weight, "13.608");
assert.equal(context.displayStoredMeasurement(catchItem.waterDepth, "depth"), "15.24 m");
assert.equal(context.displayStoredMeasurement(catchItem.fowCaught, "depth"), "12.192 FOW (m)");
assert.equal(context.convertUnitValue(1, "kg", "lb").toFixed(5), "2.20462");
assert.equal(context.convertUnitValue(1, "kn", "mph").toFixed(5), "1.15078");

console.log("unit storage conversion tests passed");
