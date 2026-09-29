import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const { hasFishHawk } = await import("../static/js/app-normalization.js");

setState({ settings: {} });
assert.equal(hasFishHawk(), true, "Fish Hawk is enabled when no preference has been saved");
setState({ settings: { hasFishHawk: false } });
assert.equal(hasFishHawk(), false, "Fish Hawk can be disabled");
setState({ settings: { hasFishHawk: true } });
assert.equal(hasFishHawk(), true, "Fish Hawk can be enabled");

const editorTemplate = await readFile(new URL("../templates/partials/dialogs/trip-editor.html", import.meta.url), "utf8");
const reportSource = await readFile(new URL("../static/js/trip-report.js", import.meta.url), "utf8");
assert.match(editorTemplate, /trip-probe-temperature-section fish-hawk-field/, "the editor probe section follows the Fish Hawk setting");
assert.match(reportSource, /hasFishHawk\(\) \? `<section class="report-fact-section report-probe-section">/, "the trip viewer probe section follows the Fish Hawk setting");
