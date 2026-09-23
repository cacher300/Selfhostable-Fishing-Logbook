from __future__ import annotations

import io
import json
import tempfile
import zipfile
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from backend import logbook_repository, logbook_store, media_service
from backend.backend_config import DEFAULT_LOGBOOK
from server import create_app


def v2(partial: dict) -> dict:
    return {**deepcopy(DEFAULT_LOGBOOK), **partial}


def test_archive_contains_v2_logbook_and_media_and_import_restores_it() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        media = uploads / "trip-photos"
        media.mkdir(parents=True)
        (media / "photo.jpg").write_bytes(b"archive-media")
        payload = v2({"trips": [{"id": "sqlite-trip", "title": "SQLite Trip", "catches": [], "lostFish": []}]})

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch("server.DATABASE_FILE", database),
            patch("server.DATA_DIR", root),
            patch.object(media_service, "UPLOADS_DIR", uploads),
        ):
            logbook_store.write_logbook(payload)
            client = create_app({"TESTING": True, "SECRET_KEY": "database-test"}).test_client()
            exported = client.get("/api/archive")

            assert exported.status_code == 200
            assert exported.headers["Content-Disposition"] == "attachment; filename=fishing-logbook-archive.zip"
            with zipfile.ZipFile(io.BytesIO(exported.data)) as bundle:
                manifest = json.loads(bundle.read("manifest.json"))
                assert manifest["archiveVersion"] == 2
                assert manifest["schemaVersion"] == 2
                assert "logbook.sqlite3" not in bundle.namelist()
                assert json.loads(bundle.read("logbook.json")) == payload
                assert "media/trip-photos/photo.jpg" in bundle.namelist()

            logbook_store.write_logbook(v2({"trips": [{"id": "changed", "title": "Changed", "catches": [], "lostFish": []}]}))
            csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
            imported = client.post(
                "/api/archive",
                data={"archive": (io.BytesIO(exported.data), "fishing-logbook-archive.zip")},
                headers={"X-CSRF-Token": csrf},
                content_type="multipart/form-data",
            )

            assert imported.status_code == 200
            assert logbook_store.read_logbook()["trips"][0]["id"] == "sqlite-trip"


def test_invalid_stored_logbook_shows_recovery_upload_page() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch("server.DATABASE_FILE", database),
            patch("server.DATA_DIR", root),
            patch.object(media_service, "UPLOADS_DIR", uploads),
        ):
            logbook_repository.write(
                database,
                v2({"schemaVersion": 1}),
                logbook_store._COLLECTION_KEYS,
                logbook_store._OBJECT_COLLECTION_KEYS,
            )
            client = create_app({"TESTING": True, "SECRET_KEY": "recovery-test"}).test_client()

            response = client.get("/")

            assert response.status_code == 200
            assert b"Database recovery needed" in response.data
            assert b"Restore Archive" in response.data


def test_archive_round_trip_preserves_logbook_and_media() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        trip_media = uploads / "trip-photos"
        trip_media.mkdir(parents=True)
        (trip_media / "photo.jpg").write_bytes(b"mobile-compatible-media")
        payload = {
            "schemaVersion": 2,
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
            patch("server.DATABASE_FILE", database),
        ):
            logbook_store.write_logbook(v2(payload))
            app = create_app({"TESTING": True, "SECRET_KEY": "archive-test"})
            client = app.test_client()
            exported = client.get("/api/archive")

            assert exported.status_code == 200
            with zipfile.ZipFile(io.BytesIO(exported.data)) as bundle:
                assert all(item.compress_type == zipfile.ZIP_STORED for item in bundle.infolist())
                assert json.loads(bundle.read("manifest.json"))["archiveVersion"] == 2
                assert "logbook.sqlite3" not in bundle.namelist()
                assert json.loads(bundle.read("logbook.json")) == v2(payload)
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
            "schemaVersion": 2,
            "trips": [{"id": "original-trip", "title": "Original", "catches": [], "lostFish": []}],
            "lures": [],
            "flashers": [],
        }
        incoming = {
            "schemaVersion": 2,
            "trips": [{"id": "incoming-trip", "title": "Incoming", "catches": [], "lostFish": []}],
            "lures": [],
            "flashers": [],
        }
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as bundle:
            bundle.writestr("manifest.json", json.dumps({"archiveVersion": 2, "schemaVersion": 2, "format": "fishing-logbook-archive"}))
            bundle.writestr("logbook.json", json.dumps(v2(incoming)))
            bundle.writestr("media/trip-photos/photo.jpg", b"incoming-media")
        archive.seek(0)

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(v2(original))
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


