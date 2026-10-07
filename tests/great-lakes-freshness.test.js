import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv('<!doctype html><html><body><div id="fishMap"></div><div id="greatLakesConditions"></div></body></html>');
const { L } = await import("../static/js/vendor.js");
const conditions = await import("../static/js/great-lakes-conditions.js");
let availability = "fallback";
let requests = 0;
window.noaaGreatLakesApi = {
  status: async () => ({ version: "same-run", models: {} }),
  conditions: async () => {
    requests += 1;
    return { rasters: [], metadata: {
      models: [{ model: "LEOFS", available: true, validTime: "2026-10-07T04:00:00Z" }],
      ...(availability ? { availability: { state: availability } } : {})
    } };
  }
};
const map = L.map("fishMap", { zoomAnimation: false, fadeAnimation: false }).setView([42.5, -81], 7);
conditions.ensureGreatLakesConditions(map);
document.querySelector("[data-gl-layer]").value = "thermocline";
await conditions.loadGreatLakesConditions(map);
const status = document.querySelector("[data-gl-status]");
assert.match(status.textContent, /NOAA update is delayed; showing the last available/);
assert.equal(status.classList.contains("is-error"), false);
assert.equal(requests, 1);
availability = "error";
assert.equal(await conditions.refreshGreatLakesIfStale(map), true);
assert.equal(requests, 2);
assert.match(status.textContent, /several hours/);
availability = null;
assert.equal(await conditions.refreshGreatLakesIfStale(map), true);
assert.equal(requests, 3);
assert.doesNotMatch(status.textContent, /delayed|several hours/);
assert.equal(await conditions.refreshGreatLakesIfStale(map), false);
assert.equal(requests, 3);
map.remove();
process.exit(0);
