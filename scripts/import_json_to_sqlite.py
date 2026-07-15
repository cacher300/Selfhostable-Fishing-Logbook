"""Import a legacy Fishing Logbook JSON export into the SQLite backend."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import logbook_store
from backend.backend_config import DATA_FILE, DATABASE_FILE


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import a Fishing Logbook JSON file into SQLite."
    )
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=DATA_FILE,
        help=f"JSON file to import (default: {DATA_FILE})",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Allow replacing a non-empty SQLite database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.source.resolve()
    if not source.is_file():
        print(f"Import failed: JSON file not found: {source}", file=sys.stderr)
        return 1
    try:
        with source.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        print(f"Import failed: could not read {source}: {error}", file=sys.stderr)
        return 1

    valid, error = logbook_store.validate_logbook(payload)
    if not valid:
        print(f"Import failed: invalid logbook: {error}", file=sys.stderr)
        return 1

    if logbook_store.database_exists() and logbook_store.read_logbook() != logbook_store.normalize_logbook():
        if not args.replace:
            print(
                f"Import refused: {DATABASE_FILE} already contains data. Re-run with --replace to overwrite it.",
                file=sys.stderr,
            )
            return 1

    logbook_store.write_logbook(payload)
    normalized = logbook_store.read_logbook()
    print(
        f"Imported {len(normalized['trips'])} trips, {len(normalized['lures'])} lures, "
        f"and {len(normalized['flashers'])} flashers into {DATABASE_FILE}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
