const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = {
  localStorage: { getItem: () => null },
  storageKey: "fishing-logbook-v2",
  isTrollingTripRecord: () => false,
  formatTimelineDisplayTime: (value) => value,
  setupLineSideLabel: (value) => value || "",
  comboName: (value) => value || "",
  rodName: (value) => value || "",
  reelName: (value) => value || "",
  lureName: (value) => value || "",
  displaySentenceText: (value) => value,
  escapeHtml: (value) => String(value),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/trip-report.js", "utf8"), context);

const trip = {
  gearUsed: [{
    startTime: "3:33 PM",
    endTime: "8:00 PM",
    comboId: "Lake trout jigging 2",
    rodId: "Lake trout jigging rod 2",
    reelId: "Okuma Avenger #2",
    side: "",
    lineLabel: "",
    lureId: "",
    changeNote: "",
  }],
};
const html = context.renderReportSetupTable(trip);
const headers = [...html.matchAll(/<th[^>]*><span>(.*?)<\/span><\/th>/g)].map((match) => match[1]);

assert.deepEqual(headers, ["#", "Start", "End", "Combo", "Rod", "Reel"]);
assert.doesNotMatch(html, />Side<\/span>/);
assert.doesNotMatch(html, />Line<\/span>/);
assert.doesNotMatch(html, />Lure<\/span>/);
assert.doesNotMatch(html, />Change Note<\/span>/);

console.log("setup report hides columns that are empty for every row");
