import assert from "node:assert/strict";
import { isPointInsideGreatLake } from "../static/js/great-lakes-boundaries.js";

for (const [latitude, longitude] of [[47.7, -87.5], [43.8, -87.1], [44.8, -82.8], [42.2, -81.7], [43.7, -77.9], [41.651, -82.822], [43.6, -77.2]]) {
  assert.equal(isPointInsideGreatLake({ latitude, longitude }), true, `Lake point ${latitude}, ${longitude}`);
}
for (const [latitude, longitude] of [[42.98, -81.25], [43.65, -79.38], [42.4, -82.6], [0, 0], [91, -80]]) {
  assert.equal(isPointInsideGreatLake({ latitude, longitude }), false, `Excluded point ${latitude}, ${longitude}`);
}
assert.equal(isPointInsideGreatLake(null), false);
assert.equal(isPointInsideGreatLake({ latitude: "", longitude: null }), false);
