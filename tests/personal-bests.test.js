import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { activePersonalBestsFilters, setState } = await import("../static/js/app-state.js");
const { filteredPersonalBestRecords, personalBestImprovementText, personalBestItems, personalBestProgressions } = await import("../static/js/personal-bests.js");

setState({
  trips: [
    {
      id: "trip-1",
      date: "2026-05-01",
      catches: [
        { species: "Lake Trout", weight: "8", length: "26" },
        { species: "Walleye", weight: "4" },
      ],
    },
    {
      id: "trip-2",
      date: "2026-05-10",
      catches: [
        { species: "Lake Trout", weight: "7", length: "28" },
        { species: "Lake Trout", weight: "10.5", length: "29" },
        { species: "Walleye", weight: "4", length: "23" },
      ],
    },
  ],
});
activePersonalBestsFilters.year = "All years";
activePersonalBestsFilters.month = "All months";
activePersonalBestsFilters.rankBy = "weight";

const records = filteredPersonalBestRecords();
const bestItems = personalBestItems();
const progressions = personalBestProgressions(records);
const lakeTrout = progressions.find((item) => item.species === "Lake Trout");
const walleye = progressions.find((item) => item.species === "Walleye");

assert.equal(records.length, 5);
assert.deepEqual(bestItems.map((item) => item.species), ["Lake Trout", "Walleye"]);
assert.equal(lakeTrout.milestones.length, 2);
assert.deepEqual(lakeTrout.milestones.map((item) => item.record.weight), ["8", "10.5"]);
assert.equal(walleye.milestones.length, 2);
assert.deepEqual(walleye.milestones.map((item) => item.record.length || ""), ["", "23"]);
assert.equal(personalBestImprovementText(lakeTrout.milestones[0].record, null), "First personal best");
assert.equal(personalBestImprovementText(lakeTrout.milestones[1].record, lakeTrout.milestones[1].previous), "+2.5 lb");
