import assert from "node:assert/strict";
import { installBrowserEnv, okJson, setFetch } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { defaults } = await import("../static/js/app-defaults.js");
const appState = await import("../static/js/app-state.js");
const { commit, replaceState } = await import("../static/js/store.js");

function validDocument(overrides = {}) {
  return {
    ...structuredClone(defaults),
    trips: [],
    ...overrides,
  };
}

{
  const calls = [];
  replaceState(validDocument(), { revision: '"1"' });
  setFetch(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    return okJson({}, { headers: { ETag: `"${calls.length}"` } });
  });

  const first = commit(async (draft) => {
    draft.trips.push({ id: "first", title: "First" });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const second = commit((draft) => {
    draft.trips.push({ id: "second", title: "Second" });
  });
  await Promise.all([first, second]);

  const saveCalls = calls.filter((call) => call.url === "/api/logbook");
  assert.equal(saveCalls.length, 2, "each commit saves once, in order");
  assert.deepEqual(saveCalls[0].body.trips.map((trip) => trip.id), ["first"]);
  assert.deepEqual(saveCalls[1].body.trips.map((trip) => trip.id), ["first", "second"]);
  assert.deepEqual(appState.state.trips.map((trip) => trip.id), ["first", "second"]);
}

{
  const original = replaceState(validDocument({ trips: [{ id: "kept", title: "Kept" }] }), { revision: '"3"' });
  await assert.rejects(
    commit(() => ({ invalid: true })),
    /schemaVersion/,
  );
  assert.deepEqual(appState.state, original, "validation failure leaves state unchanged");
}

{
  replaceState(validDocument(), { revision: '"4"' });
  setFetch(async (url) => {
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    return okJson({}, { status: 412 });
  });
  await assert.rejects(
    commit((draft) => {
      draft.trips.push({ id: "conflict", title: "Conflict" });
    }),
    /changed in another tab/,
  );
  assert.deepEqual(appState.state.trips, [], "conflicts leave state unchanged");
}

{
  const calls = [];
  replaceState(validDocument({ trips: [{ id: "same", title: "Same" }] }), { revision: '"5"' });
  setFetch(async (url) => {
    calls.push(url);
    return okJson({ csrfToken: "test-token" });
  });
  await commit(() => {});
  assert.deepEqual(calls, [], "a commit that changes nothing sends no request");
}

{
  const cached = validDocument({ trips: [{ id: "cached", title: "Cached" }] });
  localStorage.setItem("fishing-logbook-v2", JSON.stringify(cached));
  for (const failedRead of [
    async () => { throw new Error("startup connection failure"); },
    async () => okJson({ error: "unavailable" }, { status: 503 }),
    async () => okJson({ schemaVersion: 1 }, { headers: { ETag: '"99"' } }),
    async () => okJson(cached)
  ]) {
    appState.setLogbookRevision('"stale"');
    setFetch(failedRead);
    replaceState(await appState.loadState());
    assert.equal(appState.logbookRevision, "", "fallbacks and missing ETags never carry a server revision");
    const calls = [];
    setFetch(async (url) => { calls.push(url); return okJson({}); });
    await assert.rejects(commit((draft) => { draft.settings.theme = "dark"; }), /Reload the page before saving/);
    assert.deepEqual(calls, [], "no request can overwrite server data after a failed startup read");
    assert.deepEqual(appState.state, cached);
    assert.deepEqual(JSON.parse(localStorage.getItem("fishing-logbook-v2")), cached);
  }

  setFetch(async () => okJson(cached, { headers: { ETag: '"100"' } }));
  replaceState(await appState.loadState());
  let savedRevision;
  setFetch(async (url, options) => {
    savedRevision = options.headers.get("If-Match");
    return okJson({}, { headers: { ETag: '"101"' } });
  });
  await commit((draft) => { draft.settings.theme = "dark"; });
  assert.equal(savedRevision, '"100"', "a successful reload restores revision-checked saves");
}
