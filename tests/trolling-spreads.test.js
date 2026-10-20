import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { currentTrollingSpreads, trollingSpreadById } = await import("../static/js/app-normalization.js");

const spreads = [
  { id: "one", name: "One Man Spread", sourceTag: "mobile", spread: [{ comboId: "combo-1", side: "port", presentation: "High Diver", dipseyDiverColor: "Purple", note: "inside" }] },
];
setState({ settings: { trollingSpreads: spreads } });

assert.strictEqual(currentTrollingSpreads(), spreads);
assert.strictEqual(trollingSpreadById("one"), spreads[0].spread);
assert.equal(currentTrollingSpreads()[0].name, "One Man Spread");
assert.equal(currentTrollingSpreads()[0].sourceTag, "mobile");
assert.equal(currentTrollingSpreads()[0].spread[0].note, "inside");
assert.equal(currentTrollingSpreads()[0].spread[0].dipseyDiverColor, "Purple");
assert.equal(currentTrollingSpreads()[0].spread[0].side, "port", "ordinary v2 reads must not rewrite casing or extensions");
