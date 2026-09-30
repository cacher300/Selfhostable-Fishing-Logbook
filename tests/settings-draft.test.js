import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { chopRangesFromDraft, predefinedFieldsFromDraft, savedSetupFromDraft, trollingSpreadFromDraft } = await import("../static/js/settings-draft.js");

const fields = predefinedFieldsFromDraft([
  { key: "species" },
  { key: "trollingPresentations", choice: true }
], {
  species: [" Salmon ", "Trout"],
  trollingPresentations: [{ value: "", label: " High Diver " }, { value: "custom", label: "Custom" }]
});
assert.deepEqual(fields.species, ["Salmon", "Trout"]);
assert.deepEqual(fields.trollingPresentations, [{ value: "high-diver", label: "High Diver" }, { value: "custom", label: "Custom" }]);

const ranges = chopRangesFromDraft([
  { label: " Calm ", maxFeet: "1.5" },
  { id: "rough", label: "Rough", maxFeet: null }
]);
assert.equal(ranges[0].id, "chop-1");
assert.equal(ranges[0].maxFeet, 1.5);
assert.equal(ranges[1].maxFeet, null);

const setup = savedSetupFromDraft({ id: "setup-1", method: " Casting ", name: "  Jigs ", rows: [{ comboId: " combo-1 " }] });
assert.equal(setup.method, "Casting");
assert.equal(setup.name, "Jigs");
assert.equal(setup.rows[0].comboId, "combo-1");

const spread = trollingSpreadFromDraft({ id: "spread-1", name: "  Boards ", spread: [
  { comboId: "combo-1", side: "port", presentation: "High Diver", dipseyDiverColor: "Green" },
  { comboId: "combo-2", side: "center", presentation: "Downrigger", dipseyDiverColor: "Purple" }
] });
assert.equal(spread.name, "Boards");
assert.equal(spread.spread[0].dipseyDiverColor, "Green");
assert.equal(spread.spread[1].dipseyDiverColor, "");
