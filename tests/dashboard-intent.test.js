const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const rows = [];
const context = {
  console,
  activeTripSort: { key: "date", direction: "desc" },
  state: {
    trips: [
      { id: "serious", date: "2026-09-22", location: "Lake", targetSpecies: "Chinook Salmon", method: "Trolling", intent: "serious", tripRating: 3, catches: [], lostFish: [] },
      { id: "experimental", date: "2026-09-21", location: "Lake", targetSpecies: "Lake Trout", method: "Trolling", intent: "experimental", tripRating: 3, catches: [], lostFish: [] }
    ]
  },
  els: {
    searchInput: { value: "" },
    targetFilter: { value: "All targets" },
    methodFilter: { value: "All methods" },
    yearFilter: { value: "All years" },
    sortSelect: { value: "" },
    tripTable: { innerHTML: "", append: (row) => rows.push(row) },
    emptyState: { classList: { toggle: () => {} } }
  },
  document: {
    createElement: () => ({ dataset: {}, className: "", innerHTML: "" })
  },
  escapeHtml: (value) => String(value),
  calculateHours: () => 0,
  parseFirstNumber: (value) => Number(value),
  trimNumber: (value) => String(value),
  resolveTripLineRecord: (record) => record,
  lureName: () => "",
  flasherName: () => "",
  tripIntent: (trip) => trip.intent === "experimental" ? "experimental" : "serious",
  tripRatingValue: (trip) => trip.tripRating,
  tripRatingClass: () => "good",
  tripRatingLabel: () => "Good"
};

context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/dashboard.js", "utf8"), context);
context.renderTrips();

assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].innerHTML.includes('class="target-pill"'), false);
assert.strictEqual(rows[0].innerHTML.includes('class="trip-target-text">Chinook Salmon</span>'), true);
assert.strictEqual(rows[0].innerHTML.includes(">Serious<"), false);
assert.strictEqual(rows[0].innerHTML.includes(">Experimental<"), false);
assert.strictEqual(rows[1].innerHTML.includes(">Serious<"), false);
assert.strictEqual(rows[1].innerHTML.includes(">Experimental<"), true);

console.log("trip rows show intent only when experimental");
