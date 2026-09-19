const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

vm.runInThisContext(fs.readFileSync("static/js/app-media.js", "utf8"));

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
}

testCleanupUsesGuardedDeleteAndSkipsQueue()
  .then(() => console.log("trip media cleanup tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
