import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { PALETTE_STOPS, SMOOTH_PALETTE_LAYERS, WAVE_CALM_MAX_METERS, WAVE_DEFAULT_MAX_METERS, WIND_DEFAULT_MAX_METERS_PER_SECOND, debandLevels, encodeDebanded, fitRange, paletteRgb, paletteTables, visibleHistogram, waveStops, windStops } = await import("../static/js/great-lakes-palette.js");

// The browser repaints with the server's palette: the ends and a middle stop are exact.
const stops = PALETTE_STOPS.temperature;
assert.deepEqual(paletteRgb(0, stops), [58, 40, 168]);
assert.deepEqual(paletteRgb(1, stops), [228, 40, 52]);
assert.deepEqual(paletteRgb(0.53, stops), [34, 208, 136]);
assert.deepEqual(paletteRgb(2, stops), [228, 40, 52]);

// Grey levels over 5-25 °C, coloured for 10-15 °C on screen: under 10 °C is the coldest colour,
// 15 °C and above the warmest, and the palette spreads over just those 5 degrees.
const [red, green, blue] = paletteTables([5, 25], 10, 15, stops).map((table) => table.split(" ").map(Number));
assert.equal(red.length, 256);
const level = (celsius) => Math.round((celsius - 5) / 20 * 255);
assert.deepEqual([red[level(6)], green[level(6)], blue[level(6)]].map((value) => Math.round(value * 255)), [58, 40, 168]);
assert.deepEqual([red[level(20)], green[level(20)], blue[level(20)]].map((value) => Math.round(value * 255)), [228, 40, 52]);
const middle = [red[level(12.5)], green[level(12.5)], blue[level(12.5)]].map((value) => Math.round(value * 255));
assert.ok(middle[1] > 150, `12.5 °C should be mid-palette green, got ${middle}`);

// The on-screen range: trimmed, never narrower than 3 °C, and speeds start at zero.
const histogram = new Array(512).fill(0);
for (let bin = 100; bin < 200; bin += 1) histogram[bin] = 10;
histogram[500] = 1;  // one stray warm pixel does not stretch the colours
const [low, high] = fitRange(histogram, 0.05, 0, "temperature");
assert.ok(Math.abs(low - 5.0) < 0.1 && Math.abs(high - 10.0) < 0.1, `${low} ${high}`);
const narrow = new Array(512).fill(0);
narrow[200] = 50;
const [narrowLow, narrowHigh] = fitRange(narrow, 0.05, 0, "temperature");
assert.ok(Math.abs(narrowHigh - narrowLow - 3) < 1e-9);
const [speedLow, speedHigh] = fitRange(histogram, 0.001, 0, "currents");
assert.equal(speedLow, 0);
assert.ok(speedHigh >= 0.08);
assert.equal(fitRange(new Array(512).fill(0), 0.05, 0, "temperature"), null);

// Only water pixels inside the view count.
const sample = { width: 4, height: 2, levels: new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0]), south: 40, west: -90, north: 41, east: -86, valueRange: [0, 25.5] };
const all = visibleHistogram([sample], { south: 39, west: -91, north: 42, east: -85 }, 0, 0.1);
assert.equal(all.reduce((sum, count) => sum + count, 0), 4);
const westHalf = visibleHistogram([sample], { south: 39, west: -91, north: 42, east: -88.5 }, 0, 0.1);
assert.equal(westHalf.reduce((sum, count) => sum + count, 0), 4);
const eastHalf = visibleHistogram([sample], { south: 39, west: -87.5, north: 42, east: -85 }, 0, 0.1);
assert.equal(eastHalf.reduce((sum, count) => sum + count, 0), 0);
assert.equal(visibleHistogram([sample], { south: 10, west: 10, north: 11, east: 11 }, 0, 0.1).reduce((sum, count) => sum + count, 0), 0);

