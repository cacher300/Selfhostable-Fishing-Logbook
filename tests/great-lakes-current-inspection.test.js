import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { currentProfileHtml, friendlyTime, friendlyWait, modelDepthNote, modelDepthShown, nextUpdateNote, tooShallowNote } = await import("../static/js/great-lakes-conditions.js");
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

// NOAA stores fixed depth levels; the status names the level actually drawn.
assert.equal(modelDepthShown({ models: [{ selectedDepthMeters: 4 }, { selectedDepthMeters: 4 }] }), 4);
assert.equal(modelDepthShown({ models: [{ available: false }] }), null);
assert.match(modelDepthNote(3, 2), /model's 2 m level, the closest to 3 m/);
assert.equal(modelDepthNote(6, 6), "");
assert.equal(modelDepthNote(0, null), "");
// The status line says when NOAA's next run should arrive.
const statusNow = Date.parse("2026-10-02T19:00:00Z");
const status = { models: { LEOFS: { nextRunExpectedAt: "2026-10-02T20:35:00Z" }, LSOFS: { nextRunExpectedAt: "2026-10-02T21:25:00Z" } } };
assert.equal(nextUpdateNote(status, statusNow), " Next update expected in about 2 hours.");
assert.match(nextUpdateNote(status, Date.parse("2026-10-02T22:00:00Z")), /due now/);
assert.equal(nextUpdateNote(null, statusNow), "");

// Times read as words ("tonight at 10 PM"), not numeric dates.
const evening = new Date(2026, 9, 2, 19, 15).getTime();
assert.equal(friendlyTime(new Date(2026, 9, 2, 22, 0), evening), "tonight at 10 PM");
assert.equal(friendlyTime(new Date(2026, 9, 2, 9, 30), evening), "today at 9:30 AM");
assert.equal(friendlyTime(new Date(2026, 9, 3, 4, 0), evening), "tomorrow at 4 AM");
assert.equal(friendlyTime(new Date(2026, 9, 1, 22, 0), evening), "yesterday at 10 PM");
assert.equal(friendlyTime(new Date(2026, 9, 4, 22, 0), evening), "Sunday at 10 PM");
assert.equal(friendlyTime("not a time", evening), "");
assert.equal(friendlyWait(20 * 60000), "in about 20 minutes");
assert.equal(friendlyWait(30000), "in a minute or so");
assert.equal(friendlyWait(62 * 60000), "in about an hour");
assert.match(String(currentProfileHtml(profile, 5)), /NOAA forecast for /);

// Lakes shallower than the chosen depth are left blank and named in the status.
assert.equal(tooShallowNote([{ model: "LOOFS", available: true }]), "");
assert.equal(tooShallowNote([{ model: "LEOFS", tooShallow: true }, { model: "LEOFS", tooShallow: true }]), " Lake Erie isn't this deep, so it's left blank.");
assert.equal(tooShallowNote([{ model: "LEOFS", tooShallow: true }, { model: "LOOFS", tooShallow: true }]), " Lake Erie and Lake Ontario aren't this deep, so they're left blank.");
