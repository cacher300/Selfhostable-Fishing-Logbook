from __future__ import annotations

import io
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from backend.backend_config import DEFAULT_LOGBOOK
from conftest import make_app


def sample_logbook() -> dict:
    return deepcopy(DEFAULT_LOGBOOK)


class CloudStorageRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.fish = make_app(
            Path(self._directory.name),
            SECRET_KEY="cloud-test",
            storage_backend="cloud",
            cloud_api_url="https://cloud.invalid",
        )
        self.app = self.fish.app
        self.client = self.fish.client

    def csrf(self) -> str:
        return self.client.get("/api/csrf-token").get_json()["csrfToken"]

    @patch("backend.cloud_storage.list_media")
    @patch("backend.cloud_storage.get_logbook")
    def test_orphan_scan_excludes_references_and_queue(self, get_logbook, list_media) -> None:
        logbook = sample_logbook()
        logbook["trips"] = [{"id": "trip", "notePhotos": [{"id": "attached", "category": "trip-photos", "filename": "attached.jpg"}]}]
        get_logbook.return_value = (logbook, '"7"')
        list_media.return_value = [
            {"category": "trip-photos", "filename": "attached.jpg"},
            {"category": "trip-photos", "filename": "orphan.jpg"},
            {"category": "queue", "filename": "waiting.jpg"},
        ]

        response = self.client.get("/api/orphaned-media")

        self.assertEqual(200, response.status_code)
        self.assertEqual(["orphan.jpg"], [item["filename"] for item in response.get_json()["media"]])

    @patch("backend.cloud_storage.list_media", return_value=[{}] * 500)
    @patch("backend.cloud_storage.get_logbook")
    def test_orphan_scan_rejects_truncated_cloud_inventory(self, get_logbook, _list_media) -> None:
        get_logbook.return_value = (sample_logbook(), '"7"')

        response = self.client.get("/api/orphaned-media")

        self.assertEqual(503, response.status_code)
        self.assertIn("500-item limit", response.get_json()["error"])

    @patch("backend.cloud_storage.list_media")
    @patch("backend.cloud_storage.get_logbook")
    def test_orphan_scan_checks_categories_when_total_exceeds_limit(self, get_logbook, list_media) -> None:
        get_logbook.return_value = (sample_logbook(), '"7"')
        list_media.side_effect = lambda category=None: ([{}] * 500 if category is None else [
            {"category": category, "filename": f"{category}.jpg"}
        ])

        response = self.client.get("/api/orphaned-media")

        self.assertEqual(200, response.status_code)
        self.assertEqual(6, len(response.get_json()["media"]))

    @patch("backend.cloud_storage.get_logbook")
    def test_logbook_get_exposes_cloud_revision(self, get_logbook) -> None:
        get_logbook.return_value = (sample_logbook(), '"7"')
        response = self.client.get("/api/logbook")
        self.assertEqual(200, response.status_code)
        self.assertEqual('"7"', response.headers["ETag"])
        self.assertEqual([], response.get_json()["trips"])

    @patch("backend.cloud_storage.put_logbook", return_value='"8"')
    @patch("backend.cloud_storage.get_logbook")
    def test_logbook_put_forwards_revision(self, get_logbook, put_logbook) -> None:
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

    @patch("backend.cloud_storage.put_preview")
    @patch("backend.cloud_storage.put_media", return_value={"ok": True})
    @patch("backend.cloud_storage.get_logbook")
    def test_upload_sends_original_preview_and_metadata_to_cloud(
        self,
        get_logbook,
        put_media,
        put_preview,
    ) -> None:
        get_logbook.return_value = (sample_logbook(), '"1"')
        image_bytes = io.BytesIO()
        Image.new("RGB", (20, 20), "blue").save(image_bytes, "JPEG")
        image_bytes.seek(0)

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

    @patch("backend.cloud_storage.get_object")
    def test_private_media_route_streams_cloud_object(self, get_object) -> None:
        get_object.return_value = (b"photo-bytes", {"content-type": "image/jpeg", "etag": '"abc"'})
        response = self.client.get("/uploads/catch-photos/photo.jpg")
        self.assertEqual(200, response.status_code)
        self.assertEqual(b"photo-bytes", response.data)
        self.assertEqual('"abc"', response.headers["ETag"])


if __name__ == "__main__":
    unittest.main()
