const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/trolling-spread.js", "utf8"), context);

const inherited = vm.runInContext(`resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: false,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", deepestRigger: true }]
  }
})`, context);
assert.equal(inherited.deepestRigger, true);

const legacy = vm.runInContext(`resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: true,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger" }]
  }
})`, context);
assert.equal(legacy.deepestRigger, true);

const cheater = vm.runInContext(`resolveTripLineRecord({
  setupLineId: "line-1",
  setupLineTarget: "cheater",
  deepestRigger: true,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", deepestRigger: true }]
  }
})`, context);
assert.equal(cheater.presentation, "Cheater");
assert.equal(cheater.deepestRigger, false);

console.log("trolling spread inheritance tests passed");
