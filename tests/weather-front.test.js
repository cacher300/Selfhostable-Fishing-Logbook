import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { ui } = await import("../static/js/app-state.js");
const { updateTripField } = await import("../static/js/draft-binding.js");
const { defaultLogbook } = await import("../static/js/generated/logbook-schema-rules.js");
setState(structuredClone(defaultLogbook));
const { weatherFrontLabel, weatherFrontOptions } = await import("../static/js/weather-front.js");
const { createTripDraft, tripFromDraft } = await import("../static/js/trip-draft.js");
const { reportAdditionalConditionRows } = await import("../static/js/trip-summary.js");
const { summarizeTripPerformance } = await import("../static/js/stats-performance.js");
const { shareWeatherParts } = await import("../static/js/trip-sharing.js");

test("historical front values survive trip edits but are not displayed as automatic classifications", () => {
  for (const method of ["Casting", "Trolling"]) {
    for (const { value, label } of weatherFrontOptions) {
      const source = { id: "trip", method, weatherFront: value, weatherData: { frontTag: "Stable", custom: true }, people: [], catches: [], lostFish: [], gearUsed: [], custom: { keep: true } };
      const draft = createTripDraft(source);
      assert.deepEqual(tripFromDraft(draft), source);
      draft.notes = "Edited";
      const saved = tripFromDraft(draft);
      assert.equal(saved.weatherFront, value);
      assert.deepEqual(saved.weatherData, source.weatherData);
      assert.deepEqual(saved.custom, source.custom);
      assert.deepEqual(reportAdditionalConditionRows({ weatherFront: value })[0], ["Weather front", "Unclassified"]);
      assert.ok(!shareWeatherParts(saved).includes(label));
      draft.weatherFront = "";
      assert.equal(tripFromDraft(draft).weatherFront, "");
    }
  }
});

test("older trips remain unclassified after unrelated edits", () => {
  const source = { id: "older", catches: [], lostFish: [], gearUsed: [] };
  const draft = createTripDraft(source);
  draft.notes = "An unrelated edit";
  assert.equal(Object.hasOwn(tripFromDraft(draft), "weatherFront"), false);
  assert.equal(weatherFrontLabel(), "Unclassified");
  assert.equal(weatherFrontLabel("no-front"), "No front");
});

test("unchanged time updates keep an automatic estimate; a changed time invalidates it", () => {
  ui.tripDraft = { launchTime: "04:00", weatherFront: "pre-front", weatherFrontSource: "automatic", weatherData: { frontAssessment: { value: "pre-front" } } };
  updateTripField("launchTime", "04:00");
  assert.equal(ui.tripDraft.weatherFront, "pre-front");
  updateTripField("launchTime", "05:00");
  assert.equal(ui.tripDraft.weatherFront, "");
  assert.equal(ui.tripDraft.weatherData.frontAssessment, undefined);
  ui.tripDraft = null;
});

test("front performance includes skunk trips, quantities, and a separate unclassified group", () => {
  const trips = [
    { id: "a", weatherFront: "pre-front", hours: 2, fish: 3 },
    { id: "b", weatherFront: "pre-front", hours: 2, fish: 0 },
    { id: "c", weatherFront: "no-front", hours: 1, fish: 0 },
    { id: "d", hours: 1, fish: 0 }
  ];
  const rows = summarizeTripPerformance(trips, trip => weatherFrontLabel(trip.weatherFront), 6, 3);
  const pre = rows.find(row => row.name === "Pre-front");
  assert.equal(pre.trips, 2);
  assert.equal(pre.fish, 3);
  assert.equal(pre.skunkRate, 0.5);
  assert.equal(pre.fishPerTrip, 1.5);
  assert.equal(rows.find(row => row.name === "No front").trips, 1);
  assert.equal(rows.find(row => row.name === "Unclassified").trips, 1);
});
