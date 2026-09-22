function previewImage(item) {
  return item?.previewImage || item?.previewUrl || item?.image || item?.url || "";
}

function isVideoMedia(item) {
  return item?.mediaType === "video" || item?.mimeType?.startsWith?.("video/");
}

function originalMediaUrl(item) {
  return item?.url || item?.image || previewImage(item);
}

const uploadMediaCategories = new Set([
  "catch-photos",
  "trip-photos",
  "lures",
  "flashers",
  "reels",
  "rods",
  "queue"
]);

function mediaReferenceKey(item) {
  if (!item || typeof item !== "object") return "";

  const normalize = (category, filename) => {
    const normalizedCategory = String(category || "").trim();
    const normalizedFilename = String(filename || "").trim();
    if (!uploadMediaCategories.has(normalizedCategory) || !normalizedFilename) return "";
    if (normalizedFilename.includes("/") || normalizedFilename.includes("\\")) return "";
    return `${normalizedCategory}/${normalizedFilename}`;
  };

  const fromPath = (value, prefix = "") => {
    const path = String(value || "").trim();
    if (!path || (prefix && !path.startsWith(prefix))) return "";
    const parts = (prefix ? path.slice(prefix.length) : path).split("/");
    return parts.length === 2 ? normalize(parts[0], parts[1]) : "";
  };

  for (const field of ["path", "imagePath"]) {
    const key = fromPath(item[field]);
    if (key) return key;
  }
  for (const field of ["url", "image"]) {
    const key = fromPath(item[field], "/uploads/");
    if (key) return key;
  }
  return normalize(item.category, item.filename || item.imageFilename);
}

function mediaReferenceKeys(value, keys = new Set(), seen = new Set()) {
  if (!value || typeof value !== "object") return keys;
  if (seen.has(value)) return keys;
  seen.add(value);

  const key = mediaReferenceKey(value);
  if (key) keys.add(key);
  Object.values(value).forEach((child) => mediaReferenceKeys(child, keys, seen));
  return keys;
}

async function cleanupDeletedMedia(mediaKeys) {
  if (typeof location === "undefined" || location.protocol === "file:") {
    return { deleted: 0, retained: 0, failed: 0 };
  }

  const keys = [...new Set(mediaKeys || [])]
    .filter((key) => typeof key === "string" && key.split("/")[0] !== "queue");
  const results = await Promise.all(keys.map(async (key) => {
    const [category, filename] = key.split("/");
    try {
      const response = await protectedFetch(
        `/api/uploads/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      if (response.status === 404 || response.status === 409) return response.status;
      if (response.ok) return "deleted";
      console.warn(`Could not clean up deleted trip media ${key} (${response.status}).`);
      return "failed";
    } catch (error) {
      console.warn(`Could not clean up deleted trip media ${key}.`, error);
      return "failed";
    }
  }));

  return {
    deleted: results.filter((result) => result === "deleted").length,
    retained: results.filter((result) => result === 404 || result === 409).length,
    failed: results.filter((result) => result === "failed").length
  };
}

async function cleanupReplacedMedia(previous, current) {
  const retained = mediaReferenceKeys(current);
  return cleanupDeletedMedia([...mediaReferenceKeys(previous)].filter((key) => !retained.has(key)));
}

const mediaEditSessions = new Map();

function beginMediaEditSession(scope) {
  const session = { active: true, saved: false, keys: new Set(), claimedQueue: new Map() };
  mediaEditSessions.set(scope, session);
  return session;
}

function mediaEditSession(scope) {
  return mediaEditSessions.get(scope) || null;
}

function trackCreatedMedia(session, item, queueFilename = "") {
  const key = mediaReferenceKey(item);
  if (!session || !key || key.startsWith("queue/")) return true;
  if (!session.active) {
    cleanupDeletedMedia([key]).catch((error) => console.warn("Could not clean up a late media upload.", error));
    return false;
  }
  session.keys.add(key);
  if (queueFilename) session.claimedQueue.set(key, queueFilename);
  return true;
}

function markMediaEditSessionSaved(scope) {
  const session = mediaEditSession(scope);
  if (session) session.saved = true;
}

async function finishMediaEditSession(scope) {
  const session = mediaEditSession(scope);
  if (!session) return;
  session.active = false;
  mediaEditSessions.delete(scope);
  const referenced = session.saved ? mediaReferenceKeys(state) : new Set();
  await cleanupDeletedMedia([...session.keys].filter((key) => !referenced.has(key)));
  if (!session.saved || typeof location === "undefined" || location.protocol === "file:") return;
  const claimedSources = new Set([...session.claimedQueue]
    .filter(([key]) => referenced.has(key))
    .map(([, filename]) => filename));
  for (const filename of claimedSources) {
    try {
      const response = await protectedFetch(`/api/photo-queue/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!response.ok) console.warn(`Could not remove claimed queue media ${filename} (${response.status}).`);
    } catch (error) {
      console.warn(`Could not remove claimed queue media ${filename}.`, error);
    }
  }
}

function mediaMarkup(item, className = "") {
  const source = previewImage(item);
  if (!source) return "";
  if (isVideoMedia(item)) {
    const videoSource = originalMediaUrl(item) || source;
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(videoSource)}" controls preload="metadata"></video>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
}

function isUsableCoordinates(coordinates) {
  if (!coordinates) return false;
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}
