import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { currentProfileHtml } = await import("../static/js/great-lakes-conditions.js");
setState({ settings: { units: { depth: "m", speed: "mph" } } });

const profile = {
  validTime: "2026-09-28T12:00:00Z",
  sampleDistanceKm: 2.3,
  depthApproximate: true,
  values: [
    { depthMeters: 0, speedMetersPerSecond: 0.1, directionDegrees: 0 },
    { depthMeters: 5, speedMetersPerSecond: 0.28, directionDegrees: 45 },
    { depthMeters: 10, speedMetersPerSecond: 0.4, directionDegrees: 90 },
  ],
};
const html = String(currentProfileHtml(profile, 5));
assert.match(html, /Current speed and direction by depth/);
assert.match(html, /Surface/);
assert.match(html, /5(?:\.0)? m/);
assert.match(html, /10 m/);
assert.match(html, /Toward N · 0°/);
assert.match(html, /Toward NE · 45°/);
assert.match(html, /Toward E · 90°/);
assert.doesNotMatch(html, /Each bar shows current speed|Depths are approximate|terrain-following layers/);
assert.equal((html.match(/role="listitem"/g) || []).length, 3);
assert.equal((html.match(/is-closest/g) || []).length, 1);
assert.doesNotMatch(html, /compass/i);
assert.match(String(currentProfileHtml({ values: [] }, 0)), /No current profile is available/);
