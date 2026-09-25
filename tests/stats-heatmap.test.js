const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/stats-heatmap.js", "utf8"));

const model = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{ quantity: 3 }] },
  { date: "2026-09-14", catches: [{ quantity: 1 }] },
  { date: "2026-09-10", catches: [] },
  { date: "2026-02-30", catches: [{ quantity: 100 }] },
  { date: "2024-01-01", catches: [{ quantity: 50 }] }
], { today: new Date("2026-09-14T12:00:00") });

assert.equal(model.weeks.length, 53);
assert.equal(model.weeks.every((week) => week.length === 7), true);
assert.equal(model.weeks[0][0].date.getDay(), 0);
assert.equal(model.weeks[52][6].date.getDay(), 6);
assert.equal(model.weeks[52][1].key, "2026-09-14");
assert.equal(model.fishedDays, 2);
assert.equal(model.tripCount, 3);
assert.equal(model.fishCount, 4);

const septemberFourteenth = model.weeks.flat().find((day) => day.key === "2026-09-14");
assert.equal(septemberFourteenth.trips, 2);
assert.equal(septemberFourteenth.fish, 4);
assert.equal(septemberFourteenth.level, 5);
assert.equal(septemberFourteenth.isToday, true);
assert.equal(model.maxFish, 4);

const septemberTenth = model.weeks.flat().find((day) => day.key === "2026-09-10");
assert.equal(septemberTenth.level, 0);
const markup = StatsActivityHeatmap.render(model);
assert.match(markup, /Fishing activity over the last 12 months/);
assert.match(markup, /0 fish.*4 fish/);
assert.match(markup, /is-today[^>]*aria-current="date"/);
assert.match(markup, /tabindex="0"[^>]*September 14, 2026/);
const emptyDayTag = markup.match(/<span[^>]*September 13, 2026[^>]*>/)[0];
assert.doesNotMatch(emptyDayTag, /tabindex/);

const dynamicScale = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{ quantity: 10 }] },
  { date: "2026-09-13", catches: [{ quantity: 5 }] },
  { date: "2026-09-12", catches: [{ quantity: 1 }] }
], { today: new Date("2026-09-14T12:00:00") });
assert.equal(dynamicScale.maxFish, 10);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-14").level, 5);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-13").level, 3);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-12").level, 1);
assert.match(StatsActivityHeatmap.render(dynamicScale), /0 fish.*10 fish/);

const quantityParity = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{}, { quantity: "" }, { quantity: null }, { quantity: "bad" }] }
], { today: new Date("2026-09-14T12:00:00") });
assert.equal(quantityParity.fishCount, 2);

const yearBoundary = StatsActivityHeatmap.build([], {
  today: new Date("2027-01-15T12:00:00")
});
const januaryLabels = yearBoundary.months.filter((month) => month.key.endsWith("-01"));
assert.equal(januaryLabels.length, 2);
assert.deepEqual(januaryLabels.map((month) => month.key), ["2026-01", "2027-01"]);
assert.notEqual(januaryLabels[0].column, januaryLabels[1].column);
console.log("stats heatmap tests passed");
