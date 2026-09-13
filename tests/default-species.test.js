const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { structuredClone };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-defaults.js", "utf8"), context);

assert(vm.runInContext('defaults.species.includes("Atlantic Salmon")', context));

console.log("default species tests passed");
