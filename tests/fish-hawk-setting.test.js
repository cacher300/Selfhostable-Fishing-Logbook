const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync("static/js/app-normalization.js", "utf8");
const reportSource = fs.readFileSync("static/js/trip-report.js", "utf8");
const editorTemplate = fs.readFileSync("templates/partials/dialogs/trip-editor.html", "utf8");
const match = source.match(/function hasFishHawk\(\) \{[\s\S]*?\n\}/);
assert(match, "hasFishHawk should be defined");

const context = { state: { settings: {} } };
vm.createContext(context);
vm.runInContext(match[0], context);

assert.equal(context.hasFishHawk(), true, "Fish Hawk is enabled when no preference has been saved");
context.state.settings.hasFishHawk = false;
assert.equal(context.hasFishHawk(), false, "Fish Hawk can be disabled");
context.state.settings.hasFishHawk = true;
assert.equal(context.hasFishHawk(), true, "Fish Hawk can be enabled");
assert.match(editorTemplate, /trip-probe-temperature-section fish-hawk-field/, "the editor probe section follows the Fish Hawk setting");
assert.match(reportSource, /hasFishHawk\(\) \? `<section class="report-fact-section report-probe-section">/, "the trip viewer probe section follows the Fish Hawk setting");

console.log("Fish Hawk setting tests passed");
