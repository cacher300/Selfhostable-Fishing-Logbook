from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from backend import logbook_store, media_service
from server import create_app


def sample_logbook() -> dict:
    return logbook_store.normalize_logbook({
        "schemaVersion": 1,
        "trips": [],
        "lures": [],
        "flashers": [],
    })


class CloudStorageRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app({"TESTING": True, "SECRET_KEY": "cloud-test"})
        self.client = self.app.test_client()

    def csrf(self) -> str:
        return self.client.get("/api/csrf-token").get_json()["csrfToken"]

    @patch("server.cloud_storage.enabled", return_value=True)
    @patch("server.cloud_storage.get_logbook")
    def test_logbook_get_exposes_cloud_revision(self, get_logbook, _enabled) -> None:
        get_logbook.return_value = (sample_logbook(), '"7"')
        response = self.client.get("/api/logbook")
        self.assertEqual(200, response.status_code)
        self.assertEqual('"7"', response.headers["ETag"])
        self.assertEqual([], response.get_json()["trips"])

    @patch("server.cloud_storage.enabled", return_value=True)
    @patch("server.cloud_storage.put_logbook", return_value='"8"')
    @patch("server.cloud_storage.get_logbook")
    def test_logbook_put_forwards_revision(self, get_logbook, put_logbook, _enabled) -> None:
        payload = sample_logbook()
        get_logbook.return_value = (payload, '"7"')
        response = self.client.put(
            "/api/logbook",
            json=payload,
            headers={"X-CSRF-Token": self.csrf(), "If-Match": '"7"'},
        )
        self.assertEqual(200, response.status_code)
        self.assertEqual('"8"', response.headers["ETag"])
        self.assertEqual('"7"', put_logbook.call_args.args[1])

    @patch("server.cloud_storage.enabled", return_value=True)
    @patch("server.cloud_storage.put_preview")
    @patch("server.cloud_storage.put_media", return_value={"ok": True})
    @patch("server.cloud_storage.get_logbook")
    def test_upload_sends_original_preview_and_metadata_to_cloud(
        self,
        get_logbook,
        put_media,
        put_preview,
        _enabled,
    ) -> None:
        get_logbook.return_value = (sample_logbook(), '"1"')
        image_bytes = io.BytesIO()
        Image.new("RGB", (20, 20), "blue").save(image_bytes, "JPEG")
        image_bytes.seek(0)

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(media_service, "UPLOADS_DIR", Path(directory)):
                response = self.client.post(
                    "/api/uploads/catch-photos",
                    data={"file": (image_bytes, "catch.jpg")},
                    content_type="multipart/form-data",
                    headers={"X-CSRF-Token": self.csrf()},
                )

        self.assertEqual(200, response.status_code)
        self.assertEqual("catch-photos", put_media.call_args.args[0])
        self.assertEqual("catch.jpg", put_media.call_args.args[4])
        self.assertEqual("image", put_media.call_args.args[5]["mediaType"])
        put_preview.assert_called_once()

    @patch("server.cloud_storage.enabled", return_value=True)
    @patch("server.cloud_storage.get_object")
    def test_private_media_route_streams_cloud_object(self, get_object, _enabled) -> None:
        get_object.return_value = (b"photo-bytes", {"content-type": "image/jpeg", "etag": '"abc"'})
        response = self.client.get("/uploads/catch-photos/photo.jpg")
        self.assertEqual(200, response.status_code)
        self.assertEqual(b"photo-bytes", response.data)
        self.assertEqual('"abc"', response.headers["ETag"])


if __name__ == "__main__":
    unittest.main()
