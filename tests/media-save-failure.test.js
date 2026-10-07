import assert from "node:assert/strict";
import { installBrowserEnv, okJson, setFetch } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");
const appState = await import("../static/js/app-state.js");
const { commit, replaceState } = await import("../static/js/store.js");

const saved = {
  ...structuredClone(defaults),
  trips: [{ id: "trip", notePhotos: [] }],
};

replaceState(saved, { revision: '"1"' });
setFetch(async (url) => {
  if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
  return okJson({ error: "simulated save failure" }, { status: 500 });
});

await assert.rejects(
  commit((draft) => {
    draft.trips[0].notePhotos.push({ id: "unsaved", category: "trip-photos", filename: "unsaved.jpg" });
  }),
  /simulated save failure/,
);
assert.deepEqual(appState.state, saved, "failed commits leave state unchanged");

const calls = [];
setFetch(async (url, options = {}) => {
  calls.push({ url, options });
  if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
  return okJson({}, { headers: { ETag: '"2"' } });
});

await commit((draft) => {
  draft.trips[0].notePhotos.push({ id: "saved", category: "trip-photos", filename: "saved.jpg" });
});
assert.equal(appState.state.trips[0].notePhotos.length, 1);
const saveCall = calls.find((call) => call.url === "/api/logbook");
assert(saveCall, "successful edits save the logbook");
assert.equal(saveCall.options.method, "PUT");
assert.equal(saveCall.options.headers.get("If-Match"), '"1"');
assert.deepEqual(JSON.parse(saveCall.options.body), appState.state);
