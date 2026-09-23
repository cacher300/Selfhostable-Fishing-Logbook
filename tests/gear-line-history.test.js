const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  els: { lureDialog: { dataset: { removedPhotoKeys: "[]" } } },
  mediaReferenceKey: photo => `${photo.category}/${photo.filename}`,
  canonicalMediaRef: photo => photo,
  isVideoMedia: photo => photo?.mediaType === "video" || photo?.mimeType?.startsWith?.("video/")
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/gear-core.js", "utf8"), context);

const existing = [
  { id: "old", spooledDate: "2025-05-01", discardedDate: "2025-10-01", notes: "mobile-only note" },
  { id: "active", spooledDate: "2026-04-01", type: "Braid", monoBacking: true, customSource: "native" }
];
const sourceOrder = existing.map(line => line.id);
assert.equal(context.activeLineEntry({ lineHistory: existing }).id, "active");
assert.deepEqual(existing.map(line => line.id), sourceOrder, "reading the active line must not reorder stored history");
const edited = [{ id: "active", spooledDate: "2026-04-01", type: "Mono", weight: "12" }];
const merged = context.mergeLineHistory(existing, edited);

assert.equal(merged.length, 2);
assert.equal(merged[0].id, "old");
assert.equal(merged[0].discardedDate, "2025-10-01");
assert.equal(merged[0].notes, "mobile-only note");
assert.equal(merged[1].id, "active");
assert.equal(merged[1].type, "Mono");
assert.equal(merged[1].monoBacking, true);
assert.equal(merged[1].customSource, "native");

const withNew = context.mergeLineHistory(existing, [...edited, { id: "new", type: "Fly Line" }]);
assert.deepEqual(withNew.map(line => line.id), ["old", "active", "new"]);

const keptHero = context.gearPhotoFields([], {
  heroMediaId: "hero",
  media: [{ id: "hero", category: "lures", filename: "hero.jpg", mediaType: "image" }]
}, "lure");
assert.equal(keptHero.heroMediaId, "hero");
const removedHero = context.gearPhotoFields([], {
  heroMediaId: "hero",
  media: [{ id: "hero", category: "lures", filename: "hero.jpg", mediaType: "image" }]
}, "lure");
context.els.lureDialog.dataset.removedPhotoKeys = JSON.stringify(["hero"]);
const removedHeroAfterMediaRemoval = context.gearPhotoFields([], {
  heroMediaId: "hero",
  media: [{ id: "hero", category: "lures", filename: "hero.jpg", mediaType: "image" }]
}, "lure");
assert.equal(removedHero.heroMediaId, "hero");
assert.equal(removedHeroAfterMediaRemoval.heroMediaId, "");
assert.equal(removedHeroAfterMediaRemoval.media.length, 0);
console.log("gear metadata preservation tests passed");
