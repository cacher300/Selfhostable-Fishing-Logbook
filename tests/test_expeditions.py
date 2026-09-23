from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from backend import logbook_store
from backend.backend_config import DEFAULT_LOGBOOK
from server import create_app


class ExpeditionStorageTests(unittest.TestCase):
    def minimal_payload(self, **updates):
        payload = deepcopy(DEFAULT_LOGBOOK)
        payload.update(updates)
        return payload

    def test_new_logbook_starts_with_empty_expeditions(self) -> None:
        self.assertEqual([], self.minimal_payload()["expeditions"])

    def test_expedition_and_trip_reference_are_not_reshaped(self) -> None:
        document = self.minimal_payload(
            expeditions=[{
                "id": "exp-1",
                "name": "Lake Erie Week",
                "startDate": "2026-07-01",
                "endDate": "2026-07-07",
                "destination": "Barcelona, NY",
                "notes": "Walleye week",
            }],
            trips=[
                {"id": "trip-1", "expeditionId": "exp-1", "gearUsed": [], "catches": [], "lostFish": []},
            ],
        )
        valid, error = logbook_store.validate_logbook(document)
        self.assertTrue(valid, error)
        self.assertEqual({
            "id": "exp-1",
            "name": "Lake Erie Week",
            "startDate": "2026-07-01",
            "endDate": "2026-07-07",
            "destination": "Barcelona, NY",
            "notes": "Walleye week",
        }, document["expeditions"][0])
        self.assertEqual("exp-1", document["trips"][0]["expeditionId"])

    def test_expedition_validation_requires_name_and_ordered_iso_dates(self) -> None:
        cases = [
            ({"id": "exp-1", "name": "", "startDate": "2026-07-01", "endDate": "2026-07-07"}, "expeditions[0].name"),
            ({"id": "exp-1", "name": "Week", "startDate": "July 1", "endDate": "2026-07-07"}, "expeditions[0].startDate"),
            ({"id": "exp-1", "name": "Week", "startDate": "2026-07-08", "endDate": "2026-07-07"}, "expeditions[0].endDate"),
        ]
        for expedition, expected_path in cases:
            with self.subTest(expected_path=expected_path):
                valid, error = logbook_store.validate_logbook(self.minimal_payload(expeditions=[expedition]))
                self.assertFalse(valid)
                self.assertTrue(error.startswith(expected_path), error)

    def test_duplicate_expedition_ids_are_rejected(self) -> None:
        expedition = {"id": "duplicate", "name": "Week", "startDate": "2026-07-01", "endDate": "2026-07-07"}
        valid, error = logbook_store.validate_logbook(self.minimal_payload(expeditions=[expedition, expedition]))
        self.assertFalse(valid)
        self.assertEqual('expeditions[1].id: duplicate id "duplicate"', error)

    def test_expeditions_round_trip_through_sqlite(self) -> None:
        payload = self.minimal_payload(
            expeditions=[{"id": "exp-1", "name": "Week", "startDate": "2026-07-01", "endDate": "2026-07-07", "destination": "Erie", "notes": ""}],
            trips=[{"id": "trip-1", "expeditionId": "exp-1"}],
        )
        with tempfile.TemporaryDirectory() as directory:
            database_file = Path(directory) / "logbook.sqlite3"
            with patch.object(logbook_store, "DATABASE_FILE", database_file):
                logbook_store.write_logbook(payload)
                loaded = logbook_store.read_logbook()
        self.assertEqual("exp-1", loaded["expeditions"][0]["id"])
        self.assertEqual("exp-1", loaded["trips"][0]["expeditionId"])

    def test_expeditions_route_serves_the_spa(self) -> None:
        app = create_app({"TESTING": True, "SECRET_KEY": "expeditions-route-test"})
        with app.test_client() as client:
            response = client.get("/expeditions")
        self.assertEqual(200, response.status_code)
        self.assertIn(b'id="expeditionsPanel"', response.data)


if __name__ == "__main__":
    unittest.main()
