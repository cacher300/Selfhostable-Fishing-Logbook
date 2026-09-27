"""Remove the duplicate lure and repoint its saved references.

Run this explicitly on a server after making the usual database backup:

    python scripts/fix_lure_once.py

Set FISH_DATA_DIR when the live data directory is outside the project.
"""

from __future__ import annotations

import argparse
import sys
from copy import deepcopy
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import cloud_storage, logbook_repository, logbook_store  # noqa: E402
from backend.backend_config import DATABASE_FILE  # noqa: E402


SOURCE_NAME = "Whitr 3/4 ounce paddle tail"
SOURCE_TYPE = "Swimbait"
TARGET_NAME = "White Paddle Tail"
TARGET_TYPE = "Soft Plastic"
REFERENCE_KEYS = {"lureId", "cheaterLureId"}


def same_text(left: object, right: str) -> bool:
    return isinstance(left, str) and " ".join(left.casefold().split()) == right.casefold()


def replace_references(value: object, source_id: str, target_id: str) -> int:
    if isinstance(value, dict):
        count = 0
        for key, child in value.items():
            if key in REFERENCE_KEYS and child == source_id:
                value[key] = target_id
                count += 1
            else:
                count += replace_references(child, source_id, target_id)
        return count
    if isinstance(value, list):
        return sum(replace_references(child, source_id, target_id) for child in value)
    return 0


def persist(database_file: Path, payload: dict) -> None:
    valid, error = logbook_store.validate_logbook(payload)
    if not valid:
        raise ValueError(error)
    logbook_repository.write(
        database_file,
        payload,
        logbook_store._COLLECTION_KEYS,
        logbook_store._OBJECT_COLLECTION_KEYS,
    )


def run(database_file: Path) -> int:
    payload = logbook_store.read_logbook_file(database_file)
    lures = payload["lures"]
    sources = [
        item for item in lures
        if same_text(item.get("name"), SOURCE_NAME) and same_text(item.get("type"), SOURCE_TYPE)
    ]
    targets = [
        item for item in lures
        if same_text(item.get("name"), TARGET_NAME) and same_text(item.get("type"), TARGET_TYPE)
    ]

    if not sources:
        print(f"Already complete: {SOURCE_NAME!r} is not in the lure library.")
        return 0
    if len(sources) != 1 or len(targets) != 1:
        raise ValueError(
            f"Expected exactly one source and target; found {len(sources)} and {len(targets)}."
        )

    source_id = sources[0].get("id")
    target_id = targets[0].get("id")
    if not isinstance(source_id, str) or not source_id or not isinstance(target_id, str) or not target_id:
        raise ValueError("The matching lures must both have non-empty IDs.")
    if source_id == target_id:
        raise ValueError("Source and target lure IDs are identical.")

    updated = deepcopy(payload)
    references = replace_references(updated, source_id, target_id)
    updated["lures"] = [item for item in updated["lures"] if item.get("id") != source_id]
    persist(database_file, updated)
    print(f"Replaced {references} reference(s) and removed {SOURCE_NAME!r}; kept {TARGET_NAME!r}.")
    return 0


def main() -> int:
    if cloud_storage.enabled():
        print("Lure cleanup skipped: cloud storage is enabled; local SQLite was not changed.")
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=DATABASE_FILE,
        help="Path to logbook.sqlite3; defaults to FISH_DATA_DIR or the project data directory.",
    )
    args = parser.parse_args()
    try:
        return run(args.database.expanduser().resolve())
    except logbook_store.LogbookStorageError as error:
        print(f"Lure cleanup skipped: stored logbook is unavailable ({error}).", file=sys.stderr)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
