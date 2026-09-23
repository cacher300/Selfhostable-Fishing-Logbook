const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/app-media.js", "utf8"), context);

const gear = {
  heroMediaId: "featured",
  media: [
    { id: "video", category: "lures", filename: "clip.mp4", mediaType: "video" },
    { id: "first", category: "lures", filename: "first.jpg", mediaType: "image" },
    { id: "featured", category: "lures", filename: "featured.jpg", mediaType: "image" },
  ],
};
assert.equal(context.previewImage(gear), "/uploads/lures/featured.jpg");
assert.equal(context.originalMediaUrl(gear), "/uploads/lures/featured.jpg");
assert.equal(context.previewImage({ media: [gear.media[0]] }), "");

console.log("v2 gear previews use the featured image and skip videos");
