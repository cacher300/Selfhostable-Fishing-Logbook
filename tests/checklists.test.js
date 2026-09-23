const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const original = [{
  id: "launch",
  name: "Launch Day",
  syncTag: "mobile",
  items: [{ id: "battery", label: "Charge batteries", done: true, icon: "battery" }]
}];
const card = {
  dataset: { checklistId: "launch" },
  querySelector(selector) {
    if (selector === ".checklist-name") return { value: "Launch Day" };
    return null;
  },
  querySelectorAll(selector) {
    if (selector !== ".checklist-item") return [];
    return [{
      dataset: { checklistItemId: "battery" },
      querySelector(field) {
        if (field === ".checklist-item-label") return { value: "Charge batteries" };
        if (field === ".checklist-item-done") return { checked: true };
        return null;
      }
    }];
  }
};
const context = {
  console,
  state: { settings: { checklists: original } },
  els: { checklistList: { querySelectorAll: (selector) => selector === ".checklist-card" ? [card] : [] } },
  createId: () => "generated-id"
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/checklists.js", "utf8"), context);

assert.strictEqual(context.savedChecklists(), original, "reading checklists must not replace or reshape state");
const collected = JSON.parse(JSON.stringify(context.checklistsFromView()));
assert.equal(collected[0].syncTag, "mobile");
assert.equal(collected[0].items[0].icon, "battery");
assert.deepEqual(original, [{
  id: "launch", name: "Launch Day", syncTag: "mobile",
  items: [{ id: "battery", label: "Charge batteries", done: true, icon: "battery" }]
}], "collecting an unchanged form must not mutate the source records");

const cleanupContext = {
  console,
  structuredClone,
  crypto: require("crypto").webcrypto,
  mergePeople: (...lists) => lists.flat()
};
vm.createContext(cleanupContext);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), cleanupContext);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), cleanupContext);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), cleanupContext);

console.log("checklists render and collect without reshaping saved records");
