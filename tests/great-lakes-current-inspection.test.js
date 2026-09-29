const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const context = { window: {}, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/great-lakes-conditions.js", "utf8"), context);

context.profile = {
  validTime: "2026-09-28T12:00:00Z", sampleDistanceKm: 2.3,
  depthApproximate: true,
  values: [
    { depthMeters: 0, speedMetersPerSecond: 0.1, directionDegrees: 0 },
    { depthMeters: 5, speedMetersPerSecond: 0.28, directionDegrees: 45 },
    { depthMeters: 10, speedMetersPerSecond: 0.4, directionDegrees: 90 }
  ]
};
const html = vm.runInContext("currentProfileHtml(profile, 5)", context);
assert.match(html, /Current speed and direction by depth/);
assert.match(html, /Surface/);
assert.match(html, /5\.0 m/);
assert.match(html, /10 m/);
assert.match(html, /Toward N · 0°/);
assert.match(html, /Toward NE · 45°/);
assert.match(html, /Toward E · 90°/);
assert.doesNotMatch(html, /Each bar shows current speed|Depths are approximate|terrain-following layers/);
assert.equal((html.match(/role="listitem"/g) || []).length, 3);
assert.equal((html.match(/is-closest/g) || []).length, 1);
assert.doesNotMatch(html, /compass/i);
assert.match(vm.runInContext("currentProfileHtml({ values: [] }, 0)", context), /No current profile is available/);
console.log("Great Lakes current profile rendering tests passed");
