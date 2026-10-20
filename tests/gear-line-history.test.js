import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { activeLineEntry, mergeLineHistory } = await import("../static/js/gear-core.js");

const existing = [
  { id: "old", spooledDate: "2025-05-01", discardedDate: "2025-10-01", notes: "mobile-only note" },
  { id: "active", spooledDate: "2026-04-01", type: "Braid", monoBacking: true, customSource: "native" },
];
const sourceOrder = existing.map((line) => line.id);
assert.equal(activeLineEntry({ lineHistory: existing }).id, "active");
assert.deepEqual(existing.map((line) => line.id), sourceOrder, "reading the active line must not reorder stored history");
const edited = [{ id: "active", spooledDate: "2026-04-01", type: "Mono", weight: "12" }];
const merged = mergeLineHistory(existing, edited);

assert.equal(merged.length, 2);
assert.equal(merged[0].id, "old");
assert.equal(merged[0].discardedDate, "2025-10-01");
assert.equal(merged[0].notes, "mobile-only note");
assert.equal(merged[1].id, "active");
assert.equal(merged[1].type, "Mono");
assert.equal(merged[1].monoBacking, true);
assert.equal(merged[1].customSource, "native");

const withNew = mergeLineHistory(existing, [...edited, { id: "new", type: "Fly Line" }]);
assert.deepEqual(withNew.map((line) => line.id), ["old", "active", "new"]);
