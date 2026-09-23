from __future__ import annotations

import json
from copy import deepcopy
from zipfile import ZIP_STORED, ZipFile

from backend.backend_config import DEFAULT_LOGBOOK
from backend.logbook_store import validate_logbook
from scripts.migrate_logbook_v2 import (
    _read_archive,
    _rewrite_archive,
    _validate_archive_media,
    audit_document,
    migrate_document,
)


def test_legacy_fields_are_converted_outside_the_runtime_path() -> None:
    legacy = deepcopy(DEFAULT_LOGBOOK)
    legacy["schemaVersion"] = 1
    legacy["settings"] = {
        **legacy["settings"],
        "boatFeatureEnabled": True,
        "bathymetryOffsetFeet": 3,
        "defaultTrollingSpread": [{
            "comboId": "combo-1",
            "side": "port",
            "presentation": "Downrigger",
        }, {
            "comboId": "placeholder",
            "side": "",
            "presentation": "",
        }],
    }
    legacy["settings"].pop("bathymetryLakeCalibrationsFeet")
    legacy_media = {
        "id": "photo-1",
        "name": "Catch photo",
        "image": "/uploads/catch-photos/catch.jpg",
        "path": "catch-photos/catch.jpg",
        "url": "/uploads/catch-photos/catch.jpg",
        "previewImage": "/uploads/catch-photos/_previews/catch.jpg",
        "previewPath": "catch-photos/_previews/catch.jpg",
        "previewUrl": "/uploads/catch-photos/_previews/catch.jpg",
    }
    legacy["lures"] = [{
        "id": "lure-1",
        "name": "Legacy lure",
        "image": "/uploads/lures/lure.jpg",
        "imageFilename": "lure.jpg",
        "imagePath": "lures/lure.jpg",
        "previewFilename": "lure.jpg",
        "previewImage": "/uploads/lures/_previews/lure.jpg",
        "previewPath": "lures/_previews/lure.jpg",
        "photos": [{
            "filename": "lure.jpg",
            "image": "/uploads/lures/lure.jpg",
            "path": "lures/lure.jpg",
            "previewImage": "/uploads/lures/_previews/lure.jpg",
            "previewPath": "lures/_previews/lure.jpg",
        }],
    }]
    legacy["trips"] = [{
        "id": "trip-1",
        "title": "Legacy Trip",
        "date": "2026-09-22",
        "location": "Lake Ontario",
        "launch": "Jordan Harbour",
        "launchTime": "",
        "linesSetTime": "08:00",
        "startTime": "08:00",
        "linesPulledTime": "",
        "endTime": "12:00",
        "gearUsed": [{
            "id": "line-1",
            "startTime": "08:00",
            "endTime": "12:00",
            "deepestRigger": False,
            "defaultTrollingSpread": True,
            "defaultTrollingSpreadTarget": "Salmon",
        }],
        "catches": [{
            "id": "fish-1",
            "speed": "2.3",
            "photos": [legacy_media],
        }],
        "lostFish": [],
        "notePhotos": [],
        "people": [],
    }]

    migrated = migrate_document(legacy)

    assert audit_document(legacy)
    assert not audit_document(migrated)
    assert migrated["schemaVersion"] == 2
    assert migrated["settings"]["bathymetryLakeCalibrationsFeet"]["Ontario"]["offshoreOffsetFeet"] == 3
    assert migrated["settings"]["trollingSpreads"][0]["spread"][0]["side"] == "Port"
    assert all(
        row["side"] and row["presentation"]
        for spread in migrated["settings"]["trollingSpreads"]
        for row in spread["spread"]
    )
    trip = migrated["trips"][0]
    assert trip["launchTime"] == "08:00"
    assert trip["linesPulledTime"] == "12:00"
    assert "linesSetTime" not in trip
    assert "startTime" not in trip
    assert "endTime" not in trip
    assert trip["gearUsed"][0]["startTime"] == "08:00"
    assert "deepestRigger" not in trip["gearUsed"][0]
    assert trip["catches"][0]["gpsSpeed"] == "2.3"
    assert "speed" not in trip["catches"][0]
    media = trip["catches"][0]["photos"][0]
    assert media["category"] == "catch-photos"
    assert media["filename"] == "catch.jpg"
    assert media["previewFilename"] == "catch.jpg"
    assert all(key not in media for key in ("image", "path", "url", "previewImage", "previewPath", "previewUrl"))
    lure = migrated["lures"][0]
    assert len(lure["media"]) == 1
    assert lure["media"][0]["category"] == "lures"
    assert lure["media"][0]["filename"] == "lure.jpg"
    assert all(key not in lure for key in ("image", "imageFilename", "imagePath", "photos", "previewFilename", "previewImage", "previewPath"))
    assert validate_logbook(migrated)[0]


def test_canonical_v2_document_is_not_reshaped() -> None:
    canonical = deepcopy(DEFAULT_LOGBOOK)
    assert migrate_document(canonical) == canonical


def test_mobile_archive_rewrite_produces_cross_compatible_v2_archive(tmp_path) -> None:
    legacy = deepcopy(DEFAULT_LOGBOOK)
    legacy["schemaVersion"] = 1
    legacy["trips"] = [{
        "id": "trip-1",
        "date": "2026-09-22",
        "launchTime": "",
        "linesSetTime": "08:00",
        "startTime": "08:00",
        "linesPulledTime": "",
        "endTime": "12:00",
        "gearUsed": [],
        "catches": [],
        "lostFish": [],
        "people": [],
        "notePhotos": [],
    }]
    legacy["lures"] = [{
        "id": "lure-1",
        "name": "Legacy lure",
        "image": "/uploads/lures/lure.jpg",
        "imageFilename": "lure.jpg",
        "imagePath": "lures/lure.jpg",
        "previewFilename": "lure.jpg",
        "previewImage": "/uploads/lures/_previews/lure.jpg",
        "previewPath": "lures/_previews/lure.jpg",
    }]
    archive_path = tmp_path / "mobile.zip"
    with ZipFile(archive_path, "w", ZIP_STORED) as bundle:
        bundle.writestr("manifest.json", json.dumps({
            "archiveVersion": 1,
            "format": "fishing-logbook-archive",
            "schemaVersion": 1,
        }))
        bundle.writestr("logbook.json", json.dumps(legacy))
        bundle.writestr("media/lures/lure.jpg", b"image")

    manifest, source, names = _read_archive(archive_path)
    migrated = migrate_document(source)
    _validate_archive_media(migrated, names)
    _rewrite_archive(archive_path, manifest, migrated)

    final_manifest, final, final_names = _read_archive(archive_path)
    _validate_archive_media(final, final_names)
    assert final_manifest["archiveVersion"] == 2
    assert final_manifest["schemaVersion"] == 2
    assert not audit_document(final)
    assert final["trips"][0]["launchTime"] == "08:00"
    assert "linesSetTime" not in final["trips"][0]
    assert "startTime" not in final["trips"][0]
    assert "endTime" not in final["trips"][0]
    assert validate_logbook(final)[0]
