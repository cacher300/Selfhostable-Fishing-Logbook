const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
vm.runInThisContext(fs.readFileSync("static/js/stats-analytics.js", "utf8"));

const strong = StatsAnalytics.performanceMetrics({ landed: 4, lost: 1, missed: 1, hours: 8, trips: 4, totalHours: 20, totalLanded: 10 });
assert.equal(strong.landedRate, 0.5);
assert.equal(strong.strikeRate, 0.75);
assert.equal(strong.landingSuccess, 0.8);
assert.equal(strong.timeShare, 0.4);
assert.equal(strong.fishShare, 0.4);
assert.equal(strong.efficiencyIndex, 1);
assert.equal(strong.confidence, "Medium");

const missing = StatsAnalytics.performanceMetrics({ landed: 2, hours: null, trips: 2, totalHours: 10, totalLanded: 2 });
assert.equal(missing.landedRate, null);
assert.equal(missing.timeShare, null);
assert.equal(missing.efficiencyIndex, null);
assert.equal(StatsAnalytics.safeDivide(1, 0), null);
assert.equal(StatsAnalytics.confidence(15, 6), "High");
console.log("stats analytics tests passed");
