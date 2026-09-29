"""Apply record-level changes to an in-memory logbook document.

The browser sends a list of small operations instead of the whole document.
This module applies them to a copy of the current document and reports which
parts changed so storage can persist only those rows.

Supported operations::

    {"op": "upsert", "collection": "trips", "record": {...}, "index": 0}
    {"op": "delete", "collection": "trips", "id": "trip-1"}
    {"op": "replace", "collection": "species", "items": [...]}
    {"op": "settings", "value": {...}}

``index`` is optional; a new record is appended when it is omitted and an
existing record keeps its position.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class LogbookChangeError(ValueError):
    """A change request is malformed or references an unknown record."""


@dataclass
class ChangePlan:
    rewritten_collections: set[str] = field(default_factory=set)
    updated_records: dict[tuple[str, int], None] = field(default_factory=dict)
    settings_changed: bool = False

    def record_updates(self, document: dict) -> list[tuple[str, int, dict]]:
        return [
            (collection, position, document[collection][position])
            for collection, position in self.updated_records
            if collection not in self.rewritten_collections
        ]


def _record_id(record: object) -> str:
    return str(record.get("id") or "") if isinstance(record, dict) else ""


def _index_of(records: list, record_id: str) -> int | None:
    for position, record in enumerate(records):
        if _record_id(record) == record_id:
            return position
    return None


def apply_changes(
    document: dict,
    changes: object,
    *,
    collection_keys: tuple[str, ...],
    object_collection_keys: set[str],
) -> ChangePlan:
    """Mutate ``document`` in place and return what changed."""
    if not isinstance(changes, list) or not changes:
        raise LogbookChangeError("changes must be a non-empty list")
    plan = ChangePlan()
    for number, change in enumerate(changes):
        where = f"changes[{number}]"
        if not isinstance(change, dict):
            raise LogbookChangeError(f"{where} must be an object")
        operation = change.get("op")
        if operation == "settings":
            value = change.get("value")
            if not isinstance(value, dict):
                raise LogbookChangeError(f"{where}.value must be an object")
            document["settings"] = value
            plan.settings_changed = True
            continue

        collection = change.get("collection")
        if collection not in collection_keys:
            raise LogbookChangeError(f"{where}.collection is not a logbook collection")
        records = document.setdefault(collection, [])

        if operation == "replace":
            items = change.get("items")
            if not isinstance(items, list):
                raise LogbookChangeError(f"{where}.items must be a list")
            document[collection] = items
            plan.rewritten_collections.add(collection)
            continue

        if collection not in object_collection_keys:
            raise LogbookChangeError(f"{where}: {collection} only supports replace")

        if operation == "upsert":
            record = change.get("record")
            record_id = _record_id(record)
            if not record_id:
                raise LogbookChangeError(f"{where}.record must be an object with an id")
            index = change.get("index")
            if index is not None and (not isinstance(index, int) or isinstance(index, bool) or index < 0):
                raise LogbookChangeError(f"{where}.index must be a nonnegative integer")
            existing = _index_of(records, record_id)
            if existing is not None and (index is None or index == existing):
                records[existing] = record
                plan.updated_records[(collection, existing)] = None
                continue
            if existing is not None:
                records.pop(existing)
            position = len(records) if index is None else min(index, len(records))
            records.insert(position, record)
            plan.rewritten_collections.add(collection)
            continue

        if operation == "delete":
            record_id = str(change.get("id") or "")
            existing = _index_of(records, record_id) if record_id else None
            if existing is None:
                raise LogbookChangeError(f'{where}: {collection} has no record "{record_id}"')
            records.pop(existing)
            plan.rewritten_collections.add(collection)
            continue

        raise LogbookChangeError(f"{where}.op is not supported")
    return plan
