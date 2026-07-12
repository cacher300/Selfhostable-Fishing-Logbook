from __future__ import annotations

import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "module-import-test-secret")

from backend import logbook_store

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

    def test_write_raises_os_error_when_replace_fails(self) -> None:
        payload = {"schemaVersion": 1, "trips": [], "lures": [], "flashers": []}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(logbook_store, "DATA_DIR", Path(directory)),
            patch.object(logbook_store, "DATA_FILE", Path(directory) / "logbook.json"),
            patch.object(logbook_store.os, "replace", side_effect=OSError("disk error")),
            self.assertRaisesRegex(OSError, "disk error"),
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

    def test_lure_name_is_generated_from_color_brand_and_type(self) -> None:
        normalized = logbook_store.normalize_logbook(
            {
                "schemaVersion": 1,
                "trips": [],
                "lures": [
                    {"id": "lure-1", "name": "", "color": "Blue/Silver", "brand": "Acme", "type": "Spoon"}
                ],
                "flashers": [],
            }
        )
        self.assertEqual("Blue/Silver Acme Spoon", normalized["lures"][0]["name"])

    def test_trip_title_is_generated_from_date_and_species(self) -> None:
        normalized = logbook_store.normalize_logbook(
            {
                "schemaVersion": 1,
                "trips": [{"id": "trip-1", "title": "", "date": "2026-07-07", "targetSpecies": "Walleye"}],
                "lures": [],
                "flashers": [],
            }
        )
        self.assertEqual("2026-07-07 Walleye Trip", normalized["trips"][0]["title"])

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

if __name__ == "__main__":
    unittest.main()
