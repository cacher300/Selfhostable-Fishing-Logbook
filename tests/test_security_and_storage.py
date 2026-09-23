from __future__ import annotations

import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from backend import logbook_store
from backend.backend_config import DEFAULT_LOGBOOK


def document(**changes):
    result = deepcopy(DEFAULT_LOGBOOK)
    result.update(changes)
    return result


def trip(**changes):
    return {
        "id": "trip-1", "title": "Test Trip", "date": "2026-09-22",
        "launchTime": "08:00", "linesPulledTime": "12:00",
        "gearUsed": [], "catches": [], "lostFish": [], **changes,
    }


class LogbookStoreTests(unittest.TestCase):
    def test_empty_document_is_canonical_v2(self):
        payload = document()
        self.assertEqual(2, payload["schemaVersion"])
        self.assertTrue(logbook_store.validate_logbook(payload)[0])
        self.assertEqual(10, len(payload["riggings"]))
        self.assertIn("flyCategories", payload)
        self.assertIn("structureOptions", payload)
        self.assertEqual(["Port", "Center", "Starboard"], [item["value"] for item in payload["setupLineSides"]])
        self.assertEqual("light", payload["settings"]["theme"])
        self.assertIs(payload["settings"]["hasFishHawk"], True)

    def test_current_settings_are_validated_at_the_v2_boundary(self):
        settings = deepcopy(DEFAULT_LOGBOOK["settings"])
        settings["checklists"] = [{"id": "safety", "name": "Safety", "items": [
            {"id": "vests", "label": "Check vests", "done": False}
        ]}]
        settings["privatePhotoLocations"] = [{"id": "home", "name": "Home", "coordinates": {
            "latitude": 43.2, "longitude": -79.4
        }, "radiusMeters": 10000}, {"id": "home-2", "name": "Home", "coordinates": {
            "latitude": 43.3, "longitude": -79.5
        }, "radiusMeters": 400}]
        self.assertTrue(logbook_store.validate_logbook(document(settings=settings))[0])

        invalid_theme = {**settings, "theme": "system"}
        self.assertIn("settings.theme", logbook_store.validate_logbook(document(settings=invalid_theme))[1])
        invalid_fish_hawk = {**settings, "hasFishHawk": 1}
        self.assertIn("settings.hasFishHawk", logbook_store.validate_logbook(document(settings=invalid_fish_hawk))[1])
        invalid_checklist = deepcopy(settings)
        invalid_checklist["checklists"][0]["items"][0]["done"] = "false"
        self.assertIn("settings.checklists[0].items[0].done", logbook_store.validate_logbook(document(settings=invalid_checklist))[1])
        invalid_private_location = deepcopy(settings)
        invalid_private_location["privatePhotoLocations"][0]["radiusMeters"] = 10001
        self.assertIn("settings.privatePhotoLocations[0].radiusMeters", logbook_store.validate_logbook(document(settings=invalid_private_location))[1])
        invalid_calibration = {**settings, "bathymetryLakeCalibrationsFeet": {"Ontario": {"offshoreOffsetFeet": "2.5"}}}
        self.assertIn("settings.bathymetryLakeCalibrationsFeet.Ontario.offshoreOffsetFeet", logbook_store.validate_logbook(document(settings=invalid_calibration))[1])
        invalid_chop = {**settings, "chopRanges": [{"id": "calm", "label": "Calm", "maxFeet": "0.5"}]}
        self.assertIn("settings.chopRanges[0].maxFeet", logbook_store.validate_logbook(document(settings=invalid_chop))[1])

    def test_unsupported_schema_and_missing_collection_are_rejected(self):
        payload = document(schemaVersion=3)
        self.assertEqual("schemaVersion: must be version 2", logbook_store.validate_logbook(payload)[1])
        payload = document()
        del payload["riggings"]
        self.assertEqual("riggings: is required", logbook_store.validate_logbook(payload)[1])

    def test_validation_does_not_mutate_values(self):
        fish = {"id": "fish-1", "gpsSpeed": 0, "depth_m": 18.2, "depth_ft": 59.7,
                "lake_name": "Ontario", "depth_source": "bathymetry", "fowCaught": "60",
                "photos": [{"id": "photo-1", "category": "catch-photos", "filename": "fish.jpg",
                            "captureDate": "2026-09-22", "capturedAt": "2026-09-22T08:30:00Z"}]}
        payload = document(trips=[trip(gearUsed=[{"id": "line-1", "startTime": "08:00", "endTime": "12:00"}],
                                       catches=[fish])])
        original = deepcopy(payload)
        self.assertTrue(logbook_store.validate_logbook(payload)[0])
        self.assertEqual(original, payload)

    def test_current_trip_times_round_trip_without_reshaping(self):
        trip_record = {
            "id": "current-trip", "title": "Current", "date": "2026-09-22",
            "launchTime": "07:45", "linesPulledTime": "11:00",
            "gearUsed": [{"id": "line-1", "startTime": "08:00", "endTime": "10:30"}],
            "catches": [], "lostFish": [],
        }
        payload = document(trips=[trip_record])
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(logbook_store, "DATABASE_FILE", Path(directory) / "logbook.sqlite3"):
                logbook_store.write_logbook(payload)
                stored = logbook_store.read_logbook()
        self.assertEqual(trip_record, stored["trips"][0])

    def test_round_trip_preserves_all_collections_and_unknown_current_metadata(self):
        fish = {"id": "fish-1", "time": "09:00", "coordinates": {"latitude": 43.2, "longitude": -79.4},
                "depth_m": 18.2, "depth_ft": 59.7, "fowCaught": "60",
                "heroPhotoId": "photo-1", "photos": [{"id": "photo-1", "category": "catch-photos",
                                                       "filename": "fish.jpg", "captureDate": "2026-09-22"}]}
        payload = document(trips=[trip(catches=[fish])], customTopLevelField={"kept": True})
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", file):
                logbook_store.write_logbook(payload)
                stored = logbook_store.read_logbook()
            with closing(sqlite3.connect(file)) as connection:
                self.assertEqual("ok", connection.execute("PRAGMA integrity_check").fetchone()[0])
                self.assertEqual(1, connection.execute("SELECT COUNT(*) FROM logbook_entries WHERE collection_name='riggings'").fetchone()[0] > 0)
        self.assertEqual(payload, stored)

    def test_editing_a_trip_preserves_depth_and_media_without_server_merge(self):
        fish = {"id": "fish-1", "depth_m": 18.2, "depth_ft": 59.7, "fowCaught": "60",
                "photos": [{"id": "photo", "filename": "fish.jpg", "category": "catch-photos",
                            "capturedAt": "2026-09-22T09:00:00Z"}]}
        payload = document(trips=[trip(catches=[fish])])
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(logbook_store, "DATABASE_FILE", Path(directory) / "logbook.sqlite3"):
                logbook_store.write_logbook(payload)
                edited = logbook_store.read_logbook()
                edited["trips"][0]["title"] = "Renamed"
                logbook_store.write_logbook(edited)
                stored = logbook_store.read_logbook()
        self.assertEqual(fish, stored["trips"][0]["catches"][0])

    def test_named_spread_default_must_reference_a_saved_spread(self):
        settings = deepcopy(DEFAULT_LOGBOOK["settings"])
        settings["defaultTrollingSpreadId"] = "missing"
        valid, error = logbook_store.validate_logbook(document(settings=settings))
        self.assertFalse(valid)
        self.assertEqual("settings.defaultTrollingSpreadId: must reference a saved trolling spread", error)

    def test_saved_setup_default_must_match_its_method(self):
        settings = deepcopy(DEFAULT_LOGBOOK["settings"])
        settings["savedSetups"] = [{"id": "jig", "name": "Jigging", "method": "Jigging",
                                    "rows": [{"comboId": "combo"}]}]
        settings["defaultSavedSetupIds"] = {"Casting": "jig"}
        valid, error = logbook_store.validate_logbook(document(settings=settings))
        self.assertFalse(valid)
        self.assertIn("settings.defaultSavedSetupIds.Casting", error)

    def test_invalid_units_and_nonfinite_numbers_are_rejected(self):
        settings = deepcopy(DEFAULT_LOGBOOK["settings"])
        settings["units"]["depth"] = "yards"
        self.assertIn("settings.units.depth", logbook_store.validate_logbook(document(settings=settings))[1])
        self.assertIn("$.trips", logbook_store.validate_logbook(document(trips=[trip(hours=float("nan"))]))[1])

    def test_duplicate_spot_ids_and_invalid_radius_are_rejected(self):
        spot = {"id": "spot", "name": "Point", "coordinates": {"latitude": 43, "longitude": -79}, "radiusMeters": 100}
        self.assertIn("spots[1].id", logbook_store.validate_logbook(document(spots=[spot, spot]))[1])
        bad = {**spot, "radiusMeters": 2}
        self.assertIn("spots[0].radiusMeters", logbook_store.validate_logbook(document(spots=[bad]))[1])

    def test_read_returns_v2_defaults_before_database_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(logbook_store, "DATABASE_FILE", Path(directory) / "missing.sqlite3"):
                self.assertEqual(document(), logbook_store.read_logbook())

    def test_concurrent_writes_leave_one_complete_v2_document(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", file):
                def write(index):
                    logbook_store.write_logbook(document(trips=[trip(id=f"trip-{index}")]))
                with ThreadPoolExecutor(max_workers=8) as executor:
                    list(executor.map(write, range(30)))
                stored = logbook_store.read_logbook()
            self.assertTrue(logbook_store.validate_logbook(stored)[0])
            self.assertEqual(1, len(stored["trips"]))


if __name__ == "__main__":
    unittest.main()
