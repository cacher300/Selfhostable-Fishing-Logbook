import assert from "node:assert/strict";
import { installBrowserEnv, okJson, setFetch } from "./helpers/browser-env.mjs";

installBrowserEnv();
const { setState } = await import("../static/js/app-state.js");
const {
  beginMediaEditSession,
  cleanupDeletedMedia,
  cleanupReplacedMedia,
  finishMediaEditSession,
  markMediaEditSessionSaved,
  mediaReferenceKey,
  mediaReferenceKeys,
  trackCreatedMedia,
} = await import("../static/js/app-media.js");
const { uploadImageFile } = await import("../static/js/photos.js");

const trip = {
  notePhotos: [
    { category: "trip-photos", filename: "trip.jpg", previewFilename: "trip.jpg" },
  ],
  catches: [
    {
      photos: [
        { category: "catch-photos", filename: "catch.jpg", previewFilename: "catch.jpg" },
        { category: "catch-photos", filename: "shared.jpg" },
      ],
    },
  ],
  queuePhoto: { category: "queue", filename: "queued.jpg" },
};

assert.deepEqual(
  [...mediaReferenceKeys(trip)].sort(),
  ["catch-photos/catch.jpg", "catch-photos/shared.jpg", "queue/queued.jpg", "trip-photos/trip.jpg"],
);
assert.equal(mediaReferenceKey({ url: "/uploads/trip-photos/_previews/trip.jpg" }), "");
assert.equal(mediaReferenceKey({ path: "unknown/file.jpg" }), "");

{
  const calls = [];
  setFetch(async (url) => {
    calls.push(url);
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    if (url.includes("shared")) return okJson({}, { status: 409 });
    if (url.includes("missing")) return okJson({}, { status: 404 });
    return new Response(null, { status: 204 });
  });

  const result = await cleanupDeletedMedia([
    "trip-photos/deleted.jpg",
    "trip-photos/shared.jpg",
    "trip-photos/missing.jpg",
    "queue/queued.jpg",
  ]);

  assert.deepEqual(calls.filter((url) => url !== "/api/csrf-token").sort(), [
    "/api/uploads/trip-photos/deleted.jpg",
    "/api/uploads/trip-photos/missing.jpg",
    "/api/uploads/trip-photos/shared.jpg",
  ]);
  assert.deepEqual(result, { deleted: 1, retained: 2, failed: 0 });

  calls.length = 0;
  const replaced = await cleanupReplacedMedia(
    { photos: [
      { category: "reels", filename: "removed.jpg" },
      { category: "reels", filename: "retained.jpg" },
    ] },
    { photos: [{ category: "reels", filename: "retained.jpg" }] },
  );
  assert.deepEqual(calls.filter((url) => url !== "/api/csrf-token"), ["/api/uploads/reels/removed.jpg"]);
  assert.deepEqual(replaced, { deleted: 1, retained: 0, failed: 0 });
}

{
  const calls = [];
  setFetch(async (url) => {
    calls.push(url);
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    return okJson({}, { status: 200 });
  });

  setState({ trips: [] });
  const discarded = beginMediaEditSession("trip");
  trackCreatedMedia(discarded, { category: "catch-photos", filename: "copied.jpg" }, "queued.jpg");
  trackCreatedMedia(discarded, { category: "trip-photos", filename: "uploaded.jpg" });
  await finishMediaEditSession("trip");
  assert.deepEqual(calls.filter((url) => url !== "/api/csrf-token").sort(), [
    "/api/uploads/catch-photos/copied.jpg",
    "/api/uploads/trip-photos/uploaded.jpg",
  ]);

  calls.length = 0;
  const saved = beginMediaEditSession("trip");
  trackCreatedMedia(saved, { category: "catch-photos", filename: "attached.jpg" }, "queued.jpg");
  trackCreatedMedia(saved, { category: "catch-photos", filename: "removed.jpg" });
  setState({ trips: [{ catches: [{ photos: [{ category: "catch-photos", filename: "attached.jpg" }] }] }] });
  markMediaEditSessionSaved("trip");
  await finishMediaEditSession("trip");
  assert.deepEqual(calls.filter((url) => url !== "/api/csrf-token").sort(), [
    "/api/photo-queue/queued.jpg",
    "/api/uploads/catch-photos/removed.jpg",
  ]);
}

{
  const calls = [];
  let finishUpload;
  setState({ trips: [] });
  setFetch(async (url) => {
    calls.push(url);
    if (url === "/api/csrf-token") return okJson({ csrfToken: "test-token" });
    if (url === "/api/uploads/catch-photos") {
      return new Promise((resolve) => { finishUpload = resolve; });
    }
    return okJson({}, { status: 200 });
  });

  beginMediaEditSession("trip");
  const upload = uploadImageFile(new Blob(["photo"], { type: "image/jpeg" }), "catch-photos");
  await finishMediaEditSession("trip");
  finishUpload(okJson({ category: "catch-photos", filename: "late.jpg" }));
  await assert.rejects(upload, /editor closed/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.filter((url) => url !== "/api/csrf-token"), ["/api/uploads/catch-photos", "/api/uploads/catch-photos/late.jpg"]);
}
