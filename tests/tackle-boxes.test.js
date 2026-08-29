const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  state: { settings: { tackleBoxes: [] }, lures: [], flashers: [], rods: [], reels: [], rodReelCombos: [] },
  document: { querySelector: () => null },
  normalizeTackleBoxes: (boxes) => boxes,
  previewImage: () => "",
  isVideoMedia: () => false,
  escapeHtml: (value) => String(value),
  boatLayout: () => ({ equipment: [] }),
  gearDisplayName: () => "",
  comboName: () => "",
  createId: () => "generated",
  saveState: async () => {},
  alert: () => {},
  window: { confirm: () => true }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/tackle-boxes.js", "utf8"), context);
assert.ok(fs.existsSync("static/vendor/anime-3.2.2.min.js"));
assert.match(fs.readFileSync("standalone.html", "utf8"), /static\/vendor\/anime-3\.2\.2\.min\.js/);
assert.equal(vm.runInContext("typeof animateTackleBoxState", context), "function");
const tackleBoxCss = fs.readFileSync("static/css/tackle-boxes.css", "utf8");
assert.match(
  tackleBoxCss,
  /\.tackle-box-card\.is-open \.tackle-box-object\s*\{[^}]*pointer-events:\s*none/s
);
assert.match(
  tackleBoxCss,
  /\.tackle-box-object\.is-open \.tackle-box-layer-panel\s*\{[^}]*pointer-events:\s*auto/s
);
assert.match(
  tackleBoxCss,
  /\.tackle-box-card \.tackle-box-object\s*\{[^}]*width:\s*min\(92%, 440px\)/s
);
assert.match(
  tackleBoxCss,
  /\.tackle-box-card \.tackle-box-layer-panel\s*\{[^}]*height:\s*126px/s
);
assert.match(
  tackleBoxCss,
  /\.tackle-box-card \.tackle-style-cantilever\s*\{[^}]*height:\s*430px/s
);

const fiveItems = Array.from({ length: 5 }, (_, index) => ({
  type: "lure",
  id: `lure-${index}`,
  name: `Lure ${index}`,
  item: {},
  layer: 0
}));
const fiveItemMarkup = vm.runInContext(`tackleBoxContentsMarkup(${JSON.stringify(fiveItems)})`, context);
assert.equal((fiveItemMarkup.match(/tackle-compartment-item/g) || []).length, 5);
assert.equal((fiveItemMarkup.match(/tackle-box-empty-compartment/g) || []).length, 10);

context.previewImage = (item) => item?.previewImage || "";
const picturedLureMarkup = vm.runInContext(`tackleBoxContentsMarkup(${JSON.stringify([{
  type: "lure",
  id: "pictured-lure",
  name: "Picture lure",
  item: { previewImage: "/media/lure.jpg" },
  layer: 0
}])})`, context);
assert.match(picturedLureMarkup, /is-photo-only-lure/);
assert.match(picturedLureMarkup, /src="\/media\/lure\.jpg"/);
assert.match(picturedLureMarkup, /aria-label="Picture lure, show performance stats"/);
assert.doesNotMatch(picturedLureMarkup, /<span>Picture lure<\/span>/);

const photoLessLureMarkup = vm.runInContext(`tackleBoxContentsMarkup(${JSON.stringify([{
  type: "lure",
  id: "photo-less-lure",
  name: "Photo-less lure",
  item: {},
  layer: 0
}])})`, context);
assert.doesNotMatch(photoLessLureMarkup, /is-photo-only-lure/);
assert.match(photoLessLureMarkup, /<span>Photo-less lure<\/span>/);

const seventeenItems = Array.from({ length: 17 }, (_, index) => ({
  type: "lure",
  id: `lure-${index}`,
  name: `Lure ${index}`,
  item: {},
  layer: index < 5 ? 0 : 1
}));
const overflowMarkup = vm.runInContext(`tackleBoxContentsMarkup(${JSON.stringify(seventeenItems)}, 6)`, context);
assert.equal((overflowMarkup.match(/tackle-compartment-item/g) || []).length, 5);
assert.match(overflowMarkup, />\+12<\/div>/);

const secondLayer = vm.runInContext(
  `tackleBoxLayerItems(${JSON.stringify(seventeenItems)}, 1)`,
  context
);
assert.equal(secondLayer.length, 12);

