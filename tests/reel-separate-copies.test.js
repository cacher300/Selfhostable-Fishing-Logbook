const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  state: {
    reels: [
      { id: "one", shortName: "Convector", brand: "Okuma", name: "Convector" },
      { id: "two", shortName: "Convector #2", brand: "Okuma", name: "Convector" }
    ]
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/gear-core.js", "utf8"), context);

assert.equal(context.nextReelCopyShortName(context.state.reels[0]), "Convector #3");
assert.equal(context.nextReelCopyShortName(context.state.reels[1]), "Convector #3");
assert.equal(
  context.nextReelCopyShortName({ brand: "Shimano", name: "Stradic" }),
  "Shimano Stradic #2"
);

context.state.reels[0].modelGroupId = "one";
context.state.reels[1].modelGroupId = "one";
context.syncReelGroupQuantity("one", 2);
assert.equal(context.state.reels[0].quantityAvailable, "2");
assert.equal(context.state.reels[1].quantityAvailable, "2");
