const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let nextId = 0;
const context = {
  console,
  structuredClone,
  defaults: {},
  storageKey: "boat-layout-test",
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  createId: () => `generated-${nextId += 1}`
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-state.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const normalized = vm.runInContext(`normalizeBoatLayout({
  name: "  Lake boat  ",
  items: [
    { id: "finder", type: "fish-finder", label: "Helm finder", slot: 2 },
    { id: "collision", type: "cooler", label: "Ignored", slot: 2 },
    { id: "bad-slot", type: "anchor", label: "Ignored", slot: 52 },
    { id: "custom", type: "unknown", label: "Deck light", slot: 7 },
    { id: "finder-2", type: "fish-finder", label: "Helm finder", slot: 8 },
    { id: "stern-finder", type: "fish-finder", label: "Helm finder", slot: 51 }
  ]
})`, context);

assert.equal(normalized.name, "Lake boat");
assert.deepEqual(
  JSON.parse(JSON.stringify(normalized.equipment)),
  [
    {
      id: "equipment-finder",
      type: "fish-finder",
      name: "Helm finder",
      image: "",
      previewImage: "",
      imagePath: "",
      imageFilename: "",
      previewPath: "",
      previewFilename: ""
    },
    {
      id: "equipment-custom",
      type: "custom",
      name: "Deck light",
      image: "",
      previewImage: "",
      imagePath: "",
      imageFilename: "",
      previewPath: "",
      previewFilename: ""
    }
  ]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(normalized.items)),
  [
    { id: "finder", equipmentId: "equipment-finder", slot: 2 },
    { id: "custom", equipmentId: "equipment-custom", slot: 7 },
    { id: "finder-2", equipmentId: "equipment-finder", slot: 8 },
    { id: "stern-finder", equipmentId: "equipment-finder", slot: 51 }
  ]
);

const boxes = vm.runInContext(`normalizeTackleBoxes([
  {
    id: "box-1",
    name: "  Salmon box  ",
    color: "#2763a7",
    layerCount: 4,
    itemRefs: [
      { type: "lure", id: "lure-1" },
      { type: "lure", id: "lure-1" },
      { type: "bad", id: "ignored" }
    ]
  }
])`, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(boxes)),
  [{
    id: "box-1",
    name: "Salmon box",
    color: "#2763a7",
    style: "organizer",
    layerCount: 4,
    itemRefs: [{ type: "lure", id: "lure-1", layer: 0 }]
  }]
);

const manyBoxes = vm.runInContext(
  `normalizeTackleBoxes(Array.from({ length: 101 }, (_, index) => ({ id: \`box-\${index}\`, name: \`Box \${index}\` })))`,
  context
);
assert.equal(manyBoxes.length, 101);

context.document = {
  querySelector: () => null,
  querySelectorAll: () => []
};
vm.runInContext(fs.readFileSync("static/js/boat-layout.js", "utf8"), context);
assert.equal(vm.runInContext("BOAT_SLOT_POINTS.length", context), 52);
assert.deepEqual(
  JSON.parse(vm.runInContext("JSON.stringify(BOAT_SLOT_POINTS.slice(0, 6))", context)),
  [
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 1, column: 3 },
    { row: 1, column: 4 }
  ]
);
assert.equal(vm.runInContext('adjacentBoatSlot(0, "left")', context), -1);
assert.equal(vm.runInContext('adjacentBoatSlot(0, "right")', context), 1);
assert.equal(vm.runInContext('adjacentBoatSlot(0, "down")', context), 3);

const addedPlacement = vm.runInContext(`
  state.settings = {
    boatLayout: {
      name: "Test boat",
      equipment: [{ id: "seat-template", type: "seat", name: "Captain chair" }],
      items: []
    }
  };
  renderBoatLayout = () => {};
  queueBoatSave = () => {};
  addBoatEquipmentToDeck("seat-template");
  JSON.stringify(state.settings.boatLayout.items);
`, context);
assert.deepEqual(
  JSON.parse(addedPlacement),
  [{ id: "generated-1", equipmentId: "seat-template", slot: 0 }]
);

const droppedPlacement = vm.runInContext(`
  addBoatEquipmentToDeck("seat-template", { targetSlot: 51 });
  JSON.stringify(state.settings.boatLayout.items);
`, context);
assert.deepEqual(
  JSON.parse(droppedPlacement),
  [
    { id: "generated-1", equipmentId: "seat-template", slot: 0 },
    { id: "generated-2", equipmentId: "seat-template", slot: 51 }
  ]
);

console.log("boat layout tests passed");
