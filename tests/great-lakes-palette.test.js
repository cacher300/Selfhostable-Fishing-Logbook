import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { PALETTE_STOPS, fitRange, paletteRgb, paletteTables, visibleHistogram } = await import("../static/js/great-lakes-palette.js");

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
