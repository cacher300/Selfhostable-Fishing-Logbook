CREATE TABLE IF NOT EXISTS logbook_documents (
    document_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS media_objects (
    object_key TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    etag TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL,
    uploaded_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS media_objects_category_uploaded
    ON media_objects (category, uploaded_at DESC);
