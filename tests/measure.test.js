import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { bearingDegrees, distanceMeters, formatBearing, formatDistance, measurementText } = await import("../static/js/measure.js");

// One degree of latitude is about 111.2 km on the mean-radius sphere.
assert.ok(Math.abs(distanceMeters([0, 0], [1, 0]) - 111195) < 2);
assert.equal(distanceMeters([43.5, -77.9], [43.5, -77.9]), 0);
// Toronto to Rochester across Lake Ontario, about 154 km.
const toronto = [43.6532, -79.3832], rochester = [43.1566, -77.6088];
assert.ok(Math.abs(distanceMeters(toronto, rochester) / 1000 - 153.6) < 0.5);

assert.equal(Math.round(bearingDegrees([43, -78], [44, -78])), 0);
assert.equal(Math.round(bearingDegrees([0, 0], [0, 1])), 90);
assert.equal(Math.round(bearingDegrees([44, -78], [43, -78])), 180);
assert.equal(formatBearing(359.7), "0° N");
assert.equal(formatBearing(112), "112° ESE");

// Imperial shows miles (feet when short); metric shows km (m when short); both add nautical miles.
assert.equal(formatDistance(20000, "imperial"), "12.4 mi · 10.8 nmi");
assert.equal(formatDistance(250, "imperial"), "820 ft · 0.13 nmi");
assert.equal(formatDistance(20000, "metric"), "20.0 km · 10.8 nmi");
assert.equal(formatDistance(640, "metric"), "640 m · 0.35 nmi");
assert.equal(formatDistance(5000, "metric"), "5.00 km · 2.70 nmi");
assert.equal(measurementText(toronto, rochester, "imperial"), "95.4 mi · 82.9 nmi · 110° ESE");
