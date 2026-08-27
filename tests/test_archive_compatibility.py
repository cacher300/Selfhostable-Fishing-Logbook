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
            patch("server.DATA_DIR", root),
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


def test_archive_import_rolls_back_media_when_logbook_write_fails() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        target = uploads / "trip-photos" / "photo.jpg"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"existing-media")
        original = {
            "schemaVersion": 1,
            "trips": [{"id": "original-trip", "title": "Original", "catches": [], "lostFish": []}],
            "lures": [],
            "flashers": [],
        }
        incoming = {
            "schemaVersion": 1,
            "trips": [{"id": "incoming-trip", "title": "Incoming", "catches": [], "lostFish": []}],
            "lures": [],
            "flashers": [],
        }
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as bundle:
            bundle.writestr("manifest.json", json.dumps({"archiveVersion": 1}))
            bundle.writestr("logbook.json", json.dumps(incoming))
            bundle.writestr("media/trip-photos/photo.jpg", b"incoming-media")
        archive.seek(0)

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(original)
            app = create_app({"TESTING": True, "SECRET_KEY": "archive-rollback-test"})
            with app.test_client() as client:
                csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
                with patch("server.write_logbook", side_effect=RuntimeError("simulated write failure")):
                    response = client.post(
                        "/api/archive",
                        data={"archive": (archive, "logbook.zip")},
                        headers={"X-CSRF-Token": csrf},
                        content_type="multipart/form-data",
                    )

            assert response.status_code == 400
            assert target.read_bytes() == b"existing-media"
            assert logbook_store.read_logbook()["trips"][0]["id"] == "original-trip"


def test_orphan_listing_is_read_only() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        orphan = uploads / "trip-photos" / "orphan.jpg"
        orphan.parent.mkdir(parents=True)
        orphan.write_bytes(b"keep-me")

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook({"schemaVersion": 1, "trips": [], "lures": [], "flashers": []})
            app = create_app({"TESTING": True, "SECRET_KEY": "orphan-list-test"})
            with app.test_client() as client:
                response = client.get("/api/orphaned-media")

            assert response.status_code == 200
            assert response.get_json()["media"][0]["filename"] == "orphan.jpg"
            assert orphan.read_bytes() == b"keep-me"


def test_media_reference_falls_back_from_malformed_path_to_valid_url() -> None:
    reference = {
        "path": "unknown-category/photo.jpg",
        "url": "/uploads/catch-photos/photo.jpg",
    }
    assert media_service.media_key_from_reference(reference) == ("catch-photos", "photo.jpg")


def test_media_reference_supports_explicit_category_and_filename() -> None:
    reference = {"category": "trip-photos", "filename": "photo.jpg"}
    assert media_service.media_key_from_reference(reference) == ("trip-photos", "photo.jpg")


def test_queue_claim_rolls_back_when_target_metadata_write_fails() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        queue = uploads / "queue"
        previews = queue / "_previews"
        previews.mkdir(parents=True)
        source = queue / "queued.jpg"
        source.write_bytes(b"queued-original")
        source_metadata = queue / "queued.jpg.json"
        source_metadata.write_text(json.dumps({"mediaType": "image", "previewFilename": "custom-preview.jpg"}))
        source_preview = previews / "custom-preview.jpg"
        source_preview.write_bytes(b"queued-preview")

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook({"schemaVersion": 1, "trips": [], "lures": [], "flashers": []})
            app = create_app({"TESTING": True, "PROPAGATE_EXCEPTIONS": False, "SECRET_KEY": "queue-rollback-test"})
            with app.test_client() as client:
                csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
                with patch("server.write_upload_metadata", side_effect=RuntimeError("simulated metadata failure")):
                    response = client.post(
                        "/api/photo-queue/claim",
                        json={"filename": "queued.jpg", "targetCategory": "catch-photos"},
                        headers={"X-CSRF-Token": csrf},
                    )

            assert response.status_code == 500
            assert source.read_bytes() == b"queued-original"
            assert source_metadata.is_file()
            assert source_preview.read_bytes() == b"queued-preview"
            assert not [path for path in (uploads / "catch-photos").rglob("*") if path.is_file()]


def test_queue_delete_removes_metadata_named_preview() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        queue = uploads / "queue"
        previews = queue / "_previews"
        previews.mkdir(parents=True)
        source = queue / "queued.jpg"
        source.write_bytes(b"queued-original")
        metadata = queue / "queued.jpg.json"
        metadata.write_text(json.dumps({"mediaType": "image", "previewFilename": "custom-preview.jpg"}))
        preview = previews / "custom-preview.jpg"
        preview.write_bytes(b"queued-preview")

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook({"schemaVersion": 1, "trips": [], "lures": [], "flashers": []})
            app = create_app({"TESTING": True, "SECRET_KEY": "queue-delete-test"})
            with app.test_client() as client:
                csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
                response = client.delete(
                    "/api/photo-queue/queued.jpg",
                    headers={"X-CSRF-Token": csrf},
                )

            assert response.status_code == 200
            assert not source.exists()
            assert not metadata.exists()
            assert not preview.exists()
