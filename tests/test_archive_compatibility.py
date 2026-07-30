from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend import logbook_store, media_service
from server import create_app


def test_archive_round_trip_preserves_logbook_and_media() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        trip_media = uploads / "trip-photos"
        trip_media.mkdir(parents=True)
        (trip_media / "photo.jpg").write_bytes(b"mobile-compatible-media")
        payload = {
            "schemaVersion": 1,
            "trips": [{
                "id": "trip-1",
                "title": "Archive Trip",
                "catches": [],
                "lostFish": [],
                "notePhotos": [{
                    "id": "media-1",
                    "category": "trip-photos",
                    "filename": "photo.jpg",
                    "mediaType": "image",
                }],
            }],
            "lures": [],
            "flashers": [],
        }
        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
        ):
            logbook_store.write_logbook(payload)
            app = create_app({"TESTING": True, "SECRET_KEY": "archive-test"})
            client = app.test_client()
            exported = client.get("/api/archive")

            assert exported.status_code == 200
            with zipfile.ZipFile(io.BytesIO(exported.data)) as bundle:
                assert all(item.compress_type == zipfile.ZIP_STORED for item in bundle.infolist())
                assert json.loads(bundle.read("manifest.json"))["archiveVersion"] == 1
                assert json.loads(bundle.read("logbook.json"))["trips"][0]["title"] == "Archive Trip"
                assert bundle.read("media/trip-photos/photo.jpg") == b"mobile-compatible-media"

            csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
            imported = client.post(
                "/api/archive",
                data={"archive": (io.BytesIO(exported.data), "logbook.zip")},
                headers={"X-CSRF-Token": csrf},
                content_type="multipart/form-data",
            )
            assert imported.status_code == 200
