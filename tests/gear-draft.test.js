import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { comboFromDraft, flasherFromDraft, lureFromDraft, reelFromDraft, rodFromDraft } = await import("../static/js/gear-draft.js");

const existingLines = [
  { id: "old", spooledDate: "2023-01-01", type: "Mono", brand: "A", notes: "keep" },
  { id: "active", spooledDate: "2025-01-01", type: "Braid", brand: "B", weight: "30" }
];
const reel = reelFromDraft({
  id: "reel-1",
  shortName: "  Diver  ",
  quantityAvailable: "3",
  lineHistory: [{ id: "active", spooledDate: "2026-01-01", type: "Braid", brand: "B2", weight: "40", monoBacking: true }]
}, { existing: { id: "reel-1", lineHistory: existingLines } });
assert.equal(reel.shortName, "Diver");
assert.equal(reel.lineHistory.length, 2);
assert.deepEqual(reel.lineHistory.find((line) => line.id === "old"), existingLines[0]);
assert.equal(reel.lineHistory.find((line) => line.id === "active").weight, "40");
assert.equal(reel.lineHistory.find((line) => line.id === "active").monoBacking, true);

const spoon = lureFromDraft({ type: "Spoon", name: "", spoonSize: "Mag", meatRigType: "Herring", softPlasticType: "Paddle", flyCategory: "Streamer" });
assert.equal(spoon.name, "Mag Spoon");
assert.equal(spoon.spoonSize, "Mag");
assert.equal(spoon.meatRigType, "");
assert.equal(spoon.softPlasticType, "");
assert.equal(spoon.flyCategory, "");

const spinnerbait = lureFromDraft({ type: "Spinnerbait", name: "Test spinnerbait", bladeType: "Willow Leaf", spoonSize: "Mag" });
assert.equal(spinnerbait.bladeType, "Willow Leaf");
assert.equal(spinnerbait.spoonSize, "");
assert.equal(lureFromDraft({ type: "Spinner", bladeType: "Colorado" }).bladeType, "");

const bead = lureFromDraft({ type: "Bead", name: "", beadSize: "10mm", color: "Peach", spoonSize: "Mag" });
assert.equal(bead.beadSize, "10mm");
assert.equal(bead.spoonSize, "");
assert.match(bead.name, /10mm/);
assert.equal(lureFromDraft({ type: "Spoon", beadSize: "10mm" }).beadSize, "");

const flyRod = rodFromDraft({ type: "Fly", flyWeight: "8", pieces: "4", shortName: "  8wt  " });
assert.equal(flyRod.shortName, "8wt");
assert.equal(flyRod.flyWeight, "8");
const castingRod = rodFromDraft({ type: "Casting", flyWeight: "8", pieces: "4" });
assert.equal(castingRod.flyWeight, "");
assert.equal(castingRod.pieces, "");

const media = [
  { id: "media-1", category: "lures", filename: "one.jpg", caption: "front" },
  { id: "media-2", category: "lures", filename: "two.jpg", mediaType: "video", extraMediaField: "keep" }
];
const roundTrips = [
  [lureFromDraft, {
    id: "lure-source",
    name: "Source Spoon",
    type: "Spoon",
    color: "Green",
    spoonSize: "Mag",
    media,
    heroMediaId: "media-1",
    additive: { mobile: true }
  }],
  [flasherFromDraft, {
    id: "flasher-source",
    name: "Source Paddle",
    type: "Paddle",
    brand: "Dreamweaver",
    media,
    additive: ["native"]
  }],
  [reelFromDraft, {
    id: "reel-source",
    shortName: "Wire Diver",
    style: "Linecounter",
    quantityAvailable: "2",
    modelGroupId: "group-source",
    media,
    lineHistory: [
      { id: "old-line", spooledDate: "2023-05-01", type: "Mono", weight: "20", additive: "old" },
      { id: "active-line", spooledDate: "2025-05-01", type: "Braid", weight: "30", monoBacking: true }
    ],
    mobileOnly: { lineTracker: true }
  }],
  [rodFromDraft, {
    id: "rod-source",
    shortName: "Rigger",
    type: "Downrigging",
    quantityAvailable: "3",
    media,
    additive: "rod"
  }],
  [comboFromDraft, {
    id: "combo-source",
    shortName: "Port Rigger",
    rodId: "rod-source",
    reelId: "reel-source",
    additive: { combo: true }
  }]
];

for (const [normalize, source] of roundTrips) {
  const draft = structuredClone(source);
  assert.deepEqual(normalize(draft, { existing: source, editingId: source.id }), source);
}

const sparseSource = { id: "lure-sparse", name: "Sparse Crank", type: "Crankbait" };
const sparseDraft = { ...structuredClone(sparseSource), color: "  " };
const sparseSaved = lureFromDraft(sparseDraft, { existing: sparseSource, editingId: sparseSource.id });
assert.equal(Object.hasOwn(sparseSaved, "color"), false);
assert.equal(Object.hasOwn(sparseSaved, "media"), false);
