from __future__ import annotations

import sqlite3
from contextlib import closing
from copy import deepcopy

import pytest

from backend.backend_config import DEFAULT_LOGBOOK
from backend.storage.local import LocalLogbookStore
from backend.storage.media_transaction import MediaTransaction


def document(**changes):
    payload = deepcopy(DEFAULT_LOGBOOK)
    payload.update(changes)
    return payload


def trip(record_id: str, title: str) -> dict:
    return {"id": record_id, "title": title, "gearUsed": [], "catches": [], "lostFish": []}


def test_logbook_get_and_put_etags_are_local_revisions(fish) -> None:
    fresh = fish.client.get("/api/logbook")
    assert fresh.status_code == 200
    assert fresh.headers["ETag"] == '"0"'

    payload = document(trips=[trip("trip-1", "First")])
    saved = fish.client.put(
        "/api/logbook",
        json=payload,
        headers={"X-CSRF-Token": fish.csrf()},
    )
    assert saved.status_code == 200
    assert saved.headers["ETag"] == '"1"'
    assert LocalLogbookStore(fish.config.database_file).read().document == payload


def test_stale_if_match_put_returns_conflict_without_changing_document(fish) -> None:
    original = document(trips=[trip("trip-1", "Original")])
    current = fish.client.put(
        "/api/logbook",
        json=original,
        headers={"X-CSRF-Token": fish.csrf()},
    ).headers["ETag"]

    changed = document(trips=[trip("trip-1", "Changed")])
    stale = fish.client.put(
        "/api/logbook",
        json=changed,
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": '"0"'},
    )
    assert current == '"1"'
    assert stale.status_code == 412
    assert stale.get_json()["revisionConflict"] is True
    assert stale.headers["ETag"] == '"1"'
    assert LocalLogbookStore(fish.config.database_file).read().document == original


def test_logbook_changes_apply_and_persist_expected_document(fish) -> None:
    base = document(
        trips=[trip("trip-1", "First"), trip("trip-2", "Second")],
        lures=[{"id": "lure-1", "name": "Control Lure"}],
    )
    revision = fish.logbook.write(base, None)
    with closing(sqlite3.connect(fish.config.database_file)) as connection:
        lure_before = connection.execute(
            "SELECT payload_json FROM logbook_entries WHERE collection_name='lures' AND position=0"
        ).fetchone()[0]

    appended = trip("trip-3", "Third")
    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "upsert", "collection": "trips", "record": appended}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": revision},
    )
    assert response.status_code == 200
    revision = response.headers["ETag"]

    updated = trip("trip-1", "First renamed")
    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "upsert", "collection": "trips", "record": updated}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": revision},
    )
    assert response.status_code == 200
    revision = response.headers["ETag"]

    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "delete", "collection": "trips", "id": "trip-2"}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": revision},
    )
    assert response.status_code == 200
    revision = response.headers["ETag"]

    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "replace", "collection": "waterClarities", "items": ["Clear", "Muddy"]}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": revision},
    )
    assert response.status_code == 200
    revision = response.headers["ETag"]

    settings = deepcopy(DEFAULT_LOGBOOK["settings"])
    settings["theme"] = "dark"
    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "settings", "value": settings}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": revision},
    )
    assert response.status_code == 200

    expected = document(
        trips=[updated, appended],
        lures=[{"id": "lure-1", "name": "Control Lure"}],
        waterClarities=["Clear", "Muddy"],
        settings=settings,
    )
    stored = LocalLogbookStore(fish.config.database_file).read().document
    assert stored == expected
    with closing(sqlite3.connect(fish.config.database_file)) as connection:
        assert connection.execute(
            "SELECT payload_json FROM logbook_entries WHERE collection_name='lures' AND position=0"
        ).fetchone()[0] == lure_before


