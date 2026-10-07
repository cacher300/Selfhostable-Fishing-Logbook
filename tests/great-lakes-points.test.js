import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const {
  modelPointKind, relativeTimeLabel, shortTemperatureLabel, stationMarkerHtml, stationPopupHtml, stationTemperatureRange
} = await import("../static/js/great-lakes-points.js");
setState({ settings: { units: { depth: "m", speed: "mph", waterTemperature: "F" } } });

const now = Date.parse("2026-10-02T17:00:00Z");
assert.equal(relativeTimeLabel("2026-10-02T16:59:50Z", now), "just now");
assert.equal(relativeTimeLabel("2026-10-02T16:37:00Z", now), "23 min ago");
assert.equal(relativeTimeLabel("2026-10-02T15:00:00Z", now), "2 h ago");
assert.equal(relativeTimeLabel("2026-10-02T14:50:00Z", now), "2 h 10 min ago");
assert.equal(relativeTimeLabel("not a date", now), "at an unknown time");

assert.equal(shortTemperatureLabel(20), "68°");

// Too-narrow station spreads are widened so small differences don't look dramatic.
assert.deepEqual(stationTemperatureRange([{ waterTemperature: { temperatureC: 17 } }, { waterTemperature: { temperatureC: 18 } }]), { minC: 16, maxC: 19 });
assert.deepEqual(stationTemperatureRange([], { minC: 5, maxC: 25 }), { minC: 5, maxC: 25 });

const buoy = {
  id: "45026", name: "Cook Nuclear Plant Buoy", owner: "Limno Tech", type: "Buoy", url: "https://www.ndbc.noaa.gov/station_page.php?station=45026",
  waterTemperature: { temperatureC: 16.4, observedAt: "2026-10-02T16:30:00Z" },
  current: { observedAt: "2026-10-02T16:40:00Z", values: [{ depthMeters: 1, directionDegrees: 45, speedMetersPerSecond: 0.1 }, { depthMeters: 3, directionDegrees: 90, speedMetersPerSecond: 0.2 }] }
};
const marker = String(stationMarkerHtml(buoy, { minC: 10, maxC: 20 }));
assert.match(marker, /great-lakes-station has-current/);
assert.match(marker, /62°/);
assert.match(marker, /rotate\(45deg\)/);
assert.match(marker, /--station-color: rgb\(/);

const shore = { id: "CNDO1", name: "Cleveland, OH", type: "Shore station", url: "https://example.test", waterTemperature: { temperatureC: 20.7, observedAt: "2026-10-02T16:30:00Z" }, current: null };
assert.doesNotMatch(String(stationMarkerHtml(shore, { minC: 10, maxC: 20 })), /has-current|<svg/);

const popup = String(stationPopupHtml(buoy, now));
assert.match(popup, /Cook Nuclear Plant Buoy/);
assert.match(popup, /Buoy · Limno Tech · 45026/);
assert.match(popup, /Water temperature/);
assert.match(popup, /Measured 30 min ago/);
assert.match(popup, /Current by depth/);
assert.match(popup, /Toward NE · 45°/);
assert.match(popup, /Toward E · 90°/);
assert.equal((popup.match(/role="listitem"/g) || []).length, 2);
assert.match(popup, /rel="noopener noreferrer"/);
assert.doesNotMatch(String(stationPopupHtml(shore, now)), /Current by depth/);

// Names from NOAA are escaped, never injected as markup.
assert.doesNotMatch(String(stationPopupHtml({ ...shore, name: "<img src=x onerror=alert(1)>" }, now)), /<img/);

assert.equal(modelPointKind(), "temperature");
