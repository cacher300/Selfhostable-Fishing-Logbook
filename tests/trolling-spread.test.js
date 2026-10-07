import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { getSpreadSlot, resolveTripLineRecord } = await import("../static/js/trolling-spread.js");

const inherited = resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: true,
  ballDepth: "65",
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", ballDepth: "12" }],
  },
});
assert.equal(inherited.deepestRigger, true);
assert.equal(inherited.ballDepth, "65");

const noSetupDepthInheritance = resolveTripLineRecord({
  setupLineId: "line-1",
  deepestRigger: false,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", deepestRigger: true, ballDepth: "12", speed: "2.1" }],
  },
});
assert.equal(noSetupDepthInheritance.deepestRigger, false);
assert.equal(noSetupDepthInheritance.ballDepth, "");
assert.equal(noSetupDepthInheritance.gpsSpeed, "");

const cheater = resolveTripLineRecord({
  setupLineId: "line-1",
  setupLineTarget: "cheater",
  deepestRigger: true,
  trip: {
    method: "Trolling",
    gearUsed: [{ id: "line-1", presentation: "Downrigger", deepestRigger: true }],
  },
});
assert.equal(cheater.presentation, "Cheater");
assert.equal(cheater.deepestRigger, false);

assert.equal(getSpreadSlot({ lineSide: "Port", trollingMethod: "Downrigger" }), "portDownRigger");
assert.equal(getSpreadSlot({ lineSide: "port", trollingMethod: "downrigger" }), null);