@pytest.mark.parametrize(
    "changes, expected_status",
    [
        ([{"op": "unsupported", "collection": "trips"}], 400),
        ([{"op": "delete", "collection": "trips", "id": "missing"}], 400),
    ],
)
def test_logbook_changes_reject_invalid_requests(fish, changes, expected_status) -> None:
    fish.logbook.write(document(trips=[trip("trip-1", "First")]), None)
    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": changes},
        headers={"X-CSRF-Token": fish.csrf()},
    )
    assert response.status_code == expected_status


def test_logbook_changes_reject_stale_revision(fish) -> None:
    fish.logbook.write(document(trips=[trip("trip-1", "First")]), None)
    response = fish.client.post(
        "/api/logbook/changes",
        json={"changes": [{"op": "upsert", "collection": "trips", "record": trip("trip-2", "Second")}]},
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": '"0"'},
    )
    assert response.status_code == 412
    assert response.get_json()["revisionConflict"] is True


def test_install_after_corrupt_database_keeps_revisions_monotonic(tmp_path) -> None:
    database = tmp_path / "logbook.sqlite3"
    store = LocalLogbookStore(database)
    assert store.write(document(trips=[trip("trip-1", "First")]), None) == '"1"'
    assert store.write(document(trips=[trip("trip-2", "Second")]), None) == '"2"'
    database.write_bytes(b"not sqlite anymore")

    revision = store.install(document(trips=[trip("restored", "Restored")]))

    assert int(revision.strip('"')) > 2
    assert LocalLogbookStore(database).read().document["trips"][0]["id"] == "restored"


def test_media_transaction_promote_success_keeps_files(tmp_path) -> None:
    root = tmp_path / "media"
    source = root / "source.txt"
    source.parent.mkdir()
    source.write_bytes(b"move")
    copy_source = root / "copy-source.txt"
    copy_source.write_bytes(b"copy")
    target = root / "target.txt"
    moved = root / "moved.txt"
    copied = root / "copied.txt"

    with MediaTransaction(root / "scratch") as transaction:
        transaction.stage_bytes(target, b"staged")
        transaction.move(source, moved)
        transaction.copy(copy_source, copied)
        transaction.promote()

    assert target.read_bytes() == b"staged"
    assert moved.read_bytes() == b"move"
    assert copied.read_bytes() == b"copy"
    assert not source.exists()
    assert copy_source.read_bytes() == b"copy"


def test_media_transaction_exception_after_promote_rolls_back_everything(tmp_path) -> None:
    root = tmp_path / "media"
    root.mkdir()
    move_source = root / "move-source.txt"
    move_source.write_bytes(b"move")
    copy_source = root / "copy-source.txt"
    copy_source.write_bytes(b"copy")
    overwritten = root / "overwritten.txt"
    overwritten.write_bytes(b"old")
    removed = root / "removed.txt"
    removed.write_bytes(b"remove")
    staged_target = root / "staged.txt"
    move_target = root / "moved.txt"
    copy_target = root / "copied.txt"
    created = root / "created.txt"

    with pytest.raises(RuntimeError):
        with MediaTransaction(root / "scratch") as transaction:
            transaction.stage_bytes(staged_target, b"staged")
            transaction.stage_bytes(overwritten, b"new", overwrite=True)
            transaction.move(move_source, move_target)
            transaction.copy(copy_source, copy_target)
            transaction.remove(removed)
            transaction.promote()
            created.write_bytes(b"created")
            transaction.created(created)
            raise RuntimeError("after promote")

    assert move_source.read_bytes() == b"move"
    assert not move_target.exists()
    assert copy_source.read_bytes() == b"copy"
    assert not copy_target.exists()
    assert overwritten.read_bytes() == b"old"
    assert removed.read_bytes() == b"remove"
    assert not staged_target.exists()
    assert not created.exists()


def test_media_transaction_non_overwrite_existing_target_leaves_tree_unchanged(tmp_path) -> None:
    root = tmp_path / "media"
    root.mkdir()
    existing = root / "existing.txt"
    existing.write_bytes(b"old")

    with MediaTransaction(root / "scratch") as transaction:
        transaction.stage_bytes(existing, b"new")
        with pytest.raises(FileExistsError):
            transaction.promote()

    assert existing.read_bytes() == b"old"
