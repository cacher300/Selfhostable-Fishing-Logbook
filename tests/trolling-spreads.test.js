const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const spreads = [
  { id: "one", name: "One Man Spread", sourceTag: "mobile", spread: [{ comboId: "combo-1", side: "port", presentation: "Downrigger", note: "inside" }] }
];
const context = { console, state: { settings: { trollingSpreads: spreads } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-normalization.js", "utf8"), context);

assert.strictEqual(context.currentTrollingSpreads(), spreads);
assert.strictEqual(context.trollingSpreadById("one"), spreads[0].spread);
assert.equal(context.currentTrollingSpreads()[0].name, "One Man Spread");
assert.equal(context.currentTrollingSpreads()[0].sourceTag, "mobile");
assert.equal(context.currentTrollingSpreads()[0].spread[0].note, "inside");
assert.equal(context.currentTrollingSpreads()[0].spread[0].side, "port", "ordinary v2 reads must not rewrite casing or extensions");

console.log("v2 trolling spreads are read verbatim");
