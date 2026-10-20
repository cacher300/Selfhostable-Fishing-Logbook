import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const appState = await import("../static/js/app-state.js");
const { populateFlasherSelect, populateGearSelect, populateLureSelect, populateLuresForType } = await import("../static/js/gear-pickers.js");

const hostileId = `x"><img src=x onerror="alert(1)">`;
appState.setState({
  lures: [{ id: hostileId, name: "Spoon", type: "Spoon" }],
  flashers: [{ id: hostileId, name: "Paddle" }],
  rods: [{ id: hostileId, name: "Rod" }],
});

const escapedOption = `<option value="x&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"`;
const select = () => ({
  dataset: {},
  closest() { return null; },
  innerHTML: "",
  classList: { add() {} },
  parentNode: { insertBefore() {} },
  style: {},
  setAttribute() {},
  addEventListener() {},
});
for (const [name, call] of [
  ["populateGearSelect", (target) => populateGearSelect(target, appState.state.rods, "", "No rod", (item) => item.name)],
  ["populateLureSelect", (target) => populateLureSelect(target)],
  ["populateLuresForType", (target) => populateLuresForType(target, "Spoon")],
  ["populateFlasherSelect", (target) => populateFlasherSelect(target)],
]) {
  const target = select();
  call(target);
  assert(target.innerHTML.includes(escapedOption), `${name} should escape record IDs in option values`);
  assert(!target.innerHTML.includes("<img"), `${name} must not render markup from record IDs`);
}

const tripRowsSource = await readFile(new URL("../static/js/trip-rows.js", import.meta.url), "utf8");
assert.doesNotMatch(tripRowsSource, /^export function populate(Lure|Flasher)Select\(/m, "gear selects have one owner in gear-pickers.js");
