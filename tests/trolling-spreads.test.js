const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  console,
  structuredClone,
  crypto: require("crypto").webcrypto,
  mergePeople: (...lists) => lists.flat()
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-units.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

const named = vm.runInContext(`normalizeSettings({
  trollingSpreads: [
    { id: "one", name: " One Man Spread ", spread: [{ comboId: "combo-1", side: "Port", presentation: "Downrigger" }] },
    { id: "two", name: "ONE MAN SPREAD", spread: [{ comboId: "combo-2" }] }
  ],
  defaultTrollingSpreadId: "missing"
})`, context);
assert.equal(named.trollingSpreads.length, 2);
assert.equal(named.trollingSpreads[0].name, "One Man Spread");
assert.equal(named.trollingSpreads[1].name, "ONE MAN SPREAD (2)");
assert.equal(named.defaultTrollingSpreadId, "");

const migrated = vm.runInContext(`normalizeSettings({
  defaultTrollingSpreads: [
    { targetSpecies: "Walleye", spread: [{ comboId: "combo-walleye", lureId: "ignored" }] },
    { targetSpecies: "", spread: [{ comboId: "combo-general" }] }
  ]
})`, context);
assert.deepEqual(
  JSON.parse(JSON.stringify(migrated.trollingSpreads.map(({ name, spread }) => ({ name, spread })))),
  [
    { name: "Walleye Spread", spread: [{ comboId: "combo-walleye", side: "", presentation: "" }] },
    { name: "General Spread", spread: [{ comboId: "combo-general", side: "", presentation: "" }] }
  ]
);
assert.equal(migrated.defaultTrollingSpreadId, migrated.trollingSpreads[1].id);

const speciesOnly = vm.runInContext(`normalizeSettings({
  defaultTrollingSpreads: [
    { targetSpecies: "Salmon", spread: [{ comboId: "combo-salmon" }] }
  ]
})`, context);
assert.equal(speciesOnly.trollingSpreads[0].name, "Salmon Spread");
assert.equal(speciesOnly.defaultTrollingSpreadId, "");

console.log("trolling spread normalization tests passed");
