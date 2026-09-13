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
