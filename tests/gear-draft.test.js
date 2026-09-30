import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();

const { lineHistoryFromDraft, lureFromDraft, reelFromDraft, rodFromDraft, syncReelGroupQuantity } = await import("../static/js/gear-draft.js");

const existingLines = [
  { id: "old", spooledDate: "2023-01-01", type: "Mono", brand: "A", notes: "keep" },
  { id: "active", spooledDate: "2025-01-01", type: "Braid", brand: "B", weight: "30" }
];
const mergedLines = lineHistoryFromDraft([
  { id: "active", spooledDate: "2026-01-01", type: "Braid", brand: "B2", weight: "40", monoBacking: true }
], existingLines);
assert.equal(mergedLines.length, 2);
assert.deepEqual(mergedLines.find((line) => line.id === "old"), existingLines[0]);
assert.equal(mergedLines.find((line) => line.id === "active").weight, "40");
assert.equal(mergedLines.find((line) => line.id === "active").monoBacking, true);

const reel = reelFromDraft({
  id: "reel-1",
  shortName: "  Diver  ",
  quantityAvailable: "3",
  lineHistory: [{ id: "active", spooledDate: "2026-01-01", type: "Mono", monoBacking: true }]
}, { existing: { id: "reel-1", lineHistory: existingLines } });
assert.equal(reel.shortName, "Diver");
assert.equal(reel.lineHistory.length, 2);
assert.equal(reel.lineHistory.find((line) => line.id === "active").monoBacking, false);

const synced = syncReelGroupQuantity([
  { id: "group-1", quantityAvailable: "1" },
  { id: "copy-1", modelGroupId: "group-1", quantityAvailable: "1" },
  { id: "other", quantityAvailable: "7" }
], "group-1", "4");
assert.equal(synced[0].quantityAvailable, "4");
assert.equal(synced[1].quantityAvailable, "4");
assert.equal(synced[2].quantityAvailable, "7");

const spoon = lureFromDraft({ type: "Spoon", name: "", spoonSize: "Mag", meatRigType: "Herring", softPlasticType: "Paddle", flyCategory: "Streamer" });
assert.equal(spoon.name, "Mag Spoon");
assert.equal(spoon.spoonSize, "Mag");
assert.equal(spoon.meatRigType, "");
assert.equal(spoon.softPlasticType, "");
assert.equal(spoon.flyCategory, "");

const flyRod = rodFromDraft({ type: "Fly", flyWeight: "8", pieces: "4", shortName: "  8wt  " });
assert.equal(flyRod.shortName, "8wt");
assert.equal(flyRod.flyWeight, "8");
const castingRod = rodFromDraft({ type: "Casting", flyWeight: "8", pieces: "4" });
assert.equal(castingRod.flyWeight, "");
assert.equal(castingRod.pieces, "");
