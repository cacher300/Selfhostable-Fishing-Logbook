const ALLOWED_MEDIA_CATEGORIES = new Set([
  "catch-photos",
  "trip-photos",
  "lures",
  "flashers",
  "reels",
  "rods",
  "queue",
]);

const MAX_LOGBOOK_BYTES = 1_800_000;
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;
const encoder = new TextEncoder();

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "no-referrer");
  return secured;
}

async function equalSecret(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authorize(request, env) {
  const expected = String(env.FISH_API_TOKEN || "").trim();
  if (!expected) {
    return json({ error: "Fish API authentication is not configured" }, 503);
  }
  const authorization = request.headers.get("Authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!provided || !(await equalSecret(provided, expected))) {
    return json(
      { error: "Unauthorized" },
      401,
      { "WWW-Authenticate": 'Bearer realm="fish-logger-api"' },
    );
  }
  return null;
}

function clientName(request) {
  return (request.headers.get("X-Fish-Client") || "").trim().slice(0, 80);
}

function parseRevision(value) {
  if (!value) return null;
  const match = String(value).match(/^(?:W\/)?"?(\d+)"?$/);
  return match ? Number(match[1]) : Number.NaN;
}

function mediaPath(pathname) {
  const prefix = "/api/media/";
  if (!pathname.startsWith(prefix)) return null;
  const parts = pathname.slice(prefix.length).split("/");
  if (parts.length !== 2) return null;

  let category;
  let filename;
  try {
    category = decodeURIComponent(parts[0]);
    filename = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  if (!ALLOWED_MEDIA_CATEGORIES.has(category)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(filename)) {
    return null;
  }
  return {
    category,
    filename,
    objectKey: `media/${category}/${filename}`,
  };
}

async function getLogbook(env) {
  const row = await env.FISH_DB.prepare(
    "SELECT payload_json, revision, updated_at, updated_by FROM logbook_documents WHERE document_key = ?",
  ).bind("logbook").first();

  if (!row) {
    return json({ error: "Cloud logbook has not been initialized" }, 404);
  }

  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    return json({ error: "Stored cloud logbook is invalid" }, 500);
  }
  return json(payload, 200, {
    ETag: `"${row.revision}"`,
    "X-Logbook-Updated-At": row.updated_at,
    "X-Logbook-Updated-By": row.updated_by || "",
  });
}

async function putLogbook(request, env) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_LOGBOOK_BYTES) {
    return json({ error: "Logbook document is too large" }, 413);
  }

  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_LOGBOOK_BYTES) {
    return json({ error: "Logbook document is too large" }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Request body is not valid JSON" }, 400);
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return json({ error: "Logbook must be a JSON object" }, 400);
  }
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1) {
    return json({ error: "Logbook schemaVersion must be a positive integer" }, 400);
  }

  const existing = await env.FISH_DB.prepare(
    "SELECT revision FROM logbook_documents WHERE document_key = ?",
  ).bind("logbook").first();
  const requestedRevision = parseRevision(request.headers.get("If-Match"));
  if (Number.isNaN(requestedRevision)) {
    return json({ error: "If-Match must contain a numeric revision" }, 400);
  }
  if (requestedRevision !== null && requestedRevision !== Number(existing?.revision || 0)) {
    return json({ error: "Logbook changed since it was loaded" }, 409, {
      ETag: `"${existing?.revision || 0}"`,
    });
  }

  const updatedAt = new Date().toISOString();
  const updatedBy = clientName(request);
  if (!existing) {
    const inserted = await env.FISH_DB.prepare(
      "INSERT OR IGNORE INTO logbook_documents (document_key, payload_json, revision, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)",
    ).bind("logbook", body, updatedAt, updatedBy).run();
    if (Number(inserted.meta?.changes || 0) !== 1) {
      return json({ error: "Logbook changed while it was being created" }, 409);
    }
    return json({ ok: true, revision: 1 }, 200, { ETag: '"1"' });
  }

  const revision = Number(existing.revision) + 1;
  const updated = await env.FISH_DB.prepare(
    "UPDATE logbook_documents SET payload_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE document_key = ? AND revision = ?",
  ).bind(body, revision, updatedAt, updatedBy, "logbook", Number(existing.revision)).run();
  if (Number(updated.meta?.changes || 0) !== 1) {
    return json({ error: "Logbook changed while it was being saved" }, 409);
  }
  return json({ ok: true, revision }, 200, { ETag: `"${revision}"` });
}

