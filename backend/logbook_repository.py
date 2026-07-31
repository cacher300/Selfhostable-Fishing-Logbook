"""SQLite persistence for the logbook document.

Domain normalization and validation intentionally live outside this module so
the database boundary is the only place that knows the SQLite schema.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from threading import RLock


_LOCK = RLock()


def _connect(database_file: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_file, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def _initialize_schema(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS logbook_metadata (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS logbook_entries (
            collection_name TEXT NOT NULL,
            position INTEGER NOT NULL,
            record_id TEXT,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (collection_name, position)
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_logbook_entries_record_id "
        "ON logbook_entries (collection_name, record_id)"
    )


def exists(database_file: Path) -> bool:
    return database_file.exists()


def initialize(database_file: Path) -> None:
    with _LOCK:
        database_file.parent.mkdir(parents=True, exist_ok=True)
        with closing(_connect(database_file)) as connection:
            with connection:
                _initialize_schema(connection)


def read(database_file: Path, collection_keys: tuple[str, ...]) -> dict | None:
    """Read the stored document, returning ``None`` when it has no rows yet."""
    with _LOCK:
        if not database_file.exists():
            return None
        with closing(_connect(database_file)) as connection:
            with connection:
                _initialize_schema(connection)
                metadata = {
                    row["key"]: json.loads(row["value_json"])
                    for row in connection.execute("SELECT key, value_json FROM logbook_metadata")
                }
                if not metadata:
                    return None
                loaded = metadata.get("extra", {})
                loaded["schemaVersion"] = metadata.get("schemaVersion", 0)
                loaded["settings"] = metadata.get("settings", {})
                for collection_name in collection_keys:
                    loaded[collection_name] = [
                        json.loads(row["payload_json"])
                        for row in connection.execute(
                            "SELECT payload_json FROM logbook_entries "
                            "WHERE collection_name = ? ORDER BY position",
                            (collection_name,),
                        )
                    ]
                return loaded


def write(
    database_file: Path,
    normalized: dict,
    collection_keys: tuple[str, ...],
    object_collection_keys: set[str],
) -> None:
    """Replace the persisted document atomically in one SQLite transaction."""
    extras = {
        key: value
        for key, value in normalized.items()
        if key not in {*collection_keys, "schemaVersion", "settings"}
    }
    with _LOCK:
        database_file.parent.mkdir(parents=True, exist_ok=True)
        with closing(_connect(database_file)) as connection:
            _initialize_schema(connection)
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute("DELETE FROM logbook_metadata")
                connection.execute("DELETE FROM logbook_entries")
                connection.executemany(
                    "INSERT INTO logbook_metadata (key, value_json) VALUES (?, ?)",
                    (
                        ("schemaVersion", json.dumps(normalized["schemaVersion"], allow_nan=False)),
                        ("settings", json.dumps(normalized["settings"], allow_nan=False)),
                        ("extra", json.dumps(extras, allow_nan=False)),
                    ),
                )
                for collection_name in collection_keys:
                    connection.executemany(
                        """
                        INSERT INTO logbook_entries (collection_name, position, record_id, payload_json)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            (
                                collection_name,
                                position,
                                str(record.get("id")) if collection_name in object_collection_keys and record.get("id") else None,
                                json.dumps(record, allow_nan=False, separators=(",", ":")),
                            )
                            for position, record in enumerate(normalized[collection_name])
                        ),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
