const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { test } = require("node:test");

function settingsContext(inputValue) {
  const context = {
    console,
    structuredClone,
    crypto: { randomUUID: () => "test-id" },
    document: {
      querySelectorAll(selector) {
        if (selector === "[data-unit-setting]") return [{ dataset: { unitSetting: "depth" }, value: "m" }];
        if (selector === "[data-bathymetry-lake-calibration]") return [{
          dataset: { bathymetryLakeCalibration: "Ontario", bathymetryCalibrationEnd: "offshoreOffsetFeet" },
          value: inputValue
        }];
        return [];
      }
    },
    weatherRequestCache: { clear() {} },
    marineRequestCache: { clear() {} },
    els: {},
    trimNumber(value) { return String(Number(value.toFixed(2))); },
    activeSummaryTripId: "",
    state: {
      settings: {
        units: {
          depth: "ft", distance: "km", speed: "mph", windSpeed: "kph", pressure: "hPa",
          airTemperature: "C", waterTemperature: "F", precipitation: "mm", waveHeight: "ft",
          fishLength: "in", fishWeight: "lb"
        },
        bathymetryLakeCalibrationsFeet: {
          Ontario: { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 2.345678, source: "custom" },
          Erie: { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 }
        }
      },
      trips: [],
      reels: []
    },
    async saveState() {},
    async runSettingsSave(work) { return work(); },
    convertStoredMeasurements() {},
    renderAll() {},
    syncUnitLabels() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["static/js/app-config.js", "static/js/app-defaults.js", "static/js/app-units.js", "static/js/settings.js"]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

test("saving measurement units does not rewrite untouched bathymetry calibrations", async () => {
  const context = settingsContext("2.35");
  await context.saveUnitSettings({ rerender: false });
  const calibrations = context.state.settings.bathymetryLakeCalibrationsFeet;
  assert.deepEqual(JSON.parse(JSON.stringify(calibrations.Ontario)), { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 2.345678, source: "custom" });
  assert.deepEqual(JSON.parse(JSON.stringify(calibrations.Erie)), { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 });
  assert.equal(context.state.settings.units.depth, "m");
});

test("editing one calibration patches only that value and retains its sibling metadata", async () => {
  const context = settingsContext("4");
  await context.saveUnitSettings({ rerender: false });
  const calibrations = context.state.settings.bathymetryLakeCalibrationsFeet;
  assert.deepEqual(JSON.parse(JSON.stringify(calibrations.Ontario)), { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 4, source: "custom" });
  assert.deepEqual(JSON.parse(JSON.stringify(calibrations.Erie)), { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 });
});
