from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from backend import logbook_store
from backend.backend_config import DEFAULT_LOGBOOK
from backend.lure_cleanup import cleanup_duplicate_lure


def document_with_lures(lures: list[dict], **changes) -> dict:
    document = deepcopy(DEFAULT_LOGBOOK)
    document["lures"] = lures
    document.update(changes)
    return document


def test_startup_cleanup_replaces_known_references_and_removes_duplicate() -> None:
    with TemporaryDirectory() as directory:
        database = Path(directory) / "logbook.sqlite3"
        source = {"id": "swimbait-34", "name": "3/4 Paddle Tail", "type": "Swimbaits"}
        target = {"id": "white-paddle", "name": "White Paddle Tail", "type": "Soft Plastics"}
        payload = document_with_lures(
            [source, target],
            trips=[{
                "id": "trip-1",
                "title": "Test",
                "gearUsed": [{"id": "line-1", "lureId": "swimbait-34", "cheaterLureId": "swimbait-34"}],
                "catches": [{"id": "catch-1", "lureId": "swimbait-34"}],
                "lostFish": [{"id": "lost-1", "lureId": "swimbait-34"}],
                "futureRecord": {"lureId": "swimbait-34"},
            }],
        )
        logbook_store.write_logbook_file(database, payload)

        result = cleanup_duplicate_lure(database)
        stored = logbook_store.read_logbook_file(database)

        assert result.changed is True
        assert result.replaced_references == 5
        assert [lure["id"] for lure in stored["lures"]] == ["white-paddle"]
        trip = stored["trips"][0]
        assert trip["gearUsed"][0]["lureId"] == "white-paddle"
        assert trip["gearUsed"][0]["cheaterLureId"] == "white-paddle"
        assert trip["catches"][0]["lureId"] == "white-paddle"
        assert trip["lostFish"][0]["lureId"] == "white-paddle"
        assert trip["futureRecord"]["lureId"] == "white-paddle"
        assert not list(Path(directory).glob("*.bak-duplicate-lure-*"))

        second_result = cleanup_duplicate_lure(database)
        assert second_result.changed is False
        assert "no 3/4 paddle-tail swimbait" in second_result.message


def test_startup_cleanup_does_not_guess_when_matches_are_ambiguous() -> None:
    with TemporaryDirectory() as directory:
        database = Path(directory) / "logbook.sqlite3"
        payload = document_with_lures([
            {"id": "source-1", "name": "3/4 Paddle Tail", "type": "Swimbait"},
            {"id": "source-2", "name": "3/4 Paddle Tail", "type": "Swimbait"},
            {"id": "target", "name": "White Paddle Tail", "type": "Soft Plastic"},
        ])
        logbook_store.write_logbook_file(database, payload)

        result = cleanup_duplicate_lure(database)

        assert result.changed is False
        assert "expected exactly one" in result.message
        assert logbook_store.read_logbook_file(database) == payload
        assert not list(Path(directory).glob("*.bak-duplicate-lure-*"))
