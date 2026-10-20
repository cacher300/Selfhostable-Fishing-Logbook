import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv(`<!doctype html><html><body><input id="method" value=""></body></html>`);
globalThis.Option = function Option(label, value) {
  return { label, value };
};
const { updateCheaterDepth } = await import("../static/js/form-utils.js");
const { els } = await import("../static/js/app-elements.js");
const { ui } = await import("../static/js/app-state.js");
const tripRows = await import("../static/js/trip-rows.js");

const output = { value: "", readOnly: false };
ui.tripDraft = { catches: [{ id: "catch-1", ballDepth: "55 ft" }], lostFish: [], gearUsed: [] };
const row = {
  dataset: { catchId: "catch-1" },
  classList: { contains: () => false },
  querySelector(selector) {
    return selector === ".catch-estimated-lure-depth" ? output : null;
  },
};

updateCheaterDepth(row);
assert.equal(output.value, "27.5");
assert.equal(output.readOnly, true);

ui.tripDraft.catches[0].ballDepth = "";
updateCheaterDepth(row);
assert.equal(output.value, "");

const rowsSource = await readFile(new URL("../static/js/trip-rows.js", import.meta.url), "utf8");
assert.match(
  rowsSource,
  /\.catch-estimated-lure-depth"\)\.value = catchItem\.estimatedLureDepth \|\| "";[\s\S]*?updatePresentationFields\(node\);/,
  "saved lure depth should load before presentation-specific recalculation",
);
assert.doesNotMatch(
  rowsSource,
  /\.catch-estimated-lure-depth"\)\.value = catchItem\.estimatedLureDepth \|\| "";\s*updateCheaterDepth\(node\);/,
  "loading a fish must not unconditionally overwrite its saved lure depth",
);

const presentation = {
  options: [],
  value: "",
  disabled: false,
  setAttribute() {},
  add(option) {
    this.options.push(option);
  },
};
const lureDepth = { value: "", readOnly: false };
ui.tripDraft = {
  catches: [{ id: "catch-2", setupLineValue: "line-1::cheater" }],
  lostFish: [],
  gearUsed: [{ id: "line-1", presentation: "Downrigger" }]
};
const cheaterRow = {
  classList: { contains: (className) => className === "catch-row" },
  dataset: { catchId: "catch-2" },
  querySelectorAll: () => [],
  querySelector(selector) {
    if (selector === ".catch-presentation") return presentation;
    if (selector === ".catch-estimated-lure-depth") return lureDepth;
    return null;
  },
};

els.tripGearRows = { querySelectorAll: () => [] };
tripRows.syncCatchMethodToSetupLine(cheaterRow);
assert.equal(presentation.value, "Cheater");
assert.equal(presentation.options[0].value, "Cheater");
