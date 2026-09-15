const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/form-utils.js", "utf8"), context);

const output = { value: "", readOnly: false };
const ballDepth = { value: "55 ft" };
const row = {
  querySelector(selector) {
    return selector === ".catch-estimated-lure-depth" ? output : ballDepth;
  }
};

vm.runInContext("updateCheaterDepth(row)", vm.createContext({ ...context, row }));
assert.equal(output.value, "27.5");
assert.equal(output.readOnly, true);

ballDepth.value = "";
vm.runInContext("updateCheaterDepth(row)", vm.createContext({ ...context, row }));
assert.equal(output.value, "");

console.log("cheater depth tests passed");

const recalculationCalls = [];
const rowsContext = {
  console,
  Option: function Option(label, value) {
    return { label, value };
  },
  els: { tripGearRows: { querySelectorAll: () => [] } },
  updatePresentationFields() { recalculationCalls.push("presentation"); },
  updateCheaterDepth() { recalculationCalls.push("cheater"); },
  updateLeadcoreEstimatedDepth() { recalculationCalls.push("leadcore"); }
};
vm.createContext(rowsContext);
const rowsSource = fs.readFileSync("static/js/trip-rows.js", "utf8");
const addFishRowFunction = rowsSource.match(/function addFishRow\([\s\S]*?\n\}/)?.[0];
assert(addFishRowFunction, "addFishRow should be defined");
assert.match(
  addFishRowFunction,
  /\.catch-estimated-lure-depth"\)\.value = catchItem\.estimatedLureDepth \|\| "";[\s\S]*?updatePresentationFields\(node\);/,
  "saved lure depth should load before presentation-specific recalculation"
);
assert.doesNotMatch(
  addFishRowFunction,
  /\.catch-estimated-lure-depth"\)\.value = catchItem\.estimatedLureDepth \|\| "";\s*updateCheaterDepth\(node\);/,
  "loading a fish must not unconditionally overwrite its saved lure depth"
);
const syncFunction = rowsSource.match(/function syncCatchMethodToSetupLine\(row\) \{[\s\S]*?\n\}/)?.[0];
assert(syncFunction, "syncCatchMethodToSetupLine should be defined");
vm.runInContext(syncFunction, rowsContext);

const presentation = {
  options: [],
  value: "",
  add(option) {
    this.options.push(option);
  }
};
const setupLine = { value: "line-1::cheater" };
const cheaterRow = {
  querySelector(selector) {
    return selector === ".catch-setup-line" ? setupLine : presentation;
  }
};
rowsContext.els.tripGearRows.querySelectorAll = () => [];
vm.runInContext("syncCatchMethodToSetupLine(row)", vm.createContext({ ...rowsContext, row: cheaterRow }));
assert.equal(presentation.value, "Cheater");
assert.equal(presentation.options[0].value, "Cheater");
assert.deepEqual(recalculationCalls, ["presentation", "cheater", "leadcore"]);

console.log("cheater presentation sync tests passed");
