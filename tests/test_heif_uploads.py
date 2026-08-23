from __future__ import annotations

import io
import tempfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from pillow_heif import from_pillow

from backend import media_service
from server import create_app


def test_heic_upload_is_converted_to_jpeg() -> None:
    image = Image.new("RGB", (16, 12), "red")
    exif = Image.Exif()
    exif[0x0132] = "2026:08:20 06:17:42"
    exif[0x8825] = {
        1: "N",
        2: (43.0, 10.0, 0.0),
        3: "W",
        4: (79.0, 3.0, 0.0),
    }
    image.info["exif"] = exif.tobytes()
    heic = io.BytesIO()
    from_pillow(image).save(heic)
    heic.seek(0)

    with tempfile.TemporaryDirectory() as directory:
        uploads = Path(directory) / "uploads"
        with (
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch.object(media_service, "read_logbook", return_value={"settings": {}}),
        ):
            app = create_app({"TESTING": True, "SECRET_KEY": "heic-upload-test"})
            client = app.test_client()
            csrf = client.get("/api/csrf-token").get_json()["csrfToken"]
            response = client.post(
                "/api/uploads/queue",
                data={"file": (heic, "IMG_1234.HEIC", "image/heic")},
                headers={"X-CSRF-Token": csrf},
                content_type="multipart/form-data",
            )

            assert response.status_code == 200
            payload = response.get_json()
            assert payload["filename"].endswith(".jpg")
            assert payload["name"] == "IMG_1234.HEIC"
            assert payload["mimeType"] == "image/jpeg"
            assert payload["convertedFrom"] == "HEIC"
            assert payload["previewFilename"].endswith(".jpg")
            assert payload["captureDate"] == "2026-08-20"
            assert payload["captureTime"] == "06:17"
            assert payload["capturedAt"] == "2026-08-20T06:17:42"
            assert payload["coordinates"]["latitude"] == 43 + 10 / 60
            assert payload["coordinates"]["longitude"] == -(79 + 3 / 60)
            assert "_heifMetadataVersion" not in payload
            assert not list((uploads / "queue").glob("*.heic"))
            with Image.open(uploads / "queue" / payload["filename"]) as converted:
                assert converted.format == "JPEG"
                assert converted.size == (16, 12)


def test_server_exif_metadata_respects_private_photo_locations() -> None:
    metadata = {
        "captureDate": "2026-08-20",
        "captureTime": "06:17",
        "capturedAt": "2026-08-20T06:17:42",
        "coordinates": {"latitude": 43.1667, "longitude": -79.05},
    }
    logbook = {
        "settings": {
            "privatePhotoLocations": [{
                "coordinates": {"latitude": 43.1667, "longitude": -79.05},
                "radiusMeters": 400,
            }]
        }
    }

    with patch.object(media_service, "read_logbook", return_value=logbook):
        scrubbed = media_service.scrub_private_photo_metadata(metadata)

    assert scrubbed["coordinates"] is None
    assert scrubbed["gpsIgnoredReason"] == "home"
    assert "captureDate" not in scrubbed
    assert "captureTime" not in scrubbed
    assert "capturedAt" not in scrubbed


def test_existing_converted_heic_sidecar_is_backfilled_from_jpeg_exif() -> None:
    with tempfile.TemporaryDirectory() as directory:
        uploads = Path(directory) / "uploads"
        queue = uploads / "queue"
        queue.mkdir(parents=True)
        image = Image.new("RGB", (8, 8), "blue")
        exif = Image.Exif()
        exif[0x0132] = "2026:08:21 07:18:43"
        exif[0x8825] = {
            1: "N",
            2: (44.0, 0.0, 0.0),
            3: "W",
            4: (80.0, 0.0, 0.0),
        }
        image.save(queue / "converted.jpg", "JPEG", exif=exif)
        (queue / "converted.jpg.json").write_text(
            '{"name":"legacy.HEIC","convertedFrom":"HEIC","mediaType":"image"}',
            encoding="utf-8",
        )

        with (
            patch.object(media_service, "UPLOADS_DIR", uploads),
            patch.object(media_service, "read_logbook", return_value={"settings": {}}),
        ):
            metadata = media_service.read_upload_metadata("queue", "converted.jpg")

        assert metadata["captureDate"] == "2026-08-21"
        assert metadata["captureTime"] == "07:18"
        assert metadata["coordinates"] == {"latitude": 44.0, "longitude": -80.0}
        assert metadata["_heifMetadataVersion"] == 1
