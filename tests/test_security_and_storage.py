from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
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

    def test_write_creates_sqlite_database(self) -> None:
        payload = {"schemaVersion": 1, "trips": [], "lures": [], "flashers": []}
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", database_file):
                logbook_store.write_logbook(payload)
                self.assertTrue(database_file.is_file())
                with closing(sqlite3.connect(database_file)) as connection:
                    tables = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        )
                    }
        self.assertIn("logbook_metadata", tables)
        self.assertIn("logbook_entries", tables)

    def test_write_and_read_round_trip_through_sqlite(self) -> None:
        payload = {
            "schemaVersion": 1,
            "trips": [{"id": "trip-1", "catches": [], "lostFish": [], "customTripField": "kept"}],
            "lures": [{"id": "lure-1", "name": "Blue Spoon"}],
            "flashers": [],
            "customTopLevelField": {"kept": True},
        }
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", database_file):
                logbook_store.write_logbook(payload)
                stored = logbook_store.read_logbook()
        self.assertEqual("kept", stored["trips"][0]["customTripField"])
        self.assertEqual({"kept": True}, stored["customTopLevelField"])

    def test_read_returns_defaults_before_database_exists(self) -> None:
        payload = {"schemaVersion": 1, "trips": [], "lures": [], "flashers": []}
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", database_file):
                self.assertEqual([], logbook_store.read_logbook()["trips"])

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

    def test_spoon_lure_name_can_include_size(self) -> None:
        normalized = logbook_store.normalize_logbook(
            {
                "schemaVersion": 1,
                "trips": [],
                "lures": [
                    {
                        "id": "lure-1",
                        "name": "",
                        "color": "Blue/Silver",
                        "spoonSize": "Magnum",
                        "brand": "Acme",
                        "type": "Spoon",
                    }
                ],
                "flashers": [],
            }
        )
        self.assertEqual("Blue/Silver Magnum Acme Spoon", normalized["lures"][0]["name"])

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

    def test_trip_people_are_saved_without_catches(self) -> None:
        normalized = logbook_store.normalize_logbook(
            {
                "schemaVersion": 1,
                "people": [],
                "trips": [
                    {
                        "id": "trip-1",
                        "people": [{"id": "person-1", "name": "Sam"}],
                        "catches": [],
                        "lostFish": [],
                    }
                ],
                "lures": [],
                "flashers": [],
            }
        )
        self.assertEqual([{"id": "person-1", "name": "Sam"}], normalized["trips"][0]["people"])
        self.assertEqual([{"id": "person-1", "name": "Sam"}], normalized["people"])

    def test_concurrent_writes_always_leave_complete_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)
            database_file = directory_path / "logbook.sqlite3"

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
                patch.object(logbook_store, "DATABASE_FILE", database_file),
            ):
                with ThreadPoolExecutor(max_workers=8) as executor:
                    list(executor.map(write, range(30)))
                stored = logbook_store.read_logbook()
                valid, error = logbook_store.validate_logbook(stored)

            self.assertTrue(valid, error)
            self.assertEqual(1, len(stored["trips"]))

if __name__ == "__main__":
    unittest.main()
