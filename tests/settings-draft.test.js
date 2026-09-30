import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const {
  checklistDraftFromSettings,
  checklistsFromDraft,
  chopRangesDraftFromState,
  chopRangesFromDraft,
  locationsFromDraft,
  preferencesDraftFromSettings,
  preferencesFromDraft,
  predefinedFieldsDraftFromState,
  predefinedFieldsFromDraft,
  savedSetupFromDraft,
  speciesMapColorsDraftFromSettings,
  speciesMapColorsFromDraft,
  trollingSpreadFromDraft,
  unitsDraftFromSettings,
  unitsFromDraft
} = await import("../static/js/settings-draft.js");

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

const source = {
  species: ["Walleye"],
  trollingPresentations: [{ value: "downrigger", label: "Downrigger", mobileKey: "dr" }],
  settings: {
    theme: "dark",
    timeFormat: "12",
    defaultHomeLake: "Erie",
    hasFishHawk: true,
    defaultPeople: ["person-1"],
    defaultSavedSetupIds: { Casting: "setup-1" },
    defaultTrollingSpreadId: "spread-1",
    units: { depth: "m", speed: "kph" },
    speciesMapColors: { Walleye: "#123456", mobile: "#abcdef" },
    checklists: [{
      id: "list-1",
      name: "Launch",
      mobileTag: "keep",
      items: [{ id: "item-1", label: "Keys", done: true, icon: "key" }]
    }]
  },
  chopRanges: [
    { id: "calm", label: "Calm", maxFeet: 1, additive: "x" },
    { id: "rough", label: "Rough", maxFeet: null }
  ],
  spots: [{ id: "spot-1", name: "Rock", radiusMeters: 100, coordinates: { latitude: 1, longitude: 2 }, mobile: true }]
};

const predefinedDraft = predefinedFieldsDraftFromState([
  { key: "species" },
  { key: "trollingPresentations", choice: true }
], source);
assert.deepEqual(predefinedFieldsFromDraft([
  { key: "species" },
  { key: "trollingPresentations", choice: true }
], predefinedDraft), {
  species: source.species,
  trollingPresentations: source.trollingPresentations
});
assert.deepEqual(chopRangesFromDraft(chopRangesDraftFromState(source.chopRanges), source.chopRanges), source.chopRanges);

const preferencesDraft = preferencesDraftFromSettings(source.settings);
const preferencesRoundTrip = preferencesFromDraft(preferencesDraft, source.settings);
for (const key of ["theme", "timeFormat", "defaultHomeLake", "hasFishHawk", "defaultPeople", "defaultSavedSetupIds", "defaultTrollingSpreadId"]) {
  assert.deepEqual(preferencesRoundTrip[key], source.settings[key]);
}
assert.deepEqual(unitsFromDraft(unitsDraftFromSettings(source.settings), source.settings.units), {
  ...unitsFromDraft({}, {}),
  ...source.settings.units
});
assert.deepEqual(speciesMapColorsFromDraft(speciesMapColorsDraftFromSettings(source.settings), source.settings.speciesMapColors), source.settings.speciesMapColors);
assert.deepEqual(checklistsFromDraft(checklistDraftFromSettings(source.settings), source.settings.checklists), source.settings.checklists);
assert.deepEqual(locationsFromDraft(source.spots, source.spots), source.spots);
