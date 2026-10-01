from __future__ import annotations

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


def test_malformed_if_match_is_rejected_without_changing_document(fish) -> None:
    original = document(trips=[trip("trip-1", "First")])
    fish.logbook.write(original, None)

    response = fish.client.put(
        "/api/logbook",
        json=document(trips=[trip("trip-2", "Second")]),
        headers={"X-CSRF-Token": fish.csrf(), "If-Match": '"not-a-revision"'},
    )

    assert response.status_code == 400
    assert LocalLogbookStore(fish.config.database_file).read().document == original


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


def test_cached_read_notices_database_replaced_at_same_revision(tmp_path) -> None:
    database = tmp_path / "logbook.sqlite3"
    server_view = LocalLogbookStore(database)
    server_view.initialize()
    assert server_view.read().revision == '"1"'
    assert server_view.read().document["trips"] == []

    # Another process deletes the file and installs different data, which
    # starts over at the same revision number.
    for path in tmp_path.glob("logbook.sqlite3*"):
        path.unlink()
    LocalLogbookStore(database).write(document(trips=[trip("trip-1", "Imported")]), None)

    snapshot = server_view.read()
    assert snapshot.revision == '"1"'
    assert [item["id"] for item in snapshot.document["trips"]] == ["trip-1"]
