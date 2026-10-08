import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body>
  <select id="tripLocation"><option value="lake-ontario" selected>Lake Ontario</option></select>
  <select id="tripLaunch"><option value="port" selected>Port</option></select>
  <input id="tripTitle" value="">
  <input id="tripDateValue" value="">
  <dialog id="tripDialog"></dialog>
  <div id="tripDialogTitle"></div>
  <div id="tripDialogMeta"></div>
  <form id="tripForm"></form>
  <div id="tripFormMessage" class="hidden"></div>
  <div id="tripSaveBar"></div>
  <div id="probeTemperatureGrid"></div>
  <div id="probeProfileImportStatus"></div>
</body></html>`);

const { els } = await import("../static/js/app-elements.js");
const { tripConditionsTime } = await import("../static/js/trip-condition-time.js");
const { setState, ui } = await import("../static/js/app-state.js");
const { selectedTripLocationCoordinates } = await import("../static/js/locations.js");
const {
  collectProbeTemperatureProfile,
  displayProbeDepth,
  displayProbeTemperatureInput,
  displayProbeTemperatureMeasurement,
  importNoaaProbeTemperatureProfile,
  noaaProbeTemperatureProfileEntries,
  probeProfileDisplayDepths,
  probeProfileImportSource,
  renderProbeTemperatureProfile,
} = await import("../static/js/trip-editor.js");

setState({
  settings: { units: { depth: "ft", waterTemperature: "F" } },
  locations: [{
    id: "lake-ontario",
    coordinates: { latitude: 43.7, longitude: -77.4 },
    launches: [{ id: "port", coordinates: { latitude: 43.6, longitude: -77.2 } }],
  }],
  people: [],
});
ui.tripDraft = { date: "2026-10-05", launchTime: "06:30" };

const exactProfile = noaaProbeTemperatureProfileEntries({
  values: [
    { depthMeters: 0, temperatureC: 20 },
    { depthMeters: 2.5, temperatureC: 16.25 },
    { depthMeters: 7, temperatureC: 8 },
  ],
});
assert.deepStrictEqual(structuredClone(exactProfile), [
  { depthFeet: 0, temperature: "68" },
  { depthFeet: 8.202, temperature: "61.25" },
  { depthFeet: 22.966, temperature: "46.4" },
], "NOAA layers retain their converted source depths and temperatures");
assert.equal(exactProfile.some((entry) => entry.depthFeet === 10 || entry.depthFeet === 20), false, "NOAA import does not interpolate 10-foot readings");

const displayDepths = probeProfileDisplayDepths(exactProfile);
assert(displayDepths.includes(8.202), "manual profile display depths include exact NOAA source depths");
assert(displayDepths.includes(10), "manual profile display depths keep editable depth rows");
assert(displayDepths.includes(22.966), "manual profile display depths include deeper exact NOAA source depths");

assert.deepStrictEqual(
  structuredClone(selectedTripLocationCoordinates()),
  { latitude: 43.6, longitude: -77.2 },
  "the launch pin takes priority over the waterbody pin",
);
setState({
  settings: { units: { depth: "ft", waterTemperature: "F" } },
  locations: [{
    id: "lake-ontario",
    coordinates: { latitude: 43.7, longitude: -77.4 },
    launches: [{ id: "port", coordinates: null }],
  }],
  people: [],
});
assert.deepStrictEqual(
  structuredClone(selectedTripLocationCoordinates()),
  { latitude: 43.7, longitude: -77.4 },
  "the waterbody pin is the fallback",
);

ui.probeProfileImportCoordinates = null;
assert.deepStrictEqual(
  structuredClone(probeProfileImportSource()),
  { coordinates: { latitude: 43.7, longitude: -77.4 }, type: "launch" },
  "the selected launch or waterbody remains the default NOAA source",
);
ui.probeProfileImportCoordinates = { latitude: 43.65, longitude: -77.25 };
assert.deepStrictEqual(
  structuredClone(probeProfileImportSource()),
  { coordinates: { latitude: 43.65, longitude: -77.25 }, type: "map-point" },
  "a temporary map point overrides the launch pin for the NOAA import",
);

assert.equal(displayProbeDepth(3.28), "3 ft", "probe depth labels use whole-number display values");
assert.equal(displayProbeTemperatureInput("69.895"), "70", "probe temperature inputs use whole-number display values");
assert.equal(displayProbeTemperatureMeasurement("69.895"), "70 °F", "probe temperature measurements use whole-number display values");

els.tripDialogTitle = document.querySelector("#tripDialogTitle");
els.tripDialogMeta = document.querySelector("#tripDialogMeta");
els.tripDialog = document.querySelector("#tripDialog");
els.tripForm = document.querySelector("#tripForm");
els.tripFormMessage = document.querySelector("#tripFormMessage");
els.tripSaveBar = document.querySelector("#tripSaveBar");
els.tripLocation = document.querySelector("#tripLocation");

renderProbeTemperatureProfile([
  { depthFeet: 0, temperature: "69.895" },
  { depthFeet: 10, temperature: "61.095" },
], { exactDepths: true });
const inputs = [...document.querySelectorAll("#probeTemperatureGrid [data-probe-depth-feet]")];
inputs[1].dataset.probeTemperatureDirty = "true";
inputs[1].value = "62";
assert.deepStrictEqual(
  structuredClone(collectProbeTemperatureProfile()),
  [
    { depthFeet: 0, temperature: "69.895" },
    { depthFeet: 10, temperature: "62" },
  ],
  "whole-number display values preserve untouched precision while keeping edited input",
);

const button = { textContent: "Use NOAA profile", disabled: false, setAttribute() {}, removeAttribute() {} };
ui.probeProfileImportCoordinates = null;
setState({ settings: { units: { depth: "ft", waterTemperature: "F" } }, locations: [], people: [] });
await importNoaaProbeTemperatureProfile(button);
assert.match(document.querySelector("#probeProfileImportStatus").textContent, /saved map pin/, "missing coordinates leave the existing profile unchanged");
assert.deepStrictEqual(
  structuredClone(collectProbeTemperatureProfile()),
  [
    { depthFeet: 0, temperature: "69.895" },
    { depthFeet: 10, temperature: "62" },
  ],
  "missing coordinates leave the existing profile unchanged",
);

setState({
  settings: { units: { depth: "ft", waterTemperature: "F" } },
  locations: [{
    id: "lake-ontario",
    coordinates: { latitude: 43.7, longitude: -77.4 },
    launches: [{ id: "port", coordinates: { latitude: 43.6, longitude: -77.2 } }],
  }],
  people: [],
});
ui.probeProfileImportCoordinates = null;
renderProbeTemperatureProfile([{ depthFeet: 10, temperature: "50" }], { exactDepths: true });
globalThis.confirm = () => false;
await importNoaaProbeTemperatureProfile(button);
assert.equal(document.querySelector("#probeProfileImportStatus").textContent, "NOAA import cancelled.", "existing readings require replacement confirmation");

renderProbeTemperatureProfile([], { exactDepths: true });
globalThis.confirm = () => true;
window.noaaGreatLakesApi = { fishingConditions: async () => ({ temperatureProfile: { available: false } }) };
await importNoaaProbeTemperatureProfile(button);
assert.match(document.querySelector("#probeProfileImportStatus").textContent, /not changed/, "an unavailable profile preserves the current readings");

const requestedConditions = [];
window.noaaGreatLakesApi = {
  fishingConditions: async (options) => {
    requestedConditions.push(options);
    return {
      temperatureProfile: {
        available: true,
        values: [{ depthMeters: 2.5, temperatureC: 16.25 }],
      },
    };
  },
};
await importNoaaProbeTemperatureProfile(button);
assert.deepEqual(requestedConditions[0], {
  time: tripConditionsTime(ui.tripDraft),
  latitude: 43.6,
  longitude: -77.2,
}, "NOAA import requests the saved trip date and launch time at the selected launch");
const imported = collectProbeTemperatureProfile();
assert.deepStrictEqual(structuredClone(imported), [{ depthFeet: 8.202, temperature: "61.25" }], "available NOAA data replaces the grid");
assert.equal([...document.querySelectorAll("#probeTemperatureGrid [data-probe-depth-feet]")].length, 1, "NOAA renders only its returned depths");
assert.equal(ui.tripFormUserChanged, true, "a successful import marks the form dirty");
assert.equal(document.querySelector("#tripFormMessage").classList.contains("hidden"), true, "a successful import clears stale form messages");
assert.match(document.querySelector("#probeProfileImportStatus").textContent, /exact depths/, "success reports exact-depth import");
assert.equal(button.textContent, "Use NOAA profile", "the import button label is restored");
