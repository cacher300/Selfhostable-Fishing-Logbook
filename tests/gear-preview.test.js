import assert from "node:assert/strict";
import { installBrowserEnv } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { originalMediaUrl, previewImage } = await import("../static/js/app-media.js");

const gear = {
  heroMediaId: "featured",
  media: [
    { id: "video", category: "lures", filename: "clip.mp4", mediaType: "video" },
    { id: "first", category: "lures", filename: "first.jpg", mediaType: "image" },
    { id: "featured", category: "lures", filename: "featured.jpg", mediaType: "image" },
  ],
};

assert.equal(previewImage(gear), "/uploads/lures/featured.jpg");
assert.equal(originalMediaUrl(gear), "/uploads/lures/featured.jpg");
assert.equal(previewImage({ media: [gear.media[0]] }), "");
