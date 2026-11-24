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


def test_backfill_reclassifies_every_trip_preserves_other_fields_and_backup_pairs_media(tmp_path):
    document = deepcopy(DEFAULT_LOGBOOK)
    document["locations"] = [{"id": "lake", "name": "Test Lake", "coordinates": {"latitude": 43, "longitude": -79}, "launches": []}]
    base = {"date": "2026-11-01", "launchTime": "06:00", "linesPulledTime": "10:00", "locationId": "lake", "catches": [{"id": "fish", "species": "Walleye", "quantity": 3}], "lostFish": [{"id": "lost", "possibleSpecies": "Walleye"}], "gearUsed": [], "custom": {"preserve": True}, "weatherData": {"frontTag": "Stable"}}
    document["trips"] = [{**base, "id": "auto"}, {**base, "id": "manual", "weatherFront": "pre-front"}, {**base, "id": "unclassified", "weatherFrontSource": "manual", "weatherFront": ""}]
    original = deepcopy(document)
    updated, counts = backfill.backfill(document, stable_context)
    assert document == original
    assert counts == {"no-front": 3}
    for before, after in zip(original["trips"], updated["trips"], strict=True):
        assert after["weatherFront"] == "no-front"
        assert after["weatherFrontSource"] == "automatic"
        assert after["weatherData"]["frontAssessment"]["value"] == "no-front"
        assert after["weatherData"]["frontTag"] == "Stable"
        for key, value in before.items():
            if key not in ("weatherFront", "weatherFrontSource", "weatherData"):
                assert after[key] == value
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


def test_failed_lookup_marks_trip_unclassified_without_touching_other_fields():
    document = deepcopy(DEFAULT_LOGBOOK)
    document["trips"] = [{"id": "trip", "date": "2026-11-01", "coordinates": {"latitude": 43, "longitude": -79}, "weatherFront": "pre-front", "weatherFrontSource": "manual"}]
    def failed(*args):
        raise ValueError("unavailable")
    updated, counts = backfill.backfill(document, failed)
    assert counts == {"lookup_failed": 1}
    trip = updated["trips"][0]
    assert trip["weatherFront"] == ""
    assert trip["weatherFrontSource"] == "automatic"
    assert trip["weatherData"]["frontAssessment"]["value"] == ""
    assert "could not be retrieved" in trip["weatherData"]["frontAssessment"]["reason"]
    assert {key: trip[key] for key in ("id", "date", "coordinates")} == {key: document["trips"][0][key] for key in ("id", "date", "coordinates")}
    assert document["trips"][0]["weatherFront"] == "pre-front"
