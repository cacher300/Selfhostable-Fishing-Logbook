import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { setState } = await import("../static/js/app-state.js");
const { defaults } = await import("../static/js/app-defaults.js");
const { catchRecords, gearUseRecords, lostFishRecords } = await import("../static/js/stats-scope.js");
const {
  colorFamilies,
  comparisonHighlights,
  comparisonMatrix,
  comparisonRows,
  lureSizeLabel,
  summarizeComparison,
  timeOfDaySlices
} = await import("../static/js/stats-comparisons.js");

assert.deepEqual(colorFamilies("Blue / Silver"), ["Blue", "Silver"]);
assert.deepEqual(colorFamilies("Firetiger"), ["Chartreuse", "Green", "Orange"]);
assert.deepEqual(colorFamilies("Mauve"), ["Other"]);
assert.deepEqual(colorFamilies(""), []);
assert.deepEqual(colorFamilies("Purple", { glow: true }), ["Purple", "Glow"]);

assert.equal(lureSizeLabel({ type: "Spoon", spoonSize: "Magnum", weight: "1 oz" }), "Magnum Spoon");
assert.equal(lureSizeLabel({ type: "Bead", beadSize: "10mm" }), "10mm Bead");
assert.equal(lureSizeLabel({ type: "Jig", weight: "1/2 oz" }), "1/2 oz Jig");
assert.equal(lureSizeLabel({ type: "Jig" }), "");

assert.deepEqual(
  timeOfDaySlices({ startTime: "08:00", endTime: "12:00", trip: {} }, 240),
  [{ label: "Morning", minutes: 120 }, { label: "Midday", minutes: 120 }]
);
assert.deepEqual(
  timeOfDaySlices({ trip: { launchTime: "09:00", linesPulledTime: "11:00" } }, 60),
  [{ label: "Morning", minutes: 30 }, { label: "Midday", minutes: 30 }]
);
assert.deepEqual(timeOfDaySlices({ trip: {} }, 60), []);

setState({
  ...structuredClone(defaults),
  lures: [
    { id: "chart", name: "Chart Spoon", type: "Spoon", color: "Chartreuse", spoonSize: "Magnum", glow: true },
    { id: "blue", name: "Blue Spoon", type: "Spoon", color: "Blue/Silver", spoonSize: "Standard" },
    { id: "chart-lower", name: "Chart Stick", type: "Crankbait", color: "chartreuse" }
  ],
  flashers: [{ id: "paddle", name: "Green Paddle", type: "Paddle", color: "Green" }]
});

const trips = [
  {
    id: "trip-1",
    date: "2026-07-01",
    method: "Trolling",
    waterClarity: "Clear",
    launchTime: "08:00",
    linesPulledTime: "12:00",
    gearUsed: [
      { id: "line-chart", startTime: "08:00", endTime: "12:00", presentation: "dipsey-diver", dipseyDiverColor: "Purple", lureId: "chart", flasherId: "paddle", lureMinutes: 240, flasherMinutes: 240 },
      { id: "line-blue", startTime: "08:00", endTime: "12:00", presentation: "dipsey-diver", dipseyDiverColor: "Pink", lureId: "blue", lureMinutes: 240 }
    ],
    catches: [
      { id: "c1", setupLineId: "line-chart", time: "08:30", species: "Walleye" },
      { id: "c2", setupLineId: "line-chart", time: "09:00", species: "Walleye" },
      { id: "c3", setupLineId: "line-chart", time: "11:00", species: "Walleye" },
      { id: "c4", setupLineId: "line-blue", time: "11:30", species: "Walleye" }
    ],
    lostFish: [{ id: "l1", setupLineId: "line-blue", time: "09:30" }]
  },
  {
    id: "trip-2",
    date: "2026-07-02",
    method: "Trolling",
    waterClarity: "Stained",
    launchTime: "08:00",
    linesPulledTime: "10:00",
    gearUsed: [
      { id: "line-lower", startTime: "08:00", endTime: "10:00", presentation: "dipsey-diver", dipseyDiverColor: "purple", lureId: "chart-lower", lureMinutes: 120 }
    ],
    catches: [{ id: "c5", setupLineId: "line-lower", time: "09:15", species: "Walleye" }],
    lostFish: []
  }
];

