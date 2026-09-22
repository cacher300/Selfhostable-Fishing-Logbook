from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend import logbook_store, media_service
from server import create_app


def shared_source() -> dict:
    return {
        "schemaVersion": 1,
        "trips": [
            {
                "id": "shared-source",
                "title": "Saturday Salmon",
                "date": "2026-09-20",
                "location": "Lake Ontario",
                "locationId": "loc-source",
                "launch": "Port Credit",
                "launchId": "launch-source",
                "linesSetTime": "08:00",
                "linesPulledTime": "12:00",
                "people": [{"id": "source-jose", "name": "José Smith"}],
                "gearUsed": [{"id": "line-source", "comboId": "combo-source", "lureId": "lure-source"}],
                "catches": [{
                    "id": "catch-source",
                    "personId": "source-jose",
                    "lureId": "lure-source",
                    "spotId": "spot-source",
                    "photos": [{"category": "catch-photos", "filename": "source-fish.jpg"}],
                }],
                "lostFish": [],
                "notePhotos": [{"category": "trip-photos", "filename": "source-note.jpg"}],
            },
            {"id": "unrelated-trip", "title": "Do not share", "catches": [], "lostFish": []},
        ],
        "people": [{"id": "source-jose", "name": "José Smith"}, {"id": "unused-person", "name": "Unused"}],
        "locations": [{
            "id": "loc-source",
            "name": "Lake Ontario",
            "coordinates": None,
            "launches": [{"id": "launch-source", "name": "Port Credit", "coordinates": None}],
        }],
        "spots": [{"id": "spot-source", "name": "The Hole", "coordinates": {"latitude": 43.5, "longitude": -79.6}, "radiusMeters": 100}],
        "lures": [{"id": "lure-source", "name": "Blue Spoon"}, {"id": "unused-lure", "name": "Do not share"}],
        "flashers": [],
        "rods": [{"id": "rod-source", "name": "Downrigger Rod"}],
        "reels": [{"id": "reel-source", "name": "Downrigger Reel"}],
        "rodReelCombos": [{"id": "combo-source", "rodId": "rod-source", "reelId": "reel-source", "shortName": "Downrigger"}],
    }


def target_logbook(with_overlap: bool = False) -> dict:
    trips = [{"id": "local-history", "title": "Keep this trip", "catches": [], "lostFish": []}]
    if with_overlap:
        trips.append({
            "id": "local-overlap",
            "title": "Saturday Salmon",
            "date": "2026-09-20",
            "location": "Lake Ontario",
            "launch": "Port Credit",
            "linesSetTime": "09:00",
            "linesPulledTime": "11:00",
            "people": [{"id": "local-jose", "name": "Jose Smith"}],
            "catches": [],
            "lostFish": [],
        })
    return {
        "schemaVersion": 1,
        "trips": trips,
        "people": [{"id": "local-jose", "name": "Jose Smith"}],
        "lures": [],
        "flashers": [],
        "settings": {"theme": "dark"},
    }


def csrf(client) -> dict[str, str]:
    return {"X-CSRF-Token": client.get("/api/csrf-token").get_json()["csrfToken"]}


def archive_for(client) -> bytes:
    response = client.get("/api/trips/shared-source/shared-archive")
    assert response.status_code == 200
    return response.data


