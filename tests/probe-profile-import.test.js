const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function functionSource(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `${name} should be defined`);
  const asyncStart = source.lastIndexOf("async ", functionStart);
  const start = asyncStart !== -1 && asyncStart + 6 === functionStart ? asyncStart : functionStart;
  const parametersStart = source.indexOf("(", functionStart);
  let parametersDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parametersDepth += 1;
    if (source[index] === ")") parametersDepth -= 1;
    if (!parametersDepth) {
      bodyStart = source.indexOf("{", index + 1);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `${name} should have a body`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (!depth) return source.slice(start, index + 1);
  }
  assert.fail(`${name} should have a complete body`);
}

const editorSource = fs.readFileSync("static/js/trip-editor.js", "utf8");
const locationsSource = fs.readFileSync("static/js/locations.js", "utf8");

const conversionContext = {
  unitPreference: () => "F",
  convertUnitValue: (value, from, to) => {
    if (from === "m" && to === "ft") return Number(value) * 3.28084;
    if (from === "C" && to === "F") return (Number(value) * 9 / 5) + 32;
    return Number(value);
  }
};
vm.createContext(conversionContext);
vm.runInContext(functionSource(editorSource, "noaaProbeTemperatureProfileEntries"), conversionContext);

const exactProfile = conversionContext.noaaProbeTemperatureProfileEntries({
  values: [
    { depthMeters: 0, temperatureC: 20 },
    { depthMeters: 2.5, temperatureC: 16.25 },
    { depthMeters: 7, temperatureC: 8 }
  ]
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(exactProfile)), [
  { depthFeet: 0, temperature: "68" },
  { depthFeet: 8.202, temperature: "61.25" },
  { depthFeet: 22.966, temperature: "46.4" }
], "NOAA layers retain their converted source depths and temperatures");
assert.equal(exactProfile.some((entry) => entry.depthFeet === 10 || entry.depthFeet === 20), false, "NOAA import does not interpolate 10-foot readings");

const gridContext = {
  probeProfileDepthsFeet: [0, 10, 20],
  probeTemperatureProfileEntries: (profile) => profile
};
vm.createContext(gridContext);
vm.runInContext(functionSource(editorSource, "probeProfileDisplayDepths"), gridContext);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(gridContext.probeProfileDisplayDepths(exactProfile))),
  [0, 8.202, 10, 20, 22.966],
  "the editor adds exact NOAA depths without replacing the blank manual rows"
);

const locationContext = {
  state: {
    locations: [{
      id: "lake-ontario",
      coordinates: { latitude: 43.7, longitude: -77.4 },
      launches: [{ id: "port", coordinates: { latitude: 43.6, longitude: -77.2 } }]
    }]
  },
  els: { tripLocation: { value: "lake-ontario" }, tripLaunch: { value: "port" } },
  findLaunchByIdOrName: (location, id) => location.launches.find((launch) => launch.id === id),
  isUsableCoordinates: (coordinates) => Boolean(coordinates && Number.isFinite(Number(coordinates.latitude)) && Number.isFinite(Number(coordinates.longitude)))
};
vm.createContext(locationContext);
vm.runInContext(functionSource(locationsSource, "selectedTripLocationCoordinates"), locationContext);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(locationContext.selectedTripLocationCoordinates())),
  { latitude: 43.6, longitude: -77.2 },
  "the launch pin takes priority over the waterbody pin"
);
locationContext.state.locations[0].launches[0].coordinates = null;
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(locationContext.selectedTripLocationCoordinates())),
  { latitude: 43.7, longitude: -77.4 },
  "the waterbody pin is the fallback"
);

const sourceContext = {
  probeProfileImportCoordinates: null,
  selectedTripLocationCoordinates: () => ({ latitude: 43.6, longitude: -77.2 }),
  isUsableCoordinates: (coordinates) => Boolean(coordinates && Number.isFinite(Number(coordinates.latitude)) && Number.isFinite(Number(coordinates.longitude)))
};
vm.createContext(sourceContext);
vm.runInContext(functionSource(editorSource, "probeProfileImportSource"), sourceContext);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sourceContext.probeProfileImportSource())),
  { coordinates: { latitude: 43.6, longitude: -77.2 }, type: "launch" },
  "the selected launch or waterbody remains the default NOAA source"
);
sourceContext.probeProfileImportCoordinates = { latitude: 43.65, longitude: -77.25 };
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sourceContext.probeProfileImportSource())),
  { coordinates: { latitude: 43.65, longitude: -77.25 }, type: "map-point" },
  "a temporary map point overrides the launch pin for the NOAA import"
);

const importContext = {
  probeProfileImportSource: () => null,
  collectProbeTemperatureProfile: () => [],
  setProbeProfileImportStatus: (message, error) => { importContext.status = { message, error }; },
  confirm: () => true,
  window: { noaaGreatLakesApi: { profile: async () => ({ available: true }) } },
  noaaProbeTemperatureProfileEntries: () => [{ depthFeet: 8.202, temperature: "61.25" }],
  renderProbeTemperatureProfile: () => { importContext.rendered = true; },
  markTripFormChanged: () => { importContext.changed = true; },
  clearTripFormMessage: () => { importContext.messageCleared = true; },
  greatLakesControlValue: () => "0",
  greatLakesLoadedModelsKey: "LOOFS"
};
vm.createContext(importContext);
vm.runInContext(functionSource(editorSource, "probeProfileCoordinatesMatch"), importContext);
vm.runInContext(functionSource(editorSource, "importNoaaProbeTemperatureProfile"), importContext);

const button = { textContent: "Use NOAA profile", disabled: false, setAttribute() {}, removeAttribute() {} };
(async () => {
  await importContext.importNoaaProbeTemperatureProfile(button);
  assert.match(importContext.status.message, /saved map pin/, "missing coordinates leave the existing profile unchanged");
  assert.equal(importContext.status.error, true);
  assert.equal(importContext.rendered, undefined);

  importContext.probeProfileImportSource = () => ({ coordinates: { latitude: 43.6, longitude: -77.2 }, type: "launch" });
  importContext.collectProbeTemperatureProfile = () => [{ depthFeet: 10, temperature: "50" }];
  importContext.confirm = () => false;
  importContext.status = null;
  await importContext.importNoaaProbeTemperatureProfile(button);
  assert.equal(importContext.status.message, "NOAA import cancelled.", "existing readings require replacement confirmation");
  assert.equal(importContext.rendered, undefined);

  importContext.collectProbeTemperatureProfile = () => [];
  importContext.confirm = () => true;
  importContext.window.noaaGreatLakesApi.profile = async () => ({ available: false });
  importContext.status = null;
  await importContext.importNoaaProbeTemperatureProfile(button);
  assert.match(importContext.status.message, /not changed/, "an unavailable profile preserves the current readings");
  assert.equal(importContext.status.error, true);

  importContext.window.noaaGreatLakesApi.profile = async () => ({ available: true });
  importContext.status = null;
  await importContext.importNoaaProbeTemperatureProfile(button);
  assert.equal(importContext.rendered, true, "available NOAA data replaces the grid");
  assert.equal(importContext.changed, true, "a successful import marks the form dirty");
  assert.equal(importContext.messageCleared, true, "a successful import clears stale form messages");
  assert.match(importContext.status.message, /exact depths/, "success reports exact-depth import");
  assert.equal(button.textContent, "Use NOAA profile", "the import button label is restored");

  console.log("Probe profile import tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
