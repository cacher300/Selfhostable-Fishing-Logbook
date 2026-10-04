import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const {
  greatLakesDataVersion, thinWaveArrows, waveChopLabel, waveDirectionText, waveHeightLabel, waveTravelDegrees, waveUpdateNote
} = await import("../static/js/great-lakes-conditions.js");
const { stationPopupHtml } = await import("../static/js/great-lakes-points.js");
setState({ settings: { units: { waveHeight: "ft" } } });

// NOAA gives the direction waves come from; arrows show where they travel.
assert.equal(waveTravelDegrees(270), 90);
assert.equal(waveTravelDegrees(10), 190);
assert.equal(waveDirectionText(315), "From NW (315°)");
assert.equal(waveDirectionText(undefined), "");

assert.equal(waveHeightLabel(1), "3.3 ft");
assert.equal(waveHeightLabel(Number.NaN), "—");
assert.equal(waveChopLabel(0.1), "Calm");
assert.notEqual(waveChopLabel(2), "Calm");

// The wave layer reloads only when the wave model changes, and the others only when GLOFS does.
const status = { version: "LEOFS:20261002t12z:6", wavesVersion: "waves:20261002t20z:1", waves: { nextRunExpectedAt: "2026-10-02T21:35:00Z" } };
assert.equal(greatLakesDataVersion(status, "waves"), "waves:20261002t20z:1");
assert.equal(greatLakesDataVersion(status, "temperature"), "LEOFS:20261002t12z:6");
assert.equal(greatLakesDataVersion(null, "waves"), "");
assert.equal(waveUpdateNote(status, Date.parse("2026-10-02T21:10:00Z")), " Wave forecasts update hourly; the next is expected in about 25 minutes.");
assert.match(waveUpdateNote(status, Date.parse("2026-10-02T21:40:00Z")), /due now/);
assert.equal(waveUpdateNote({}), "");

// One arrow per screen cell, the one nearest the cell centre, inside the view only.
const arrows = [
  { latitude: 0, longitude: 5 }, { latitude: 0, longitude: 27 }, { latitude: 0, longitude: 60 }, { latitude: 0, longitude: 500 }
];
const inView = { contains: ([, longitude]) => longitude < 100 };
const kept = thinWaveArrows(arrows, (arrow) => ({ x: arrow.longitude, y: 27 }), inView, 54);
assert.deepEqual(kept.map((arrow) => arrow.longitude), [27, 60]);

const buoy = {
  id: "45012", name: "East Lake Ontario", type: "Buoy", url: "https://example.test",
  waterTemperature: null, current: null,
  waves: { heightMeters: 1.3, periodSeconds: 5, directionDegrees: 270, observedAt: "2026-10-02T20:50:00Z" }
};
const popup = String(stationPopupHtml(buoy, Date.parse("2026-10-02T21:00:00Z")));
assert.match(popup, /Waves/);
assert.match(popup, /4\.3<\/strong><span>ft/); // large number, smaller unit
assert.match(popup, /5 s period · From W \(270°\) · Measured 10 min ago/);
