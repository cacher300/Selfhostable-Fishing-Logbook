import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql === "SELECT 1 AS ok") return { ok: 1 };
    if (this.sql.includes("payload_json, revision")) return this.db.document;
    if (this.sql.includes("SELECT revision")) {
      return this.db.document ? { revision: this.db.document.revision } : null;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith("INSERT OR IGNORE INTO logbook_documents")) {
      if (this.db.document) return { meta: { changes: 0 } };
      const [, payload_json, updated_at, updated_by] = this.values;
      this.db.document = { payload_json, revision: 1, updated_at, updated_by };
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE logbook_documents")) {
      const [payload_json, revision, updated_at, updated_by, , expectedRevision] = this.values;
      if (!this.db.document || this.db.document.revision !== expectedRevision) {
        return { meta: { changes: 0 } };
      }
      this.db.document = { payload_json, revision, updated_at, updated_by };
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("INSERT INTO media_objects")) {
      const [object_key, category, filename, original_name, content_type, byte_size, etag, uploaded_at, uploaded_by] = this.values;
      this.db.media.set(object_key, { object_key, category, filename, original_name, content_type, byte_size, etag, uploaded_at, uploaded_by });
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("DELETE FROM media_objects")) {
      this.db.media.delete(this.values[0]);
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled test SQL: ${this.sql}`);
  }

  async all() {
    let rows = [...this.db.media.values()];
    if (this.sql.includes("WHERE category = ?")) rows = rows.filter((row) => row.category === this.values[0]);
    return { results: rows };
  }
}

class D1Mock {
  constructor() {
    this.document = null;
    this.media = new Map();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }
}

class R2ObjectMock {
  constructor(body, options) {
    this.bytes = body;
    this.body = body;
    this.size = body.byteLength;
    this.etag = "test-etag";
    this.httpEtag = '"test-etag"';
    this.options = options;
  }

  writeHttpMetadata(headers) {
    headers.set("Content-Type", this.options.httpMetadata.contentType);
  }
}

class R2Mock {
  constructor() {
    this.objects = new Map();
  }

  async put(key, stream, options) {
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const object = new R2ObjectMock(bytes, options);
    this.objects.set(key, object);
    return object;
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async head(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

function environment(token = "test-secret") {
  return { FISH_API_TOKEN: token, FISH_DB: new D1Mock(), FISH_MEDIA: new R2Mock() };
}

function request(path, options = {}) {
  return new Request(`https://fish-api.example.test${path}`, options);
}

function authorized(options = {}) {
  return {
    ...options,
    headers: {
      Authorization: "Bearer test-secret",
      ...(options.headers || {}),
    },
  };
}

test("health checks the D1 binding without authentication", async () => {
  const response = await worker.fetch(request("/health"), environment());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "fish-logger-api" });
});

test("private API refuses missing credentials and missing server configuration", async () => {
  const missing = await worker.fetch(request("/api/logbook"), environment());
  assert.equal(missing.status, 401);

  const unconfigured = await worker.fetch(request("/api/logbook"), environment(""));
  assert.equal(unconfigured.status, 503);
});

test("logbook create, read, update, and stale-write conflict preserve revisions", async () => {
  const env = environment();
  const first = await worker.fetch(request("/api/logbook", authorized({
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": '"0"' },
    body: JSON.stringify({ schemaVersion: 1, trips: [] }),
  })), env);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("ETag"), '"1"');

  const loaded = await worker.fetch(request("/api/logbook", authorized()), env);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get("ETag"), '"1"');
  assert.deepEqual(await loaded.json(), { schemaVersion: 1, trips: [] });

  const updated = await worker.fetch(request("/api/logbook", authorized({
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": '"1"' },
    body: JSON.stringify({ schemaVersion: 1, trips: [{ id: "trip-1" }] }),
  })), env);
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("ETag"), '"2"');

  const stale = await worker.fetch(request("/api/logbook", authorized({
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": '"1"' },
    body: JSON.stringify({ schemaVersion: 1, trips: [] }),
  })), env);
  assert.equal(stale.status, 409);
});

test("media upload, authenticated retrieval, listing, and deletion use R2 and D1", async () => {
  const env = environment();
  const uploaded = await worker.fetch(request("/api/media/trip-photos/photo.jpg", authorized({
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg",
      "X-Original-Filename": "my fish.jpg",
      "X-Fish-Client": "desktop",
    },
    body: new Uint8Array([1, 2, 3]),
  })), env);
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).size, 3);

  const listed = await worker.fetch(request("/api/media?category=trip-photos", authorized()), env);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).media.length, 1);

  const downloaded = await worker.fetch(request("/api/media/trip-photos/photo.jpg", authorized()), env);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), new Uint8Array([1, 2, 3]));

  const removed = await worker.fetch(request("/api/media/trip-photos/photo.jpg", authorized({ method: "DELETE" })), env);
  assert.equal(removed.status, 200);
  const missing = await worker.fetch(request("/api/media/trip-photos/photo.jpg", authorized()), env);
  assert.equal(missing.status, 404);
});

test("media upload rejects unsafe filenames and empty objects", async () => {
  const env = environment();
  const unsafe = await worker.fetch(request("/api/media/trip-photos/bad%0Aname.jpg", authorized({
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: new Uint8Array([1]),
  })), env);
  assert.equal(unsafe.status, 404);

  const empty = await worker.fetch(request("/api/media/trip-photos/empty.jpg", authorized({
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: new Uint8Array(),
  })), env);
  assert.equal(empty.status, 400);
  assert.equal(env.FISH_MEDIA.objects.size, 0);
  assert.equal(env.FISH_DB.media.size, 0);
});
