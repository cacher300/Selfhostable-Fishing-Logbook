import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");
const { validateState } = await import("../static/js/app-normalization.js");
const { mergePeople } = await import("../static/js/trip-editor.js");

const normalized = validateState({
  ...structuredClone(defaults),
  settings: {
    ...structuredClone(defaults.settings),
    checklists: [{ id: "checklist-1", name: "Launch", syncTag: "mobile", items: [{ id: "item-1", label: "Net", done: false, icon: "net" }] }],
    trollingSpreads: [{ id: "spread-1", name: "Morning", sourceTag: "mobile", spread: [{ comboId: "combo-1", side: "port", presentation: "High Diver", dipseyDiverColor: "Purple", note: "inside" }] }],
  },
  waterClarities: ["Muddy"],
  trips: [{
    id: "trip",
    catches: [{ ballSpeed: 0, ballTemp: 0 }],
    lostFish: [{ ballSpeed: 0, ballTemp: 0 }],
    gearUsed: [],
    people: [],
    notePhotos: [],
  }],
});

assert.strictEqual(normalized.trips[0].catches[0].ballSpeed, 0);
assert.strictEqual(normalized.trips[0].catches[0].ballTemp, 0);
assert.strictEqual(normalized.trips[0].lostFish[0].ballSpeed, 0);
assert.strictEqual(normalized.trips[0].lostFish[0].ballTemp, 0);
assert.strictEqual(normalized.waterClarities.includes("Algae Bloom"), false);

assert.strictEqual(normalized.settings.checklists[0].syncTag, "mobile");
assert.strictEqual(normalized.settings.checklists[0].items[0].icon, "net");
assert.strictEqual(normalized.settings.trollingSpreads[0].sourceTag, "mobile");
assert.strictEqual(normalized.settings.trollingSpreads[0].spread[0].note, "inside");
assert.strictEqual(normalized.settings.trollingSpreads[0].spread[0].dipseyDiverColor, "Purple");

const mergedPeople = mergePeople(
  [{ id: "person-1", name: "Alex", profileColor: "blue" }],
  [{ id: "person-1", name: "Alex", mobileTag: "angler" }],
);
assert.strictEqual(mergedPeople[0].profileColor, "blue");
assert.strictEqual(mergedPeople[0].mobileTag, "angler");
