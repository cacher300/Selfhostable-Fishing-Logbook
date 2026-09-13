const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { structuredClone };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);

const species = vm.runInContext("defaults.species", context);
assert(species.includes("Atlantic Salmon"));
assert.deepEqual(species, [...species].sort((a, b) => a.localeCompare(b)));

console.log("default species tests passed");