// Waves: red at 8 ft unless bigger waves are in view, then red at the highest wave.
const calmLake = new Array(512).fill(0);
calmLake[20] = 100;
assert.deepEqual(fitRange(calmLake, 10 / 512, 0, "waves"), [0, WAVE_DEFAULT_MAX_METERS]);
const roughLake = new Array(512).fill(0);
roughLake[50] = 100;
roughLake[200] = 3;
const [, roughHigh] = fitRange(roughLake, 10 / 512, 0, "waves");
assert.ok(roughHigh > 3.9 && roughHigh < 3.95, `red should be at the highest wave, got ${roughHigh}`);
// Blues are only for calm water under 2 ft, whatever the scale's top.
for (const top of [WAVE_DEFAULT_MAX_METERS, 4, 8]) {
  const waveColors = waveStops(top);
  assert.deepEqual(paletteRgb(1, waveColors), [222, 40, 92]);
  assert.ok(Math.abs(waveColors[2][0] * top - WAVE_CALM_MAX_METERS) < 1e-9);
}

// Wind: calm blues under 5 kn; red at 25 kn unless stronger wind is on screen.
const calmWind = new Array(512).fill(0);
calmWind[30] = 100;
assert.deepEqual(fitRange(calmWind, 40 / 512, 0, "wind"), [0, WIND_DEFAULT_MAX_METERS_PER_SECOND]);
const galeWind = new Array(512).fill(0);
galeWind[100] = 50;
galeWind[230] = 2;
assert.ok(fitRange(galeWind, 40 / 512, 0, "wind")[1] > 17.9);
for (const top of [WIND_DEFAULT_MAX_METERS_PER_SECOND, 20]) {
  const windColors = windStops(top);
  assert.ok(Math.abs(windColors[2][0] * top - 5 * 0.514444) < 1e-9);
  assert.deepEqual(paletteRgb(1, windColors), [222, 40, 92]);
}

// Smooth value-raster rendering is shared by temperature, air, waves, wind, and radar.
assert.deepEqual(SMOOTH_PALETTE_LAYERS, ["temperature", "air-temperature", "waves", "wind", "radar"]);

// Debanding restores a gentle ramp while keeping real fronts sharp and land transparent.
function valueImage(width, height, valueAt, waterAt = () => true) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = Math.round(valueAt(x, y));
      data[offset + 3] = waterAt(x, y) ? 255 : 0;
    }
  }
  return data;
}
const rampWidth = 240, rampHeight = 24;
const ramp = (x) => 100 + x / 40;
const debandedRamp = debandLevels(valueImage(rampWidth, rampHeight, ramp), rampWidth, rampHeight);
let rampError = 0, rampSteps = 0;
assert.deepEqual([debandedRamp.width, debandedRamp.height], [rampWidth / 2, rampHeight / 2]);
for (let x = 20; x < debandedRamp.width - 20; x += 1) {
  const here = debandedRamp.levels[6 * debandedRamp.width + x] / 256;
  const expected = ramp(x * 2 + 0.5);
  rampError = Math.max(rampError, Math.abs(here - expected));
  rampSteps = Math.max(rampSteps, Math.abs(here - debandedRamp.levels[6 * debandedRamp.width + x - 1] / 256));
}
assert.ok(rampError < 0.3, `debanded ramp should follow the true values, off by ${rampError}`);
assert.ok(rampSteps < 0.1, `debanded ramp should have no steps, largest ${rampSteps}`);

const front = debandLevels(valueImage(120, 24, (x) => (x < 60 ? 80 : 140)), 120, 24);
assert.ok(Math.abs(front.levels[6 * front.width + 25] / 256 - 80) < 1);
assert.ok(Math.abs(front.levels[6 * front.width + 35] / 256 - 140) < 1);

const shore = debandLevels(valueImage(60, 24, () => 150, (x) => x < 31), 60, 24);
assert.ok(Math.abs(shore.levels[6 * shore.width + 14] / 256 - 150) < 0.5);
assert.deepEqual([shore.alpha[6 * shore.width + 14], shore.alpha[6 * shore.width + 15], shore.alpha[6 * shore.width + 16]], [255, 128, 0]);
const oddDimensions = debandLevels(valueImage(3, 3, () => 100, (x, y) => x === 2 && y === 2), 3, 3);
assert.deepEqual([oddDimensions.width, oddDimensions.height], [2, 2]);
assert.deepEqual([...oddDimensions.alpha], [0, 0, 0, 255]);

const fine = new Uint16Array([0, 128 * 256, 255 * 256]);
const encoded = encodeDebanded(fine, { data: new Uint8ClampedArray(12) }, [0, 30], 0, 30).data;
assert.deepEqual([encoded[0], encoded[4], encoded[8]], [0, 128, 255]);
