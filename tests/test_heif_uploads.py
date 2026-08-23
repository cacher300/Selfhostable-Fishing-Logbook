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
    heic = io.BytesIO()
    from_pillow(Image.new("RGB", (16, 12), "red")).save(heic)
    heic.seek(0)

    with tempfile.TemporaryDirectory() as directory:
        uploads = Path(directory) / "uploads"
        with patch.object(media_service, "UPLOADS_DIR", uploads):
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
            assert not list((uploads / "queue").glob("*.heic"))
            with Image.open(uploads / "queue" / payload["filename"]) as converted:
                assert converted.format == "JPEG"
                assert converted.size == (16, 12)