def test_archive_rejects_missing_referenced_media_before_replacing_logbook() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        uploads.mkdir()
        original = v2({"trips": [{"id": "original-trip", "title": "Original", "catches": [], "lostFish": []}]})
        incoming = v2({"trips": [{
            "id": "incoming-trip", "title": "Incoming", "catches": [], "lostFish": [],
            "notePhotos": [{"id": "missing", "category": "trip-photos", "filename": "missing.jpg", "mediaType": "image"}],
        }]})
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as bundle:
            bundle.writestr("manifest.json", json.dumps({"archiveVersion": 2, "schemaVersion": 2, "format": "fishing-logbook-archive"}))
            bundle.writestr("logbook.json", json.dumps(incoming))
        archive.seek(0)
        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(original)
            client = create_app({"TESTING": True, "SECRET_KEY": "archive-missing-media-test"}).test_client()
            csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
            response = client.post(
                "/api/archive", data={"archive": (archive, "missing-media.zip")},
                headers={"X-CSRF-Token": csrf}, content_type="multipart/form-data",
            )
            assert response.status_code == 400
            assert "missing referenced media" in response.get_json()["error"].lower()
            assert logbook_store.read_logbook() == original


def test_orphan_listing_is_read_only() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        orphan = uploads / "trip-photos" / "orphan.jpg"
        orphan.parent.mkdir(parents=True)
        orphan.write_bytes(b"keep-me")
        attached = uploads / "trip-photos" / "attached.jpg"
        attached.write_bytes(b"attached")
        queued = uploads / "queue" / "waiting.jpg"
        queued.parent.mkdir(parents=True)
        queued.write_bytes(b"queued")

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(v2({
                "schemaVersion": 2,
                "trips": [{"id": "trip", "notePhotos": [{"id": "attached", "category": "trip-photos", "filename": "attached.jpg"}]}],
                "lures": [], "flashers": [],
            }))
            app = create_app({"TESTING": True, "SECRET_KEY": "orphan-list-test"})
            with app.test_client() as client:
                response = client.get("/api/orphaned-media")

            assert response.status_code == 200
            assert [item["filename"] for item in response.get_json()["media"]] == ["orphan.jpg"]
            assert orphan.read_bytes() == b"keep-me"


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
            logbook_store.write_logbook(v2({}))
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


def test_queue_copy_keeps_source_and_preview_for_review() -> None:
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
            logbook_store.write_logbook(v2({}))
            app = create_app({"TESTING": True, "SECRET_KEY": "queue-copy-test"})
            with app.test_client() as client:
                csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
                response = client.post(
                    "/api/photo-queue/copy",
                    json={"filename": "queued.jpg", "targetCategory": "catch-photos"},
                    headers={"X-CSRF-Token": csrf},
                )

            assert response.status_code == 200
            copied = response.get_json()
            target = uploads / "catch-photos" / copied["filename"]
            target_metadata = target.with_name(f"{target.name}.json")
            target_preview = uploads / "catch-photos" / "_previews" / copied["previewFilename"]
            assert source.read_bytes() == b"queued-original"
            assert source_metadata.is_file()
            assert source_preview.read_bytes() == b"queued-preview"
            assert target.read_bytes() == b"queued-original"
            assert target_metadata.is_file()
            assert target_preview.read_bytes() == b"queued-preview"


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
            logbook_store.write_logbook(v2({}))
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
