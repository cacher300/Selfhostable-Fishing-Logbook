"""Startup repair for the duplicate paddle-tail lure entry.

This cleanup is intentionally narrow and idempotent. It only changes the
document when there is exactly one clearly matching swimbait duplicate and
exactly one clearly matching white soft-plastic target.
"""

from __future__ import annotations

import re
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path

from . import logbook_store
from .backend_config import DATABASE_FILE


_LURE_REFERENCE_KEYS = {"lureId", "cheaterLureId"}
_SWIMBAIT_TYPES = {"swimbait", "swimbaits"}
_SOFT_PLASTIC_TYPES = {"soft plastic", "soft plastics"}


@dataclass(frozen=True)
class LureCleanupResult:
    changed: bool
    message: str
    replaced_references: int = 0


def _normalise_text(value: object) -> str:
    text = str(value or "").casefold().replace("¾", "3/4").replace("⁄", "/")
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"[^a-z0-9/]+", " ", text)
    return " ".join(text.split())


def _has_paddle_tail(text: str) -> bool:
    return "paddle tail" in text or "paddletail" in text


def _is_duplicate_swimbait(lure: object) -> bool:
    if not isinstance(lure, dict):
        return False
    lure_type = _normalise_text(lure.get("type"))
    name = _normalise_text(lure.get("name"))
    return (
        lure_type in _SWIMBAIT_TYPES
        and _has_paddle_tail(name)
        and bool(re.search(r"(?<!\d)3/4(?!\d)", name))
    )


def _is_white_soft_plastic_paddle_tail(lure: object) -> bool:
    if not isinstance(lure, dict):
        return False
    lure_type = _normalise_text(lure.get("type"))
    name = _normalise_text(lure.get("name"))
    color = _normalise_text(lure.get("color"))
    return (
        lure_type in _SOFT_PLASTIC_TYPES
        and _has_paddle_tail(name)
        and ("white" in name or "white" in color)
    )


def _replace_lure_references(value: object, source_id: str, target_id: str) -> int:
    """Replace known lure-reference fields in nested v2 records."""
    if isinstance(value, dict):
        replaced = 0
        for key, item in value.items():
            if key in _LURE_REFERENCE_KEYS and item == source_id:
                value[key] = target_id
                replaced += 1
            else:
                replaced += _replace_lure_references(item, source_id, target_id)
        return replaced
    if isinstance(value, list):
        return sum(_replace_lure_references(item, source_id, target_id) for item in value)
    return 0


def cleanup_duplicate_lure(database_file: Path = DATABASE_FILE) -> LureCleanupResult:
    """Replace the duplicate lure and remove its library record if unambiguous."""
    database_file = Path(database_file)
    if not database_file.exists():
        return LureCleanupResult(False, "Startup lure cleanup skipped: no local database exists yet.")

    try:
        payload = logbook_store.read_logbook_file(database_file)
    except logbook_store.LogbookStorageError as error:
        return LureCleanupResult(False, f"Startup lure cleanup skipped: stored logbook is unavailable ({error}).")

    lures = payload.get("lures", [])
    source_matches = [lure for lure in lures if _is_duplicate_swimbait(lure)]
    if not source_matches:
        return LureCleanupResult(False, "Startup lure cleanup: no 3/4 paddle-tail swimbait found.")
    target_matches = [lure for lure in lures if _is_white_soft_plastic_paddle_tail(lure)]
    if len(source_matches) != 1 or len(target_matches) != 1:
        return LureCleanupResult(
            False,
            "Startup lure cleanup skipped: expected exactly one 3/4 paddle-tail swimbait "
            f"and one white soft-plastic paddle tail, found {len(source_matches)} and {len(target_matches)}.",
        )

    source = source_matches[0]
    target = target_matches[0]
    source_id = source.get("id")
    target_id = target.get("id")
    if not isinstance(source_id, str) or not source_id or not isinstance(target_id, str) or not target_id:
        return LureCleanupResult(False, "Startup lure cleanup skipped: matching lures do not have usable IDs.")
    if source_id == target_id:
        return LureCleanupResult(False, "Startup lure cleanup skipped: matching lure IDs are identical.")

    updated = deepcopy(payload)
    replaced_references = _replace_lure_references(updated, source_id, target_id)
    updated["lures"] = [lure for lure in updated["lures"] if not (isinstance(lure, dict) and lure.get("id") == source_id)]

    logbook_store.write_logbook_file(database_file, updated)
    return LureCleanupResult(
        True,
        f"Startup lure cleanup: replaced {replaced_references} reference(s) and removed "
        f"duplicate lure '{source.get('name', source_id)}' in favor of '{target.get('name', target_id)}'.",
        replaced_references,
    )
