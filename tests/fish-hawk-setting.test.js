import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installBrowserEnv } from "./helpers/browser-env.mjs";
import { probeCatchMarkers } from "../static/js/probe-catch-depths.js";

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
assert.match(reportSource, /hasFishHawk\(\) \? html`<section class="report-fact-section report-probe-section">/, "the trip viewer probe section follows the Fish Hawk setting");

const markers = probeCatchMarkers([
  { lineOut: "120", lineBehindBoard: "80" },
  { depthDown: 0, waterDepth: "83 ft" },
  { setupLineTarget: "cheater", ballDepth: "80 ft" },
  { presentation: "Cheater", ballDepth: "80 ft", cheaterDepth: "35 ft" },
  { estimatedLureDepth: "3.048 m", fowCaught: "100 ft" },
  { depth_m: -15.24 },
  { fowCaught: "83 ft FOW", depth_ft: 80 },
  { detailsUnknown: true, waterDepth: "83 ft" }
], "m");
assert.deepEqual(markers.map(m => [m.catchIndex, m.kind, Math.round(m.depthFeet)]), [
  [1, "catch", 0], [4, "catch", 10], [3, "catch", 35], [2, "catch", 40], [5, "water", 50], [6, "water", 83]
], "preserve catch identity, surface and cheater depths, and use bottom measurements only as water depth");
