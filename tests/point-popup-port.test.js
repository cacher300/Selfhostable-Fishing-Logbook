import assert from "node:assert/strict";
import { build } from "esbuild";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const built = await build({ stdin: { contents: 'export { setState } from "./static/js/app-state.js"; export { L } from "./static/js/vendor.js"; export { showDepthPopupForMapClick } from "./static/js/maps.js";', resolveDir: process.cwd() }, bundle: true, write: false,
  format: "esm", loader: { ".css": "empty", ".png": "dataurl" }, define: { __STRICT_STATE__: "false" } });
const { L, showDepthPopupForMapClick, setState } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
setState({ settings: { units: { depth: "ft" } } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((done) => setImmediate(done));
const event = { latlng: { lat: 43.6, lng: -77.9 } };

function setup() {
  const depth = deferred(), reading = deferred(), contents = [];
  let open = true;
  const popup = { setLatLng() { return this; }, setContent(value) { contents.push(value); return this; }, openOn() { return this; } };
  L.popup = () => popup;
  globalThis.fetch = () => depth.promise.then(value => ({ ok: true, json: async () => value }));
  window.getGreatLakesMapInspection = () => reading.promise;
  const task = showDepthPopupForMapClick({ hasLayer: () => open }, event);
  return { depth, reading, contents, task, close: () => { open = false; } };
}

const first = setup();
first.depth.resolve({ depth_ft: 328 });
await flush();
assert.match(first.contents.at(-1), /FOW/);
assert.doesNotMatch(first.contents.at(-1), /Looking up/);
first.reading.resolve("Ready temperature");
await first.task;
assert.match(first.contents.at(-1), /Ready temperature/);
assert.match(first.contents.at(-1), /FOW/);

const second = setup();
second.reading.resolve("Ready currents");
await flush();
assert.match(second.contents.at(-1), /Looking up/);
assert.match(second.contents.at(-1), /Ready currents/);
second.depth.reject(new Error("unavailable"));
await second.task;
assert.match(second.contents.at(-1), /Depth unavailable/);
assert.match(second.contents.at(-1), /Ready currents/);

const closed = setup();
closed.close();
closed.depth.resolve({ depth_ft: 328 });
closed.reading.resolve("Late reading");
await closed.task;
assert.equal(closed.contents.length, 1, "late results must not reopen or update a closed popup");
