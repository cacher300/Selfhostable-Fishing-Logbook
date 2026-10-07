import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const appState = await import("../static/js/app-state.js");
const { nextReelCopyShortName, syncReelGroupQuantity } = await import("../static/js/gear-core.js");

appState.setState({
  reels: [
    { id: "one", shortName: "Convector", brand: "Okuma", name: "Convector", modelGroupId: "one" },
    { id: "two", shortName: "Convector #2", brand: "Okuma", name: "Convector", modelGroupId: "one" },
  ],
});

assert.equal(nextReelCopyShortName(appState.state.reels[0]), "Convector #3");
assert.equal(nextReelCopyShortName(appState.state.reels[1]), "Convector #3");
assert.equal(
  nextReelCopyShortName({ brand: "Shimano", name: "Stradic" }),
  "Shimano Stradic #2",
);

const syncedReels = syncReelGroupQuantity("one", 2);
assert.equal(syncedReels[0].quantityAvailable, "2");
assert.equal(syncedReels[1].quantityAvailable, "2");
