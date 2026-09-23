const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/app-persistence.js", "utf8"));

const saved = { trips: [{ id: "trip", notePhotos: [] }] };
const storage = new Map([["logbook", JSON.stringify(saved)]]);
global.storageKey = "logbook";
global.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value)
};
global.location = { protocol: "https:" };
global.logbookRevision = '"1"';
global.validateState = (value) => structuredClone(value);
global.state = structuredClone(saved);
rememberPersistedState(state);

async function testFailedSaveRestoresLastPersistedState() {
  state.trips[0].notePhotos.push({ path: "trip-photos/unsaved.jpg" });
  global.protectedFetch = async () => ({
    ok: false,
    json: async () => ({ error: "simulated save failure" })
  });

  await assert.rejects(saveState(), /simulated save failure/);
  assert.deepEqual(state, saved);
  assert.deepEqual(JSON.parse(storage.get("logbook")), saved);
}

testFailedSaveRestoresLastPersistedState()
  .then(() => console.log("media save failure tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
