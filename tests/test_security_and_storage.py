from __future__ import annotations

import base64
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import server
from backend import logbook_store
from backend.request_security import FixedWindowRateLimiter
from flask import Response
from server import create_app


def basic_auth(username: str = "angler", password: str = "test-password") -> dict[str, str]:
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


class SecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app(
            {
                "TESTING": True,
                "LOGBOOK_USERNAME": "angler",
                "LOGBOOK_PASSWORD": "test-password",
                "SECRET_KEY": "test-secret",
                "RATE_LIMIT_PER_MINUTE": 1_000,
            }
        )
        self.client = self.app.test_client()

    def test_private_project_files_cannot_be_downloaded(self) -> None:
        for path in (
            "/data/logbook.json",
            "/data/logbook.example.json",
            "/backups/logbook.json",
            "/.git/config",
            "/.env",
            "/server.py",
            "/backend/logbook_store.py",
            "/static/js/../../server.py",
            "/static/js/%2e%2e/%2e%2e/server.py",
        ):
            with self.subTest(path=path):
                response = self.client.get(path, headers=basic_auth())
                self.assertEqual(404, response.status_code)

    def test_logbook_json_is_not_downloadable_without_authentication(self) -> None:
        response = self.client.get("/data/logbook.json")
        self.assertEqual(401, response.status_code)
        self.assertIn("Basic", response.headers["WWW-Authenticate"])

    def test_logbook_api_requires_authentication(self) -> None:
        self.assertEqual(401, self.client.get("/api/logbook").status_code)

    def test_static_assets_are_not_marked_no_store(self) -> None:
        response = self.client.get("/static/js/app.js")
        self.assertEqual(200, response.status_code)
        self.assertNotIn("no-store", response.headers.get("Cache-Control", ""))
        response.close()

    def test_mutation_requires_csrf_token(self) -> None:
        response = self.client.put(
            "/api/logbook",
            headers=basic_auth(),
            json={"schemaVersion": 1, "trips": [], "lures": [], "flashers": []},
        )
        self.assertEqual(403, response.status_code)
        self.assertEqual("Invalid or missing CSRF token", response.get_json()["error"])

    def test_authenticated_mutation_accepts_csrf_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            data_file = Path(directory) / "logbook.json"
            token = self.client.get(
                "/api/csrf-token", headers=basic_auth()
            ).get_json()["csrfToken"]
            with (
                patch.object(logbook_store, "DATA_DIR", Path(directory)),
                patch.object(logbook_store, "DATA_FILE", data_file),
            ):
                response = self.client.put(
                    "/api/logbook",
                    headers={**basic_auth(), "X-CSRF-Token": token},
                    json={"schemaVersion": 1, "trips": [], "lures": [], "flashers": []},
                )
            self.assertEqual(200, response.status_code)
            self.assertTrue(data_file.exists())

    def test_invalid_import_returns_the_failing_json_path(self) -> None:
        token = self.client.get(
            "/api/csrf-token", headers=basic_auth()
        ).get_json()["csrfToken"]
        response = self.client.put(
            "/api/logbook",
            headers={**basic_auth(), "X-CSRF-Token": token},
            json={
                "schemaVersion": 1,
                "trips": [{"id": "trip-1", "catches": ["invalid"]}],
                "lures": [],
                "flashers": [],
            },
        )
        self.assertEqual(400, response.status_code)
        self.assertEqual(
            "trips[0].catches[0]: must be an object",
            response.get_json()["error"],
        )

    def test_storage_errors_do_not_leak_internal_details(self) -> None:
        with patch.object(
            server,
            "read_logbook",
            side_effect=logbook_store.LogbookStorageError("private file path"),
        ):
            response = self.client.get("/api/logbook", headers=basic_auth())
        self.assertEqual(500, response.status_code)
        self.assertEqual({"error": "Internal storage error"}, response.get_json())

    def test_unrelated_runtime_errors_are_not_masked(self) -> None:
        app = create_app(
            {
                "TESTING": True,
                "LOGBOOK_USERNAME": "angler",
                "LOGBOOK_PASSWORD": "test-password",
                "SECRET_KEY": "test-secret",
            }
        )

        @app.get("/test-runtime-error")
        def runtime_error() -> Response:
            raise RuntimeError("programming error")

        with self.assertRaisesRegex(RuntimeError, "programming error"):
            app.test_client().get(
                "/test-runtime-error",
                headers=basic_auth(),
            )

    def test_upload_size_limit_is_enforced(self) -> None:
        app = create_app(
            {
                "TESTING": True,
                "LOGBOOK_USERNAME": "angler",
                "LOGBOOK_PASSWORD": "test-password",
                "SECRET_KEY": "test-secret",
                "MAX_CONTENT_LENGTH": 100,
            }
        )
        client = app.test_client()
        token = client.get("/api/csrf-token", headers=basic_auth()).get_json()["csrfToken"]
        response = client.post(
            "/api/uploads/catch-photos",
            headers={**basic_auth(), "X-CSRF-Token": token},
            data={"file": (io.BytesIO(b"x" * 200), "catch.jpg")},
        )
        self.assertEqual(413, response.status_code)

    def test_rate_limit_is_enforced(self) -> None:
        app = create_app(
            {
                "TESTING": True,
                "LOGBOOK_USERNAME": "angler",
                "LOGBOOK_PASSWORD": "test-password",
                "SECRET_KEY": "test-secret",
                "RATE_LIMIT_PER_MINUTE": 2,
            }
        )
        client = app.test_client()
        self.assertEqual(302, client.get("/", headers=basic_auth()).status_code)
        self.assertEqual(302, client.get("/", headers=basic_auth()).status_code)
        response = client.get("/", headers=basic_auth())
        self.assertEqual(429, response.status_code)


