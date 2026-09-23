const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: { randomUUID: () => "generated-id" },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { protocol: "file:" },
  mergePeople: (people = []) => people,
  isUsableCoordinates: value => Number.isFinite(Number(value?.latitude))
    && Number.isFinite(Number(value?.longitude))
    && !(Number(value.latitude) === 0 && Number(value.longitude) === 0)
};

context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-config.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const normalized = context.validateState({
  ...vm.runInContext("structuredClone(defaults)", context),
  settings: {
    ...vm.runInContext("structuredClone(defaults.settings)", context),
    checklists: [{ id: "checklist-1", name: "Launch", syncTag: "mobile", items: [{ id: "item-1", label: "Net", done: false, icon: "net" }] }],
    trollingSpreads: [{ id: "spread-1", name: "Morning", sourceTag: "mobile", spread: [{ comboId: "combo-1", side: "port", presentation: "Downrigger", note: "inside" }] }]
  },
  waterClarities: ["Muddy"],
  trips: [{
    id: "trip",
    catches: [{ ballSpeed: 0, ballTemp: 0 }],
    lostFish: [{ ballSpeed: 0, ballTemp: 0 }],
    gearUsed: [],
    people: [],
    notePhotos: []
  }]
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

vm.runInContext(fs.readFileSync("static/js/trip-editor.js", "utf8"), context);
const mergedPeople = context.mergePeople(
  [{ id: "person-1", name: "Alex", profileColor: "blue" }],
  [{ id: "person-1", name: "Alex", mobileTag: "angler" }]
);
assert.strictEqual(mergedPeople[0].profileColor, "blue");
assert.strictEqual(mergedPeople[0].mobileTag, "angler");

console.log("v2 validation preserves numeric zeros and additive v2 properties");
