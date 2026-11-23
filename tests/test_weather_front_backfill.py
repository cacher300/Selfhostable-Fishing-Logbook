from copy import deepcopy
import importlib.util
from pathlib import Path
import pytest

from backend.backend_config import DEFAULT_LOGBOOK
from backend.storage.local import LocalLogbookStore

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/classify_old_trip_fronts.py"
if not SCRIPT.is_file():
    pytest.skip("The disposable backfill script has been removed.", allow_module_level=True)
SPEC = importlib.util.spec_from_file_location("front_backfill", SCRIPT)
backfill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backfill)


def stable_context(trip, point):
    from datetime import datetime, timedelta
    start = datetime(2026, 10, 31)
    return {"hourly": {"time": [(start + timedelta(hours=i)).isoformat(timespec="minutes") for i in range(72)], "temperature_2m": [12] * 72, "pressure_msl": [1015] * 72, "wind_speed_10m": [15] * 72, "wind_direction_10m": [200] * 72}}


def test_backfill_is_explicit_preserves_other_fields_and_backup_pairs_media(tmp_path):
    document = deepcopy(DEFAULT_LOGBOOK)
    document["locations"] = [{"id": "lake", "name": "Test Lake", "coordinates": {"latitude": 43, "longitude": -79}, "launches": []}]
    base = {"date": "2026-11-01", "launchTime": "06:00", "linesPulledTime": "10:00", "locationId": "lake", "catches": [{"id": "fish", "species": "Walleye", "quantity": 3}], "lostFish": [{"id": "lost", "possibleSpecies": "Walleye"}], "gearUsed": [], "custom": {"preserve": True}, "weatherData": {"frontTag": "Stable"}}
    document["trips"] = [{**base, "id": "auto"}, {**base, "id": "manual", "weatherFront": "pre-front"}, {**base, "id": "skip", "weatherFrontSource": "manual", "weatherFront": ""}]
    original = deepcopy(document)
    updated, counts = backfill.backfill(document, stable_context)
    assert document == original
    assert counts == {"preserved": 2, "no-front": 1}
    assert updated["trips"][1:] == original["trips"][1:]
    for key, value in original["trips"][0].items():
        if key != "weatherData":
            assert updated["trips"][0][key] == value
    assert updated["trips"][0]["weatherData"]["frontTag"] == "Stable"
    store = LocalLogbookStore(tmp_path / "logbook.sqlite3")
    revision = store.write(document, None)
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "example.txt").write_text("media", encoding="utf-8")
    backup = backfill.backup_pair(store.database_file, uploads, revision)
    assert LocalLogbookStore(backup / "logbook.sqlite3").read().document == original
    assert (backup / "uploads" / "example.txt").read_text() == "media"
    store.write(updated, revision)
    assert store.read().document == updated


def test_failed_lookup_leaves_trip_untouched():
    document = deepcopy(DEFAULT_LOGBOOK)
    document["trips"] = [{"id": "trip", "date": "2026-11-01", "coordinates": {"latitude": 43, "longitude": -79}}]
    def failed(*args):
        raise ValueError("unavailable")
    updated, counts = backfill.backfill(document, failed)
    assert updated == document
    assert counts == {"lookup_failed": 1}
