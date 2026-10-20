import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");
const { setState } = await import("../static/js/app-state.js");
const { renderReportSetupTable } = await import("../static/js/trip-report.js");
setState(structuredClone(defaults));
const reportState = await import("../static/js/app-state.js");
reportState.state.rodReelCombos = [{ id: "Lake trout jigging 2", shortName: "Lake trout jigging 2" }];
reportState.state.rods = [{ id: "Lake trout jigging rod 2", name: "Lake trout jigging rod 2" }];
reportState.state.reels = [{ id: "Okuma Avenger #2", name: "Okuma Avenger #2" }];

const trip = {
  gearUsed: [{
    startTime: "3:33 PM",
    endTime: "8:00 PM",
    comboId: "Lake trout jigging 2",
    rodId: "Lake trout jigging rod 2",
    reelId: "Okuma Avenger #2",
    side: "",
    lineLabel: "",
    lureId: "",
    changeNote: "",
  }],
};
const html = String(renderReportSetupTable(trip));
const headers = [...html.matchAll(/<th[^>]*><span>(.*?)<\/span><\/th>/g)].map((match) => match[1]);

assert.deepEqual(headers, ["#", "Start", "End", "Combo", "Rod", "Reel"]);
assert.doesNotMatch(html, />Side<\/span>/);
assert.doesNotMatch(html, />Line<\/span>/);
assert.doesNotMatch(html, />Lure<\/span>/);
assert.doesNotMatch(html, />Change Note<\/span>/);
