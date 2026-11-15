import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";
import { BEAD_RIG_FIELDS, beadRigPatch, beadRigDetails } from "../static/js/bead-rig.js";

installBrowserEnv();
const { tripFromDraft, createTripDraft } = await import("../static/js/trip-draft.js");
const { lureFromDraft } = await import("../static/js/gear-draft.js");
const { setState } = await import("../static/js/app-state.js");
const appState = { settings: { units: {} }, locations: [], rodReelCombos: [], lures: [1, 2, 3].map(id => ({ id: `bead-${id}`, type: "Bead" })) };
setState(appState);

const rig = { beadCount: 3, secondBeadLureId: "bead-2", thirdBeadLureId: "bead-3", beadAttachment: "Pegged", beadToHookDistance: "2 in", beadSpacing: "10 in", thirdBeadSpacing: "12 in" };
const source = {
  id: "trip-beads", method: "Drifting", date: "2026-10-01", launchTime: "08:00", linesPulledTime: "10:00", people: [],
  gearUsed: [{ id: "setup", startTime: "08:00", lureId: "bead-1", personId: "angler", ...rig, additive: { keep: true } }],
  catches: [{ id: "catch", species: "Rainbow Trout", lureId: "bead-1", setupLineId: "setup", quantity: 2, ...rig }],
  lostFish: [{ id: "lost", possibleSpecies: "Rainbow Trout", lureId: "bead-1", ...rig }]
};
const saved = tripFromDraft(source, { state: appState });
for (const record of [saved.gearUsed[0], saved.catches[0], saved.lostFish[0]]) for (const key of BEAD_RIG_FIELDS) assert.equal(record[key], rig[key]);
assert.equal(saved.catches[0].quantity, 2);
assert.equal(saved.lostFish[0].possibleSpecies, "Rainbow Trout");
assert.deepEqual(saved.gearUsed[0].additive, { keep: true });
const draft = createTripDraft(saved);
draft.notes = "Edited without changing beads";
const edited = tripFromDraft(draft, { state: appState });
assert.equal(edited.catches[0].thirdBeadLureId, "bead-3");
assert.equal(edited.gearUsed[0].personId, "angler");
assert.equal(beadRigPatch({ ...rig, beadCount: "2" }).thirdBeadLureId, "");
assert.equal(beadRigPatch({ ...rig, beadCount: "1" }).secondBeadLureId, "");
assert.equal(beadRigPatch({ ...rig, beadCount: "1" }).beadSpacing, "");
assert.deepEqual(beadRigPatch({ lureId: "old-lure" }), {});
assert.ok(beadRigDetails(rig, id => id).some(([label, value]) => label === "Bead 3" && value === "bead-3"));
assert.equal(lureFromDraft({ type: "Bead", beadMaterial: " Glass ", beadFinish: " Translucent " }).beadMaterial, "Glass");
assert.equal(lureFromDraft({ type: "Bead", beadFinish: "Opaque" }).beadFinish, "Opaque");
assert.equal(lureFromDraft({ type: "Spoon", beadMaterial: "Glass" }).beadMaterial, "");
