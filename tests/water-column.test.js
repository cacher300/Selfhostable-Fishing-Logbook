import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { automaticZoom, niceTicks, temperatureAtDepth, thermoclineBand, thicknessLabel, waterColumnChartSvg, waterColumnDialogHtml, zoomOptions } = await import("../static/js/water-column.js");
setState({ settings: { units: { depth: "ft", waterTemperature: "F" } } });

// Depth and temperature ticks land on round numbers (not 3, 7, 16, 33 ft).
assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
assert.deepEqual(niceTicks(41.2, 64.6, 5), [45, 50, 55, 60]);

// Temperatures between model levels follow a straight line between them.
const values = [{ depthMeters: 0, temperatureC: 20 }, { depthMeters: 10, temperatureC: 20 }, { depthMeters: 20, temperatureC: 10 }, { depthMeters: 90, temperatureC: 5 }];
assert.equal(temperatureAtDepth(values, 15), 15);
assert.equal(temperatureAtDepth(values, 0), 20);
assert.equal(temperatureAtDepth(values, 200), 5);

// Zoom presets shallower than the water; the automatic zoom frames the thermocline.
assert.deepEqual(zoomOptions(90, "ft"), [50, 100, 200]);
assert.deepEqual(zoomOptions(20, "ft"), [50]);
assert.deepEqual(zoomOptions(90, "m"), [15, 30, 60]);
const profile = {
  model: "LOOFS",
  validTime: "2026-10-03T03:00:00Z",
  values,
  thermocline: { depthMeters: 15, topDepthMeters: 15, bottomDepthMeters: 20, thicknessMeters: 5, gradientCPerMeter: 1, temperatureAboveC: 15, temperatureBelowC: 10 },
};
// The thermocline is a band: top (where the warm water ends), bottom, thickness.
assert.deepEqual(thermoclineBand(profile.thermocline), { top: 15, bottom: 20, thickness: 5 });
assert.deepEqual(thermoclineBand({ depthMeters: 12 }), { top: 12, bottom: 12, thickness: 0 }); // older single-depth payloads
assert.equal(thermoclineBand(null), null);
assert.equal(thicknessLabel(thermoclineBand(profile.thermocline)), "16 ft thick");
assert.equal(thicknessLabel(thermoclineBand({ depthMeters: 12 })), "a thin layer");
assert.equal(automaticZoom(profile, "ft"), 100); // 49–66 ft band, framed with room below
assert.equal(automaticZoom({ ...profile, thermocline: null }, "ft"), 0);

const dialog = String(waterColumnDialogHtml(profile, 100));
assert.match(dialog, /Water column/);
assert.match(dialog, /Lake Ontario/);
assert.match(dialog, /Surface<\/span><strong>68 °F/);
assert.match(dialog, /Thermocline<\/span><strong>49 ft/);
assert.match(dialog, /data-wc-zoom="100" aria-pressed="true"/);
assert.match(dialog, /All model levels \(4\)/);
assert.match(dialog, /<small>To 66 ft · 16 ft thick<\/small>/);
assert.match(String(waterColumnDialogHtml({ ...profile, thermocline: null }, 0)), /<strong>None<\/strong><small>Mixed top to bottom/);
assert.match(String(waterColumnDialogHtml({ ...profile, thermocline: null, noThermocline: "gradual" }, 0)), /<strong>None<\/strong><\/div>/);

// The chart shades the thermocline band, labels its top and bottom, and stops at the zoom depth.
const chart = String(waterColumnChartSvg(profile, 100, 600, 420));
assert.match(chart, /Thermocline 49–66 ft/);
assert.match(chart, /class="wc-thermocline-band"/);
assert.match(chart, /wc-thermocline-line is-bottom/);
assert.doesNotMatch(chart, /Warm layer|Cold layer|linearGradient/);
assert.match(chart, />100 ft</);
assert.doesNotMatch(chart, />295 ft</);
assert.match(String(waterColumnChartSvg({ ...profile, thermocline: null }, 0, 600, 420)), />Mixed top to bottom</);
assert.doesNotMatch(String(waterColumnChartSvg({ ...profile, thermocline: null, noThermocline: "gradual" }, 0, 600, 420)), /wc-chart-note/);

// Mixed water (real Lake Erie values, all reading 67.5–67.6 °F) draws a straight vertical line.
const mixed = { model: "LEOFS", values: [[0, 19.737], [1, 19.74], [2, 19.7437], [4, 19.7524], [6, 19.7601], [8, 19.7647], [10, 19.7674], [12, 19.7692], [15, 19.7611]].map(([depthMeters, temperatureC]) => ({ depthMeters, temperatureC })), thermocline: null };
setState({ settings: { units: { depth: "m", waterTemperature: "C" } } });
const mixedLine = String(waterColumnChartSvg(mixed, 0, 600, 420)).match(/class="wc-line" points="([^"]+)"/)[1].split(" ").map((point) => point.split(",")[0]);
assert.equal(new Set(mixedLine).size, 1, `expected one x position, got ${[...new Set(mixedLine)]}`);
// A real change still bends the line.
const bent = String(waterColumnChartSvg(profile, 0, 600, 420)).match(/class="wc-line" points="([^"]+)"/)[1].split(" ").map((point) => point.split(",")[0]);
assert.ok(new Set(bent).size > 1);
setState({ settings: { units: { depth: "ft", waterTemperature: "F" } } });
