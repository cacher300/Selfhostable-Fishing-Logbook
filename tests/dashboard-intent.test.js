import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body>
  <input id="searchInput" value="">
  <select id="targetFilter"><option selected>All targets</option></select>
  <select id="methodFilter"><option selected>All methods</option></select>
  <select id="yearFilter"><option selected>All years</option></select>
  <select id="sortSelect"></select>
  <div id="tripTable"></div>
  <div id="emptyState"></div>
</body></html>`);

const { setState, ui } = await import("../static/js/app-state.js");
const { renderTrips } = await import("../static/js/dashboard.js");

ui.activeTripSort = { key: "date", direction: "desc" };
setState({
  trips: [
    { id: "serious", date: "2026-09-22", location: "Lake", targetSpecies: "Chinook Salmon", method: "Trolling", intent: "serious", tripRating: 3, catches: [], lostFish: [] },
    { id: "experimental", date: "2026-09-21", location: "Lake", targetSpecies: "Lake Trout", method: "Trolling", intent: "experimental", tripRating: 3, catches: [], lostFish: [] },
  ],
});

renderTrips();
const rows = [...document.querySelectorAll("#tripTable .table-row:not(.header)")];
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].innerHTML.includes('class="target-pill"'), false);
assert.strictEqual(rows[0].innerHTML.includes('class="trip-target-text">Chinook Salmon</span>'), true);
assert.strictEqual(rows[0].innerHTML.includes(">Serious<"), false);
assert.strictEqual(rows[0].innerHTML.includes(">Experimental<"), false);
assert.strictEqual(rows[1].innerHTML.includes(">Serious<"), false);
assert.strictEqual(rows[1].innerHTML.includes(">Experimental<"), true);
