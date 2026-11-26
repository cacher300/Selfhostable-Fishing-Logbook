import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { StatsActivityHeatmap } = await import("../static/js/stats-heatmap.js");

const model = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{ quantity: 3 }] },
  { date: "2026-09-14", catches: [{ quantity: 1 }] },
  { date: "2026-09-10", catches: [] },
  { date: "2026-02-30", catches: [{ quantity: 100 }] },
  { date: "2024-01-01", catches: [{ quantity: 50 }] },
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
const markup = String(StatsActivityHeatmap.render(model));
assert.match(markup, /Fishing activity over the last 12 months/);
assert.match(markup, /0 fish.*4 fish/);
assert.match(markup, /is-today[^>]*aria-current="date"/);
assert.match(markup, /tabindex="0"[^>]*September 14, 2026/);
const emptyDayTag = markup.match(/<span[^>]*September 13, 2026[^>]*>/)[0];
assert.doesNotMatch(emptyDayTag, /tabindex/);

const dynamicScale = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{ quantity: 10 }] },
  { date: "2026-09-13", catches: [{ quantity: 5 }] },
  { date: "2026-09-12", catches: [{ quantity: 1 }] },
], { today: new Date("2026-09-14T12:00:00") });
assert.equal(dynamicScale.maxFish, 10);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-14").level, 5);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-13").level, 3);
assert.equal(dynamicScale.weeks.flat().find((day) => day.key === "2026-09-12").level, 1);
assert.match(String(StatsActivityHeatmap.render(dynamicScale)), /0 fish.*10 fish/);

const quantityParity = StatsActivityHeatmap.build([
  { date: "2026-09-14", catches: [{}, { quantity: "" }, { quantity: null }, { quantity: "bad" }] },
], { today: new Date("2026-09-14T12:00:00") });
assert.equal(quantityParity.fishCount, 2);

const yearBoundary = StatsActivityHeatmap.build([], {
  today: new Date("2027-01-15T12:00:00"),
});
const januaryLabels = yearBoundary.months.filter((month) => month.key.endsWith("-01"));
assert.equal(januaryLabels.length, 2);
assert.deepEqual(januaryLabels.map((month) => month.key), ["2026-01", "2027-01"]);
assert.notEqual(januaryLabels[0].column, januaryLabels[1].column);

const history = [
  {date:"2024-02-29",catches:[{quantity:4}]}, {date:"2024-02-29",catches:[]},
  {date:"2024-03-01",catches:[]}, {date:"2024-03-02",catches:[{quantity:8}]}
];
const opts = {today:new Date(2026,5,1),bounds:["2024-02-29","2024-03-01"]};
for (const [mode,summary,values] of [["days","2 days fished",[1,1]],["trips","3 trips",[2,1]],["fish","4 fish landed",[4,0]]]) {
  const view = StatsActivityHeatmap.build(history,{...opts,mode});
  assert.equal(view.summary,summary);
  assert.deepEqual(view.weeks.flat().filter(d => !d.outside).map(d=>d.value),values);
  assert.ok(view.weeks.flat().every(d=>!d.isToday));
}
const acrossYears = [...history,{date:"2012-02-29",catches:[{quantity:3}]},{date:"2028-02-29"}];
for (const [mode,expected,total] of [["days",2,4],["trips",3,5],["fish",7,15]]) {
  const all = StatsActivityHeatmap.build(acrossYears,{...opts,bounds:null,mode});
  assert.equal(all.layout,"month-day");
  const cells = all.rows.flatMap(row => row.cells);
  assert.equal(cells.length,366);
  assert.ok(!cells.some(c => c.key === "02-30" || c.key === "04-31"));
  const leapDay = cells.find(c => c.key === "02-29");
  assert.deepEqual([leapDay.days,leapDay.trips,leapDay.fish,leapDay.value],[2,3,7,expected]);
  assert.equal(all.maxValue,Math.max(...cells.map(c => c.value)));
  assert.equal(cells.reduce((n,c) => n+c.value,0),total);
}
const long = StatsActivityHeatmap.build(acrossYears,{...opts,bounds:["2012-03-01","2024-02-29"],mode:"trips"});
assert.equal(long.layout,"month-day");
assert.equal(long.rows[1].cells[28].value,2);
assert.equal(long.tripCount,2);
const skunk = StatsActivityHeatmap.build([{date:"2024-03-01",catches:[]}],{...opts,bounds:null,mode:"fish"});
assert.match(String(StatsActivityHeatmap.render(skunk)),/No fish landed in this selection/);
assert.match(String(StatsActivityHeatmap.render(skunk)),/March 1: 1 day fished, 1 trip, 0 fish landed/);

const february = (bounds,mode) => StatsActivityHeatmap.build(acrossYears,{...opts,bounds,month:"February",mode});
for (const [mode,total] of [["days",2],["trips",3],["fish",7]]) {
  const all = february(null,mode);
  assert.equal(all.rows.length,1);
  assert.equal(all.dayCount,29);
  assert.ok(all.rows[0].cells.every(c => c.key.startsWith("02-")));
  assert.equal(all.rows[0].cells[28].value,total);
}
assert.equal(february(["2025-01-01","2026-05-31"],"days").dayCount,28);
const partial = february(["2024-02-27","2024-03-03"],"trips");
assert.deepEqual(partial.weeks.flat().filter(d=>!d.outside).map(d=>d.key),["2024-02-27","2024-02-28","2024-02-29"]);
const noOverlap = february(["2024-03-01","2024-03-31"],"days");
assert.equal(noOverlap.weeks.length,0);
assert.match(String(StatsActivityHeatmap.render(noOverlap)),/February is outside the selected date range/);
