import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { greatLakesHistoryHtml, historyHours, stepHistoryHour } = await import("../static/js/great-lakes-conditions.js");
const { stationHistoryHtml } = await import("../static/js/great-lakes-points.js");
const { setup: setupApi } = await import("../static/js/noaa-api.js");
setState({ settings: { units: { depth: "ft", waterTemperature: "F" } } });

const HOUR = 3600 * 1000;
const index = { hours: [{ time: "2026-10-04T00:00:00Z", layers: ["temperature"] }, { time: "2026-10-05T00:00:00Z", layers: ["temperature", "waves"] }] };
const first = Date.parse("2026-10-04T00:00:00Z");
assert.deepEqual(historyHours(index, "waves"), [first + 24 * HOUR]);
assert.equal(stepHistoryHour(historyHours(index), first, 1), first + 24 * HOUR);
assert.match(String(greatLakesHistoryHtml()), /data-gl-history-time/);

// A past hour goes to the desktop server's history routes (passed on to the site).
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return { ok: true, json: async () => ({}) };
};
setupApi();
const api = window.noaaGreatLakesApi;
await api.conditions({ layer: "thermocline", forecastHour: 0, depth: 0, resolution: 512, models: "LOOFS", time: "2026-10-05T03:00:00Z" });
await api.profile({ forecastHour: 0, latitude: 43.5, longitude: -79.5, models: "LOOFS", time: "2026-10-05T03:00:00Z" });
await api.observations({ time: "2026-10-05T03:00:00Z" });
await api.history();
await api.stationHistory({ id: "45012" });
await api.profile({ forecastHour: 6, latitude: 43.5, longitude: -79.5, models: "LOOFS" });
assert.deepEqual(requested, [
  "/api/great-lakes/history/layers/thermocline?time=2026-10-05T03%3A00%3A00Z",
  "/api/great-lakes/history/point/temperature-profile?time=2026-10-05T03%3A00%3A00Z&latitude=43.5&longitude=-79.5",
  "/api/great-lakes/history/stations?time=2026-10-05T03%3A00%3A00Z",
  "/api/great-lakes/history?",
  "/api/great-lakes/history/stations/45012?",
  "/api/great-lakes/profile?forecastHour=6&latitude=43.5&longitude=-79.5&models=LOOFS"
]);

const start = Date.parse("2026-10-01T00:00:00Z") / 1000;
const charts = String(stationHistoryHtml({ days: 30, temperature: [[start, 15], [start + 3600, 16]] }));
assert.match(charts, /Water temperature/);
assert.match(charts, /°F/);