def test_shared_trip_export_and_import_preserve_only_required_records() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        for category, filename, content in (
            ("catch-photos", "source-fish.jpg", b"fish"),
            ("trip-photos", "source-note.jpg", b"note"),
        ):
            path = uploads / category / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            metadata = {"mimeType": "image/jpeg"}
            if filename == "source-fish.jpg":
                metadata["previewFilename"] = "source-fish-preview.jpg"
                preview = path.parent / "_previews" / "source-fish-preview.jpg"
                preview.parent.mkdir(parents=True, exist_ok=True)
                preview.write_bytes(b"fish-preview")
            (path.with_name(f"{filename}.json")).write_text(json.dumps(metadata))

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(shared_source())
            app = create_app({"TESTING": True, "SECRET_KEY": "shared-trip-export"})
            client = app.test_client()
            archive = archive_for(client)

            with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
                manifest = json.loads(bundle.read("manifest.json"))
                shared = json.loads(bundle.read("logbook.json"))
                assert manifest["format"] == "fishing-logbook-shared-trip"
                assert len(shared["trips"]) == 1
                assert shared["trips"][0]["id"] == "shared-source"
                assert [item["id"] for item in shared["lures"]] == ["lure-source"]
                assert bundle.read("media/catch-photos/source-fish.jpg") == b"fish"

            logbook_store.write_logbook(target_logbook())
            preview = client.post(
                "/api/shared-trip-archive/preview",
                data={"archive": (io.BytesIO(archive), "shared-trip.zip")},
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert preview.status_code == 200
            assert preview.get_json()["people"][0]["suggestedPersonId"] == "local-jose"

            imported = client.post(
                "/api/shared-trip-archive/import",
                data={
                    "archive": (io.BytesIO(archive), "shared-trip.zip"),
                    "personMappings": json.dumps({"source-jose": "local-jose"}),
                    "duplicateAction": "add",
                },
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert imported.status_code == 200
            imported_trip_id = imported.get_json()["tripId"]
            stored = logbook_store.read_logbook()
            assert {trip["id"] for trip in stored["trips"]} == {"local-history", imported_trip_id}
            imported_trip = next(trip for trip in stored["trips"] if trip["id"] == imported_trip_id)
            assert imported_trip["people"][0]["id"] == "local-jose"
            assert imported_trip["catches"][0]["personId"] == "local-jose"
            imported_filename = imported_trip["catches"][0]["photos"][0]["filename"]
            assert imported_filename != "source-fish.jpg"
            assert (uploads / "catch-photos" / imported_filename).read_bytes() == b"fish"
            imported_metadata = json.loads((uploads / "catch-photos" / f"{imported_filename}.json").read_text())
            assert (uploads / "catch-photos" / "_previews" / imported_metadata["previewFilename"]).read_bytes() == b"fish-preview"
            assert stored["settings"]["theme"] == "dark"


def test_shared_trip_overlap_requires_explicit_selection_and_can_keep_local_or_replace() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        for category, filename in (("catch-photos", "source-fish.jpg"), ("trip-photos", "source-note.jpg")):
            path = uploads / category / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"media")
            path.with_name(f"{filename}.json").write_text("{}")

        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            logbook_store.write_logbook(shared_source())
            app = create_app({"TESTING": True, "SECRET_KEY": "shared-trip-overlap"})
            client = app.test_client()
            archive = archive_for(client)
            logbook_store.write_logbook(target_logbook(with_overlap=True))

            preview = client.post(
                "/api/shared-trip-archive/preview",
                data={"archive": (io.BytesIO(archive), "shared-trip.zip")},
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert [item["id"] for item in preview.get_json()["candidates"]] == ["local-overlap"]

            kept = client.post(
                "/api/shared-trip-archive/import",
                data={
                    "archive": (io.BytesIO(archive), "shared-trip.zip"),
                    "personMappings": json.dumps({"source-jose": "local-jose"}),
                    "duplicateAction": "keep-local",
                },
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert kept.status_code == 200
            assert kept.get_json()["cancelled"] is True
            assert any(trip["id"] == "local-overlap" for trip in logbook_store.read_logbook()["trips"])

            replaced = client.post(
                "/api/shared-trip-archive/import",
                data={
                    "archive": (io.BytesIO(archive), "shared-trip.zip"),
                    "personMappings": json.dumps({"source-jose": "local-jose"}),
                    "duplicateAction": "replace",
                    "replacementTripId": "local-overlap",
                },
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert replaced.status_code == 200
            stored_ids = {trip["id"] for trip in logbook_store.read_logbook()["trips"]}
            assert "local-history" in stored_ids
            assert "local-overlap" not in stored_ids
            assert replaced.get_json()["tripId"] in stored_ids


def test_shared_trip_preview_rejects_full_backup_format_without_mutating_logbook() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            original = target_logbook()
            logbook_store.write_logbook(original)
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("manifest.json", json.dumps({"format": "fishing-logbook-archive", "archiveVersion": 1}))
                bundle.writestr("logbook.json", json.dumps(original))
            archive.seek(0)
            app = create_app({"TESTING": True, "SECRET_KEY": "shared-trip-invalid"})
            client = app.test_client()
            response = client.post(
                "/api/shared-trip-archive/preview",
                data={"archive": (archive, "backup.zip")},
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert response.status_code == 400
            assert "not a supported shared trip archive" in response.get_json()["error"]
            assert logbook_store.read_logbook()["trips"][0]["id"] == "local-history"


def test_shared_trip_preview_rejects_unsafe_media_paths_without_mutating_logbook() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        database = root / "logbook.sqlite3"
        uploads = root / "uploads"
        with (
            patch.object(logbook_store, "DATABASE_FILE", database),
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch("server.DATA_DIR", root),
        ):
            original = target_logbook()
            payload = shared_source()
            payload["trips"] = payload["trips"][:1]
            payload["lures"] = payload["lures"][:1]
            logbook_store.write_logbook(original)
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("manifest.json", json.dumps({"format": "fishing-logbook-shared-trip", "sharedTripArchiveVersion": 1}))
                bundle.writestr("logbook.json", json.dumps(payload))
                bundle.writestr("media/catch-photos/../../escape.jpg", b"unsafe")
            archive.seek(0)
            app = create_app({"TESTING": True, "SECRET_KEY": "shared-trip-unsafe"})
            client = app.test_client()
            response = client.post(
                "/api/shared-trip-archive/preview",
                data={"archive": (archive, "unsafe.zip")},
                headers=csrf(client),
                content_type="multipart/form-data",
            )
            assert response.status_code == 400
            assert "invalid media path" in response.get_json()["error"]
            assert logbook_store.read_logbook()["trips"][0]["id"] == "local-history"
