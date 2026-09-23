const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/trolling-spread.js", "utf8"), context);

const inherited = vm.runInContext(`resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: true,
  ballDepth: "65",
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", ballDepth: "12" }]
  }
})`, context);
assert.equal(inherited.deepestRigger, true);
assert.equal(inherited.ballDepth, "65");

const noSetupDepthInheritance = vm.runInContext(`resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: false,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", deepestRigger: true, ballDepth: "12", speed: "2.1" }]
  }
})`, context);
assert.equal(noSetupDepthInheritance.deepestRigger, false);
assert.equal(noSetupDepthInheritance.ballDepth, "");
assert.equal(noSetupDepthInheritance.gpsSpeed, "");

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

assert.equal(vm.runInContext('getSpreadSlot({ lineSide: "Port", trollingMethod: "Downrigger" })', context), "portDownRigger");
assert.equal(vm.runInContext('getSpreadSlot({ lineSide: "port", trollingMethod: "downrigger" })', context), null);

console.log("trolling spread inheritance tests passed");