const layeredMarkup = vm.runInContext(
  `tackleBoxObjectMarkup(
    { id: "box-1", name: "Layered box", color: "#2763a7", style: "cantilever", layerCount: 3 },
    ${JSON.stringify(seventeenItems)},
    { editor: true, activeLayer: 1, direction: "forward" }
  )`,
  context
);
assert.match(layeredMarkup, /Layer 2/);
assert.match(layeredMarkup, /tackle-style-cantilever/);
assert.equal((layeredMarkup.match(/tackle-compartment-item/g) || []).length, 10);
assert.match(layeredMarkup, />\+7<\/div>/);
assert.equal((layeredMarkup.match(/tackle-cantilever-mechanism/g) || []).length, 1);
assert.equal((layeredMarkup.match(/data-tackle-tray-index=/g) || []).length, 3);
assert.equal((layeredMarkup.match(/data-tackle-link-rotation=/g) || []).length, 4);
assert.match(layeredMarkup, /tackle-cantilever-tray is-active/);
assert.doesNotMatch(layeredMarkup, /tackle-wing/);

const cantileverDisplayMarkup = vm.runInContext(
  `tackleBoxObjectMarkup(
    { id: "box-1", name: "Layered box", color: "#2763a7", style: "cantilever", layerCount: 3 },
    ${JSON.stringify(seventeenItems)},
    { activeLayer: 1 }
  )`,
  context
);
assert.doesNotMatch(cantileverDisplayMarkup, /tackle-cantilever-tray is-active/);

const cantileverControls = vm.runInContext(
  `tackleBoxLayerControlsMarkup(
    { id: "box-1", name: "Layered box", style: "cantilever", layerCount: 3 },
    0,
    true
  )`,
  context
);
assert.match(cantileverControls, /All 3 trays visible/);
assert.match(cantileverControls, /Hover any item for stats/);
assert.doesNotMatch(cantileverControls, /data-tackle-layer-index/);
assert.doesNotMatch(cantileverControls, /data-tackle-layer-step/);

const openOrganizerMarkup = vm.runInContext(`
  state.settings.tackleBoxes = [{
    id: "regular-box",
    name: "Regular box",
    color: "#2763a7",
    style: "organizer",
    layerCount: 3,
    itemRefs: []
  }];
  openTackleBoxIds.add("regular-box");
  activeTackleBoxLayers.set("regular-box", 1);
  tackleBoxCardMarkup(state.settings.tackleBoxes[0]);
`, context);
assert.match(openOrganizerMarkup, /Browse the trays/);
assert.match(openOrganizerMarkup, /Layer 2 of 3/);
assert.match(openOrganizerMarkup, /data-tackle-layer-step="-1"/);
assert.match(openOrganizerMarkup, /data-tackle-layer-step="1"/);

const firstOpenCard = {
  dataset: { tackleBoxId: "first-box" },
  outerHTML: "first box before layer change"
};
const secondOpenCard = {
  dataset: { tackleBoxId: "second-box" },
  outerHTML: "second box must not refresh"
};
context.document.querySelectorAll = () => [firstOpenCard, secondOpenCard];
context.state.settings.tackleBoxes = [
  {
    id: "first-box",
    name: "First box",
    color: "#2763a7",
    style: "organizer",
    layerCount: 3,
    itemRefs: []
  },
  {
    id: "second-box",
    name: "Second box",
    color: "#118753",
    style: "organizer",
    layerCount: 4,
    itemRefs: []
  }
];
vm.runInContext(`
  openTackleBoxIds.clear();
  activeTackleBoxLayers.clear();
  openTackleBoxIds.add("first-box");
  openTackleBoxIds.add("second-box");
  activeTackleBoxLayers.set("first-box", 0);
  activeTackleBoxLayers.set("second-box", 2);
  showTackleBoxLayer("first-box", 1);
`, context);
assert.match(firstOpenCard.outerHTML, /First box/);
assert.match(firstOpenCard.outerHTML, /Layer 2 of 3/);
assert.equal(secondOpenCard.outerHTML, "second box must not refresh");
assert.equal(vm.runInContext('activeTackleBoxLayers.get("second-box")', context), 2);

console.log("tackle box grid tests passed");
