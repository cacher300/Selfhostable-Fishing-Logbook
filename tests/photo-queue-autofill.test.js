import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body><input id="method" value=""></body></html>`);
const { setState } = await import("../static/js/app-state.js");
const { photoQueueCatchGroups, attachPhotoGroupToCatch } = await import("../static/js/photo-queue-autofill.js");

const groups = photoQueueCatchGroups([
  { filename: "later", captureDate: "2026-08-23", captureTime: "06:10", capturedAt: "2026-08-23T06:10:00" },
  { filename: "first", captureDate: "2026-08-23", captureTime: "06:00", capturedAt: "2026-08-23T06:00:00" },
  { filename: "same-catch", captureDate: "2026-08-23", captureTime: "06:03", capturedAt: "2026-08-23T06:03:00" },
  { filename: "different-day", captureDate: "2026-08-24", captureTime: "06:01", capturedAt: "2026-08-24T06:01:00" },
  { filename: "no-time", captureDate: "2026-08-23" },
], "2026-08-23");

assert.deepEqual(groups.map((group) => group.map((photo) => photo.filename)), [
  ["first", "same-catch"],
  ["later"],
]);

const exactCutoff = photoQueueCatchGroups([
  { filename: "a", captureDate: "2026-08-23", captureTime: "06:00", capturedAt: "2026-08-23T06:00:00" },
  { filename: "b", captureDate: "2026-08-23", captureTime: "06:03", capturedAt: "2026-08-23T06:03:00" },
], "2026-08-23");
assert.equal(exactCutoff.length, 1);

const row = {
  dataset: {},
  catchPhotos: [],
  classList: { contains: (className) => className === "catch-row" },
  parentElement: { querySelectorAll: () => [row] },
  querySelector(selector) {
    const controls = {
      ".catch-time": { value: "", classList: { add() {}, remove() {} } },
      ".catch-time-unknown": { checked: false },
      ".pick-catch-location": { classList: { add() {}, remove() {} } },
      ".catch-location-latitude": { value: "" },
      ".catch-location-longitude": { value: "" },
      ".catch-water-depth": { value: "" },
      ".catch-fow": { value: "" },
      ".catch-depth-source": { value: "" },
      ".catch-lake-name": { value: "" },
      ".catch-location-summary": { textContent: "" },
      ".collapsible-row-summary": { textContent: "" },
      ".catch-species": { selectedOptions: [{ textContent: "" }] },
      ".catch-presentation": { selectedOptions: [{ textContent: "" }] },
    };
    return controls[selector] || null;
  },
};
setState({ trips: [] });
await attachPhotoGroupToCatch(row, [{ id: "photo", captureTime: "06:10" }]);
assert.deepEqual(row.catchPhotos.map((photo) => photo.id), ["photo"]);