const sources = {
  effortRecords: gearUseRecords(trips).filter((record) => record.source === "trip"),
  catchRecords: catchRecords(trips),
  lostRecords: lostFishRecords(trips)
};

const byName = (items) => new Map(items.map((item) => [item.name, item]));

const colors = byName(summarizeComparison(sources, "lureColor"));
assert.deepEqual([...colors.keys()].sort(), ["Blue/Silver", "Chartreuse"], "colors group case-insensitively");
assert.equal(colors.get("Chartreuse").fish, 4);
assert.equal(colors.get("Chartreuse").hours, 6);
assert.equal(colors.get("Chartreuse").trips, 2);
assert.equal(colors.get("Blue/Silver").fish, 1);
assert.equal(colors.get("Blue/Silver").lost, 1);
assert.equal(colors.get("Blue/Silver").landingPercentage, 0.5);
assert.equal(colors.get("Chartreuse").usageShare, 60);
assert.equal(colors.get("Chartreuse").catchShare, 80);

const families = byName(summarizeComparison(sources, "lureColorFamily"));
assert.equal(families.get("Chartreuse").fish, 4);
assert.equal(families.get("Glow").fish, 3, "glow flag joins the Glow family");
assert.equal(families.get("Blue").hours, 4);
assert.equal(families.get("Silver").hours, 4);
assert.equal(families.get("Blue").usageShare, 40, "multi-family lures do not inflate the time denominator");

const sizes = byName(summarizeComparison(sources, "lureSize"));
assert.deepEqual([...sizes.keys()].sort(), ["Magnum Spoon", "Standard Spoon"], "lures without a size are skipped");

const glow = byName(summarizeComparison(sources, "lureGlow"));
assert.equal(glow.get("Glow").fish, 3);
assert.equal(glow.get("Non-glow").fish, 2);

const dipsey = byName(summarizeComparison(sources, "dipseyColor"));
assert.equal(dipsey.get("Purple").fish, 4);
assert.equal(dipsey.get("Purple").hours, 6);
assert.equal(dipsey.get("Pink").fish, 1);
assert.equal(dipsey.get("Pink").lost, 1);

const flasherColors = byName(summarizeComparison(sources, "flasherColor"));
assert.equal(flasherColors.get("Green").fish, 3);
assert.equal(flasherColors.get("Green").hours, 4);

const species = summarizeComparison(sources, "species");
assert.equal(species[0].name, "Walleye");
assert.equal(species[0].hasUsableTime, false, "catch-only comparisons never claim a catch rate");

const split = summarizeComparison(sources, "lureColor", "timeOfDay");
const splitByName = byName(split);
assert.equal(splitByName.get("Chartreuse · Morning").fish, 3);
assert.equal(splitByName.get("Chartreuse · Morning").hours, 4);
assert.equal(splitByName.get("Chartreuse · Midday").fish, 1);
assert.equal(splitByName.get("Chartreuse · Midday").hours, 2);
assert.equal(splitByName.get("Blue/Silver · Midday").lost, 0);
assert.equal(splitByName.get("Blue/Silver · Morning").lost, 1);

const matrix = comparisonMatrix(split, summarizeComparison(sources, "lureColor"), { compareId: "lureColor", splitId: "timeOfDay", metric: "fishPerHour" });
assert.deepEqual(matrix.headers, ["Lure Color", "Morning", "Midday", "Overall"]);
const chartreuseRow = matrix.rows.find((row) => row[0] === "Chartreuse");
assert.equal(chartreuseRow[1].value, 0.75);
assert.match(String(chartreuseRow[1].html), /is-best/);
assert.match(String(chartreuseRow[1].html), /3 fish · 4 hr/);

const rows = comparisonRows(summarizeComparison(sources, "lureColor"), "Lure Color");
assert.equal(rows[0].length, 15);
assert.ok(["Thin", "Fair", "Strong"].includes(rows[0].at(-1)));

const highlights = comparisonHighlights(sources, ["lureColor", "dipseyColor", "species", "bladeType"]);
assert.deepEqual(highlights.map((row) => row[0]), ["Lure color", "Dipsey diver color"], "dimensions without timed data are skipped");
assert.equal(highlights[0][1], "Chartreuse");
assert.equal(highlights[0][2], "0.67/hr");
assert.equal(highlights[0][3], "+33.33%");
