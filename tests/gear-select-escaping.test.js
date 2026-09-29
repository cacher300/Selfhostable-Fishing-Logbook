const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const hostileId = `x"><img src=x onerror="alert(1)">`;
const context = {
  console,
  document: { addEventListener() {} },
  state: {
    lures: [{ id: hostileId, name: "Spoon", type: "Spoon" }],
    flashers: [{ id: hostileId, name: "Paddle" }],
    rods: [{ id: hostileId, name: "Rod" }],
  },
  gearDisplayName(item) { return item.name; },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/form-utils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("static/js/gear-pickers.js", "utf8"), context);
// The custom picker needs a real DOM; this test only inspects option markup.
vm.runInContext("enhanceGearSelect = () => {};", context);

const escapedOption = `<option value="x&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"`;
const select = () => ({ dataset: {}, closest() { return null; }, innerHTML: "" });
for (const [name, call] of [
  ["populateGearSelect", (target) => context.populateGearSelect(target, context.state.rods, "", "No rod", (item) => item.name)],
  ["populateLureSelect", (target) => context.populateLureSelect(target)],
  ["populateLuresForType", (target) => context.populateLuresForType(target, "Spoon")],
  ["populateFlasherSelect", (target) => context.populateFlasherSelect(target)],
]) {
  const target = select();
  call(target);
  assert(target.innerHTML.includes(escapedOption), `${name} should escape record IDs in option values`);
  assert(!target.innerHTML.includes("<img"), `${name} must not render markup from record IDs`);
}

const tripRowsSource = fs.readFileSync("static/js/trip-rows.js", "utf8");
assert.doesNotMatch(tripRowsSource, /^function populate(Lure|Flasher)Select\(/m, "gear selects have one owner in gear-pickers.js");

console.log("gear select option values escape imported record IDs");
