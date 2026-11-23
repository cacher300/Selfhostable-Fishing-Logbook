import assert from "node:assert/strict";
import { test } from "node:test";
import { rankLuresByTripHistory } from "../static/js/lure-history.js";

const today = new Date(2025, 9, 20);
const context = { id: "current", date: "2025-10-20", launchTime: "10:00", locationId: "lake", location: "Test Lake", method: "Casting", targetSpecies: "Walleye" };

function trip(lureId, overrides = {}) {
  return { ...context, id: `${lureId}-trip`, date: "2025-09-10", gearUsed: [{ lureId }], ...overrides };
}

test("lure suggestions weigh waterbody, method, and target species before unrelated popularity", () => {
  const ids = ["exact", "lake-method", "lake-species", "lake", "elsewhere", "recent"];
  const history = [
    trip("exact", { date: "2024-09-10" }),
    trip("lake-method", { targetSpecies: "Pike" }),
    trip("lake-species", { method: "Jigging" }),
    trip("lake", { locationId: "", location: " test lake ", targetSpecies: "Pike", method: "Jigging" }),
    ...Array.from({ length: 12 }, (_, index) => trip("elsewhere", { id: `away-${index}`, locationId: "elsewhere" })),
    trip("recent", { date: "2025-10-19", locationId: "elsewhere", method: "Jigging", targetSpecies: "Pike" }),
  ];
  assert.deepEqual(rankLuresByTripHistory(ids.map(id => ({ id })), history, context, today).map(lure => lure.id), ids);
});

test("recommendations count separate trips, favor recency, and exclude ineligible or unavailable records", () => {
  const lures = ["frequent", "recent", "repeat", "catch", "lost", "bead", "draft", "active", "future", "later", "self"].map(id => ({ id }));
  const history = [
    trip("frequent"),
    trip("frequent", { id: "next", date: "2025-09-11" }),
    trip("recent", { date: "2025-10-19" }),
    trip("repeat", { catches: Array.from({ length: 10 }, () => ({ lureId: "repeat" })) }),
    trip("removed", { catches: [{ lureId: "catch", beadCount: 2, secondBeadLureId: "bead" }], lostFish: [{ lureId: "lost" }] }),
    trip("draft", { isDraft: true }),
    trip("active", { liveStatus: "active" }),
    trip("future", { date: "2025-10-21" }),
    trip("later", { date: context.date, launchTime: "14:00" }),
    trip("self", { id: context.id }),
  ];
  const result = rankLuresByTripHistory(lures, history, context, today).map(lure => lure.id);
  assert.deepEqual(result.slice(0, 2), ["frequent", "recent"]);
  assert.deepEqual(result.slice(2).sort(), ["bead", "catch", "lost", "repeat"]);
});
