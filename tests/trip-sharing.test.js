import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

const controlIds = [
  "shareTripTheme", "shareTripHeadline", "shareTripSubtitle", "shareTripAccent",
  "shareTripBackground", "shareTripTextColor", "shareTripCardBackground", "shareTripPhoto",
  "shareStatLanded", "shareStatMissed", "shareStatBiggest", "shareStatRate", "shareStatHours",
  "shareStatFow", "shareShowTimeline", "shareIncludeMisses", "shareShowConditions",
  "shareShowHighlights", "shareShowNotes", "shareShowBestLure", "shareShowBestFlasher",
];
installBrowserEnv(`<!doctype html><html><body>
  ${controlIds.map((id) => `<input id="${id}">`).join("")}
</body></html>`);
for (const id of controlIds) {
  const control = document.querySelector(`#${id}`);
  control.checked = id.startsWith("shareStat");
  control.value = id === "shareTripTheme" ? "deep-water" : id === "shareTripHeadline" ? "Trip report" : "";
}

const { setState } = await import("../static/js/app-state.js");
setState({ settings: {}, lures: [], flashers: [] });
const { shareReportHtml, shareTextReport } = await import("../static/js/trip-sharing.js");

const unmeasuredTrip = { date: "2026-09-22", launch: "Harbour", catches: [], lostFish: [] };
const unmeasuredReport = shareReportHtml(unmeasuredTrip);
const unmeasuredMetrics = unmeasuredReport.match(/<section class="report-metrics"[^>]*>([\s\S]*?)<\/section>/)?.[1] || "";
assert.strictEqual((unmeasuredMetrics.match(/<div/g) || []).length, 5);
assert.strictEqual(unmeasuredMetrics.includes("Biggest fish"), false);

const measuredTrip = { ...unmeasuredTrip, catches: [{ weight: 2.5, species: "Trout" }] };
const measuredReport = shareReportHtml(measuredTrip);
const measuredMetrics = measuredReport.match(/<section class="report-metrics"[^>]*>([\s\S]*?)<\/section>/)?.[1] || "";
assert.strictEqual((measuredMetrics.match(/<div/g) || []).length, 6);
assert.strictEqual(measuredMetrics.includes("Biggest fish"), true);

const timingReport = shareTextReport({
  ...unmeasuredTrip,
  launchTime: "08:00",
  linesPulledTime: "12:00",
});
assert.match(timingReport, /8:00|08:00/);
assert.strictEqual(timingReport.includes("12:00"), true);
