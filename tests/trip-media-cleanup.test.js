const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/app-media.js", "utf8"));
vm.runInThisContext(fs.readFileSync("static/js/photos.js", "utf8"));

const trip = {
  notePhotos: [
    { path: "trip-photos/trip.jpg", previewPath: "trip-photos/_previews/trip.jpg" }
  ],
  catches: [
    {
      photos: [
        { url: "/uploads/catch-photos/catch.jpg", previewUrl: "/uploads/catch-photos/_previews/catch.jpg" },
        { category: "catch-photos", filename: "shared.jpg" }
      ]
    }
  ],
  queuePhoto: { path: "queue/queued.jpg" }
};

assert.deepEqual(
  [...mediaReferenceKeys(trip)].sort(),
  ["catch-photos/catch.jpg", "catch-photos/shared.jpg", "queue/queued.jpg", "trip-photos/trip.jpg"]
);
assert.equal(mediaReferenceKey({ url: "/uploads/trip-photos/_previews/trip.jpg" }), "");
assert.equal(mediaReferenceKey({ path: "unknown/file.jpg" }), "");

async function testCleanupUsesGuardedDeleteAndSkipsQueue() {
  const calls = [];
  global.location = { protocol: "https:" };
  global.protectedFetch = async (url) => {
    calls.push(url);
    if (url.includes("shared")) return { ok: false, status: 409 };
    if (url.includes("missing")) return { ok: false, status: 404 };
    return { ok: true, status: 204 };
  };

  const result = await cleanupDeletedMedia([
    "trip-photos/deleted.jpg",
    "trip-photos/shared.jpg",
    "trip-photos/missing.jpg",
    "queue/queued.jpg"
  ]);

  assert.deepEqual(calls.sort(), [
    "/api/uploads/trip-photos/deleted.jpg",
    "/api/uploads/trip-photos/missing.jpg",
    "/api/uploads/trip-photos/shared.jpg"
  ]);
  assert.deepEqual(result, { deleted: 1, retained: 2, failed: 0 });

  calls.length = 0;
  const replaced = await cleanupReplacedMedia(
    { photos: [
      { path: "reels/removed.jpg" },
      { path: "reels/retained.jpg" }
    ] },
    { photos: [{ path: "reels/retained.jpg" }] }
  );
  assert.deepEqual(calls, ["/api/uploads/reels/removed.jpg"]);
  assert.deepEqual(replaced, { deleted: 1, retained: 0, failed: 0 });
}

async function testEditorSessionCleansDiscardedUploadsAndPreservesQueueSource() {
  const calls = [];
  global.location = { protocol: "https:" };
  global.state = { trips: [] };
  global.protectedFetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200 };
  };

  const discarded = beginMediaEditSession("trip");
  trackCreatedMedia(discarded, { path: "catch-photos/copied.jpg" }, "queued.jpg");
  trackCreatedMedia(discarded, { path: "trip-photos/uploaded.jpg" });
  await finishMediaEditSession("trip");
  assert.deepEqual(calls.sort(), [
    "/api/uploads/catch-photos/copied.jpg",
    "/api/uploads/trip-photos/uploaded.jpg"
  ]);

  calls.length = 0;
  const saved = beginMediaEditSession("trip");
  trackCreatedMedia(saved, { path: "catch-photos/attached.jpg" }, "queued.jpg");
  trackCreatedMedia(saved, { path: "catch-photos/removed.jpg" });
  global.state = { trips: [{ catches: [{ photos: [{ path: "catch-photos/attached.jpg" }] }] }] };
  markMediaEditSessionSaved("trip");
  await finishMediaEditSession("trip");
  assert.deepEqual(calls.sort(), [
    "/api/photo-queue/queued.jpg",
    "/api/uploads/catch-photos/removed.jpg"
  ]);
}

async function testUploadFinishingAfterEditorClosesIsDeleted() {
  const calls = [];
  let finishUpload;
  global.state = { trips: [] };
  global.protectedFetch = async (url) => {
    calls.push(url);
    if (url.startsWith("/api/uploads/") && url.split("/").length === 4 && url.endsWith("catch-photos")) {
      return new Promise((resolve) => { finishUpload = resolve; });
    }
    return { ok: true, status: 200 };
  };

  beginMediaEditSession("trip");
  const upload = uploadImageFile(new Blob(["photo"], { type: "image/jpeg" }), "catch-photos");
  await finishMediaEditSession("trip");
  finishUpload({ ok: true, json: async () => ({ path: "catch-photos/late.jpg", url: "/uploads/catch-photos/late.jpg" }) });
  await assert.rejects(upload, /editor closed/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["/api/uploads/catch-photos", "/api/uploads/catch-photos/late.jpg"]);
}

testCleanupUsesGuardedDeleteAndSkipsQueue()
  .then(testEditorSessionCleansDiscardedUploadsAndPreservesQueueSource)
  .then(testUploadFinishingAfterEditorClosesIsDeleted)
  .then(() => console.log("trip media cleanup tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
