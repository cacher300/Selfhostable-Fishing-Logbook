const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let nextId = 0;
const context = {
  console,
  structuredClone,
  createId: () => `generated-${nextId += 1}`
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const checklists = vm.runInContext(`normalizeChecklists([{
  id: "launch",
  name: "Launch Day",
  items: [
    { id: "battery", label: "Charge batteries", done: true },
    { id: "license", label: "Pack licences", done: false },
    { label: "" }
  ]
}])`, context);

const checklistResult = JSON.parse(JSON.stringify(checklists));
assert.equal(checklistResult.length, 1);
assert.equal(checklistResult[0].items.length, 2);
assert.equal(checklistResult[0].items[0].done, true);
assert.equal(checklistResult[0].items[1].done, false);

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
const cleanedState = vm.runInContext(`normalizeState({
  ...structuredClone(defaults),
  settings: {
    ...structuredClone(defaults.settings),
    tripTemplates: [{ id: "old-template" }],
    spreadTemplates: [{ id: "dead-spread", name: "Old spread" }]
  },
  trips: [{ id: "old-trip", checklist: [{ label: "Old trip item" }] }]
})`, cleanupContext);
assert.equal(cleanedState.settings.tripTemplates, undefined);
assert.equal(cleanedState.settings.spreadTemplates, undefined);
assert.equal(cleanedState.trips[0].checklist, undefined);

console.log("checklist tests passed");
