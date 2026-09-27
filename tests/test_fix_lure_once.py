from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from backend import logbook_repository, logbook_store
from backend.backend_config import DEFAULT_LOGBOOK
from scripts.fix_lure_once import run


def test_exact_lure_cleanup_replaces_references_and_is_idempotent() -> None:
    with TemporaryDirectory() as directory:
        database = Path(directory) / "logbook.sqlite3"
        payload = deepcopy(DEFAULT_LOGBOOK)
        payload["lures"] = [
            {"id": "source", "name": "Whitr 3/4 ounce paddle tail", "type": "Swimbait", "color": "White"},
            {"id": "target", "name": "White Paddle Tail", "type": "Soft Plastic"},
        ]
        payload["trips"] = [{
            "id": "trip-1",
            "title": "Test",
            "gearUsed": [{"id": "line-1", "lureId": "source", "cheaterLureId": "source"}],
            "catches": [{"id": "catch-1", "lureId": "source"}],
            "lostFish": [],
        }]
        logbook_repository.write(
            database,
            payload,
            logbook_store._COLLECTION_KEYS,
            logbook_store._OBJECT_COLLECTION_KEYS,
        )

        assert run(database) == 0
        stored = logbook_store.read_logbook_file(database)
        assert [item["id"] for item in stored["lures"]] == ["target"]
        assert stored["trips"][0]["gearUsed"][0]["lureId"] == "target"
        assert stored["trips"][0]["gearUsed"][0]["cheaterLureId"] == "target"
        assert stored["trips"][0]["catches"][0]["lureId"] == "target"

        assert run(database) == 0
