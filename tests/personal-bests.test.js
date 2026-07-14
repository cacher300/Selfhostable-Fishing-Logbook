const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  state: {
    trips: [
      {
        id: "trip-1",
        date: "2026-05-01",
        catches: [
          { species: "Lake Trout", weight: "8", length: "26" },
          { species: "Walleye", weight: "4" }
        ]
      },
      {
        id: "trip-2",
        date: "2026-05-10",
        catches: [
          { species: "Lake Trout", weight: "7", length: "28" },
          { species: "Lake Trout", weight: "10.5", length: "29" },
          { species: "Walleye", weight: "4", length: "23" }
        ]
      }
    ]
  },
  activePersonalBestsFilters: { year: "All years", month: "All months" },
  resolveTripLineRecord: (record) => record,
  parseFirstNumber: (value) => {
    const match = String(value || "").match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  },
  trimNumber: (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  unitSymbol: (key) => key === "fishWeight" ? "lb" : "in",
  escapeHtml: (value) => String(value),
  formatDate: (value) => value || "",
  lureName: () => "",
  previewImage: () => "",
  isVideoMedia: () => false,
  mediaMarkup: () => "",
  els: {}
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/personal-bests.js", "utf8"), context);

const records = context.filteredPersonalBestRecords();
const progressions = context.personalBestProgressions(records);
const lakeTrout = progressions.find((item) => item.species === "Lake Trout");
const walleye = progressions.find((item) => item.species === "Walleye");

assert.equal(records.length, 5);
assert.equal(lakeTrout.milestones.length, 2);
assert.deepEqual(lakeTrout.milestones.map((item) => item.record.weight), ["8", "10.5"]);
assert.equal(walleye.milestones.length, 2);
assert.deepEqual(walleye.milestones.map((item) => item.record.length || ""), ["", "23"]);
assert.equal(context.personalBestImprovementText(lakeTrout.milestones[1].record, lakeTrout.milestones[1].previous), "+2.5 lb");

console.log("personal best progression tests passed");