async function listMedia(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  if (category && !ALLOWED_MEDIA_CATEGORIES.has(category)) {
    return json({ error: "Invalid media category" }, 400);
  }
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200) || 200));
  const query = category
    ? env.FISH_DB.prepare(
      "SELECT object_key, category, filename, original_name, content_type, byte_size, etag, uploaded_at, uploaded_by FROM media_objects WHERE category = ? ORDER BY uploaded_at DESC LIMIT ?",
    ).bind(category, limit)
    : env.FISH_DB.prepare(
      "SELECT object_key, category, filename, original_name, content_type, byte_size, etag, uploaded_at, uploaded_by FROM media_objects ORDER BY uploaded_at DESC LIMIT ?",
    ).bind(limit);
  const result = await query.all();
  return json({ media: result.results || [] });
}

async function putMedia(request, env, media) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_MEDIA_BYTES) {
    return json({ error: "Media object exceeds the 30 MB limit" }, 413);
  }
  const contentType = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim();
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    return json({ error: "Only image and video media are supported" }, 415);
  }

  const originalName = (request.headers.get("X-Original-Filename") || media.filename).slice(0, 255);
  const uploadedAt = new Date().toISOString();
  const uploadedBy = clientName(request);
  const object = await env.FISH_MEDIA.put(media.objectKey, request.body, {
    httpMetadata: { contentType },
    customMetadata: {
      category: media.category,
      originalName: encodeURIComponent(originalName),
      uploadedAt,
      uploadedBy: encodeURIComponent(uploadedBy),
    },
  });
  if (object.size === 0) {
    await env.FISH_MEDIA.delete(media.objectKey);
    return json({ error: "Media object cannot be empty" }, 400);
  }
  if (object.size > MAX_MEDIA_BYTES) {
    await env.FISH_MEDIA.delete(media.objectKey);
    return json({ error: "Media object exceeds the 30 MB limit" }, 413);
  }

  try {
    await env.FISH_DB.prepare(
      "INSERT INTO media_objects (object_key, category, filename, original_name, content_type, byte_size, etag, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(object_key) DO UPDATE SET original_name = excluded.original_name, content_type = excluded.content_type, byte_size = excluded.byte_size, etag = excluded.etag, uploaded_at = excluded.uploaded_at, uploaded_by = excluded.uploaded_by",
    ).bind(
      media.objectKey,
      media.category,
      media.filename,
      originalName,
      contentType,
      object.size,
      object.httpEtag || object.etag || "",
      uploadedAt,
      uploadedBy,
    ).run();
  } catch (error) {
    await env.FISH_MEDIA.delete(media.objectKey);
    throw error;
  }

  return json({
    ok: true,
    key: media.objectKey,
    category: media.category,
    filename: media.filename,
    originalName,
    contentType,
    size: object.size,
    etag: object.httpEtag || object.etag || "",
    uploadedAt,
  }, 201);
}

async function getMedia(request, env, media) {
  const object = request.method === "HEAD"
    ? await env.FISH_MEDIA.head(media.objectKey)
    : await env.FISH_MEDIA.get(media.objectKey);
  if (!object) return json({ error: "Media object not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("ETag", object.httpEtag || object.etag || "");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Length", String(object.size));
  headers.set("Content-Disposition", `inline; filename="${media.filename.replaceAll('"', "")}"`);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function deleteMedia(env, media) {
  const existing = await env.FISH_MEDIA.head(media.objectKey);
  if (!existing) return json({ error: "Media object not found" }, 404);
  await env.FISH_MEDIA.delete(media.objectKey);
  await env.FISH_DB.prepare("DELETE FROM media_objects WHERE object_key = ?").bind(media.objectKey).run();
  return json({ ok: true });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    try {
      await env.FISH_DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: true, service: "fish-logger-api" });
    } catch {
      return json({ ok: false, error: "D1 binding unavailable" }, 503);
    }
  }

  if (!url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, 404);
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) return authorizationError;

  if (url.pathname === "/api/logbook" && request.method === "GET") {
    return getLogbook(env);
  }
  if (url.pathname === "/api/logbook" && request.method === "PUT") {
    return putLogbook(request, env);
  }
  if (url.pathname === "/api/media" && request.method === "GET") {
    return listMedia(request, env);
  }

  const media = mediaPath(url.pathname);
  if (media && request.method === "PUT") {
    return putMedia(request, env, media);
  }
  if (media && (request.method === "GET" || request.method === "HEAD")) {
    return getMedia(request, env, media);
  }
  if (media && request.method === "DELETE") {
    return deleteMedia(env, media);
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await handleRequest(request, env));
    } catch (error) {
      console.error("Unhandled Fish Logger API error", error);
      return withSecurityHeaders(json({ error: "Internal server error" }, 500));
    }
  },
};