class LogbookStoreTests(unittest.TestCase):
    def test_rejects_future_schema_version_with_clear_error(self) -> None:
        valid, error = logbook_store.validate_logbook(
            {"schemaVersion": 2, "trips": [], "lures": [], "flashers": []}
        )
        self.assertFalse(valid)
        self.assertEqual(
            "schemaVersion: version 2 is newer than supported version 1", error
        )

    def test_write_rejects_future_schema_version(self) -> None:
        payload = {"schemaVersion": 2, "trips": [], "lures": [], "flashers": []}
        with self.assertRaisesRegex(
            ValueError,
            "schemaVersion: version 2 is newer than supported version 1",
        ):
            logbook_store.write_logbook(payload)

    def test_rejects_non_string_unit_with_clear_error(self) -> None:
        valid, error = logbook_store.validate_logbook(
            {
                "schemaVersion": 1,
                "trips": [],
                "lures": [],
                "flashers": [],
                "settings": {"units": {"depth": []}},
            }
        )
        self.assertFalse(valid)
        self.assertEqual("settings.units.depth: has an unsupported unit", error)

    def test_write_wraps_expected_storage_errors(self) -> None:
        payload = {"schemaVersion": 1, "trips": [], "lures": [], "flashers": []}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(logbook_store, "DATA_DIR", Path(directory)),
            patch.object(logbook_store, "DATA_FILE", Path(directory) / "logbook.json"),
            patch.object(logbook_store.os, "replace", side_effect=OSError("disk error")),
            self.assertRaisesRegex(logbook_store.LogbookStorageError, "disk error"),
        ):
            logbook_store.write_logbook(payload)

    def test_write_fsyncs_directory_after_replace(self) -> None:
        payload = {"schemaVersion": 1, "trips": [], "lures": [], "flashers": []}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(logbook_store, "DATA_DIR", Path(directory)),
            patch.object(logbook_store, "DATA_FILE", Path(directory) / "logbook.json"),
            patch.object(logbook_store, "_fsync_directory") as fsync_directory,
        ):
            logbook_store.write_logbook(payload)
        fsync_directory.assert_called_once_with(Path(directory))

    def test_rejects_invalid_nested_data_with_path(self) -> None:
        valid, error = logbook_store.validate_logbook(
            {
                "schemaVersion": 1,
                "trips": [{"id": "trip-1", "catches": ["not-an-object"]}],
                "lures": [],
                "flashers": [],
            }
        )
        self.assertFalse(valid)
        self.assertEqual("trips[0].catches[0]: must be an object", error)

    def test_legacy_document_without_version_is_migrated(self) -> None:
        payload = {"trips": [], "lures": [], "flashers": []}
        valid, error = logbook_store.validate_logbook(payload)
        self.assertTrue(valid, error)
        self.assertEqual(1, logbook_store.normalize_logbook(payload)["schemaVersion"])

    def test_concurrent_writes_always_leave_complete_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)
            data_file = directory_path / "logbook.json"

            def write(index: int) -> None:
                logbook_store.write_logbook(
                    {
                        "schemaVersion": 1,
                        "trips": [{"id": f"trip-{index}", "catches": [], "lostFish": []}],
                        "lures": [],
                        "flashers": [],
                    }
                )

            with (
                patch.object(logbook_store, "DATA_DIR", directory_path),
                patch.object(logbook_store, "DATA_FILE", data_file),
            ):
                with ThreadPoolExecutor(max_workers=8) as executor:
                    list(executor.map(write, range(30)))
                stored = json.loads(data_file.read_text(encoding="utf-8"))
                valid, error = logbook_store.validate_logbook(stored)

            self.assertTrue(valid, error)
            self.assertEqual(1, len(stored["trips"]))
            self.assertEqual([], list(directory_path.glob(".logbook-*.tmp")))


class RateLimiterTests(unittest.TestCase):
    def test_expired_client_buckets_are_removed(self) -> None:
        limiter = FixedWindowRateLimiter(limit=2, window_seconds=60)
        with patch("backend.request_security.time.monotonic", return_value=0):
            self.assertTrue(limiter.allow("old-client"))
        with patch("backend.request_security.time.monotonic", return_value=61):
            self.assertTrue(limiter.allow("new-client"))
        self.assertNotIn("old-client", limiter._requests)


if __name__ == "__main__":
    unittest.main()
