ALTER TABLE media_objects
    ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
