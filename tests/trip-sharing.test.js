const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const controlIds = [
  "shareTripTheme", "shareTripHeadline", "shareTripSubtitle", "shareTripAccent",
  "shareTripBackground", "shareTripTextColor", "shareTripCardBackground", "shareTripPhoto",
  "shareStatLanded", "shareStatMissed", "shareStatBiggest", "shareStatRate", "shareStatHours",
  "shareStatFow", "shareShowTimeline", "shareIncludeMisses", "shareShowConditions",
  "shareShowHighlights", "shareShowNotes", "shareShowBestLure", "shareShowBestFlasher"
];

const controls = Object.fromEntries(controlIds.map((id) => [id, {
  checked: id.startsWith("shareStat"),
  value: id === "shareTripTheme" ? "deep-water" : id === "shareTripHeadline" ? "Trip report" : "",
  addEventListener: () => {}
}]));

const context = {
  console,
  document: {
    querySelector(selector) {
      return controls[selector.startsWith("#") ? selector.slice(1) : selector] || null;
    },
    querySelectorAll: () => []
  },
  window: {},
  navigator: {},
  state: { settings: {}, lures: [], flashers: [] },
  els: {},
  escapeHtml: (value) => String(value),
  displayTitleText: (value) => String(value),
  displayStoredMeasurement: (value) => `${value} units`,
  tripHours: () => 0,
  trimNumber: (value) => String(value),
  formatDate: (value) => String(value || ""),
  formatTimelineDisplayTime: (value) => String(value),
  displaySentenceText: (value) => String(value),
  previewImage: () => "",
  originalMediaUrl: () => "",
  lureName: () => "",
  flasherName: () => ""
};

context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/trip-sharing.js", "utf8"), context);

const unmeasuredTrip = { date: "2026-09-22", launch: "Harbour", catches: [], lostFish: [] };
const unmeasuredReport = context.shareReportHtml(unmeasuredTrip);
const unmeasuredMetrics = unmeasuredReport.match(/<section class="report-metrics"[^>]*>([\s\S]*?)<\/section>/)?.[1] || "";
assert.strictEqual((unmeasuredMetrics.match(/<div/g) || []).length, 5);
assert.strictEqual(unmeasuredMetrics.includes("Biggest fish"), false);

const measuredTrip = { ...unmeasuredTrip, catches: [{ weight: 2.5, species: "Trout" }] };
const measuredReport = context.shareReportHtml(measuredTrip);
const measuredMetrics = measuredReport.match(/<section class="report-metrics"[^>]*>([\s\S]*?)<\/section>/)?.[1] || "";
assert.strictEqual((measuredMetrics.match(/<div/g) || []).length, 6);
assert.strictEqual(measuredMetrics.includes("Biggest fish"), true);

const timingReport = context.shareTextReport({
  ...unmeasuredTrip,
  launchTime: "08:00",
  linesPulledTime: "12:00"
});
assert.strictEqual(timingReport.includes("08:00"), true);
assert.strictEqual(timingReport.includes("12:00"), true);

console.log("share report omits unlogged biggest-fish metric and preserves logged metric");
