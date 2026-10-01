import assert from "node:assert/strict";
import { test } from "node:test";
import { installBrowserEnv, okJson, setFetch } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");
const appState = await import("../static/js/app-state.js");
const { els } = await import("../static/js/app-elements.js");
const { replaceState } = await import("../static/js/store.js");
const { saveUnitSettings } = await import("../static/js/settings.js");
const { settingsUi } = await import("../static/js/settings-core.js");

function dummyElement() {
  return {
    value: "",
    innerHTML: "",
    textContent: "",
    checked: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    append() {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
  };
}

function installSettingsDom(inputValue) {
  document.body.innerHTML = `
    <select data-unit-setting="depth"><option value="m" selected>m</option></select>
    <input data-bathymetry-lake-calibration="Ontario" data-bathymetry-calibration-end="offshoreOffsetFeet" value="${inputValue}">
    <input id="searchInput" value="">
    <select id="targetFilter"></select>
    <select id="methodFilter"></select>
    <select id="yearFilter"></select>
    <select id="sortSelect"></select>
    <div id="tripTable"></div>
    <div id="emptyState"></div>
  `;
  for (const key of Object.keys(els)) els[key] = dummyElement();
  els.targetFilter.value = "All targets";
  els.methodFilter.value = "All methods";
  els.yearFilter.value = "All years";
  els.sortSelect.value = "";
  els.tripTable = dummyElement();
  els.emptyState = dummyElement();
}

function installFetchStub() {
  setFetch(async (url, options = {}) => {
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    if (url === "/api/logbook") {
      return okJson({}, { headers: { ETag: '"2"' } });
    }
    throw new Error(`Unexpected fetch ${url} ${options.method || "GET"}`);
  });
}

function installState() {
  const installed = replaceState({
    ...structuredClone(defaults),
    settings: {
      ...structuredClone(defaults.settings),
      units: {
        depth: "ft", distance: "km", speed: "mph", windSpeed: "kph", pressure: "hPa",
        airTemperature: "C", waterTemperature: "F", precipitation: "mm", waveHeight: "ft",
        fishLength: "in", fishWeight: "lb",
      },
      bathymetryLakeCalibrationsFeet: {
        Ontario: { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 2.345678, source: "custom" },
        Erie: { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 },
      },
    },
    trips: [],
    reels: [],
  }, { revision: '"1"' });
  settingsUi.unitsDraft = { ...installed.settings.units, depth: "m" };
  return installed;
}

function installSettingsDrafts(inputValue) {
  settingsUi.bathymetryLakeCalibrationDisplayDraft = {
    Ontario: { offshoreOffsetFeet: inputValue }
  };
}

test("saving measurement units does not rewrite untouched bathymetry calibrations", async () => {
  installSettingsDom("2.35");
  installFetchStub();
  installState();
  installSettingsDrafts("2.35");
  await saveUnitSettings({ rerender: false });
  const calibrations = appState.state.settings.bathymetryLakeCalibrationsFeet;
  assert.deepEqual(structuredClone(calibrations.Ontario), { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 2.345678, source: "custom" });
  assert.deepEqual(structuredClone(calibrations.Erie), { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 });
  assert.equal(appState.state.settings.units.depth, "m");
});

test("editing one calibration patches only that value and retains its sibling metadata", async () => {
  installSettingsDom("4");
  installFetchStub();
  installState();
  installSettingsDrafts("4");
  await saveUnitSettings({ rerender: false });
  const calibrations = appState.state.settings.bathymetryLakeCalibrationsFeet;
  assert.deepEqual(structuredClone(calibrations.Ontario), { shallowOffsetFeet: 1.234567, offshoreOffsetFeet: 4, source: "custom" });
  assert.deepEqual(structuredClone(calibrations.Erie), { shallowOffsetFeet: 9.876543, offshoreOffsetFeet: 0.123456 });
});
