from __future__ import annotations

import json
import math
import re
from datetime import date
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from .backend_config import ROOT, SCHEMA_CONSTANTS

SCHEMA_VERSION = 2
COLLECTION_KEYS = tuple(SCHEMA_CONSTANTS["collectionKeys"])
OBJECT_COLLECTION_KEYS = set(SCHEMA_CONSTANTS["objectCollectionKeys"])
OPTIONAL_COLLECTION_KEYS = set(SCHEMA_CONSTANTS["optionalCollectionKeys"])
_COLLECTION_KEYS = COLLECTION_KEYS
_OBJECT_COLLECTION_KEYS = OBJECT_COLLECTION_KEYS


class LogbookStorageError(ValueError):
    """A stored logbook cannot be read or is not a supported v2 document."""


def _error(path: str, message: str) -> tuple[bool, str]:
    return False, f"{path}: {message}"


@lru_cache(maxsize=1)
def _schema_validator() -> Draft202012Validator:
    with (Path(ROOT) / "schema" / "logbook.schema.json").open("r", encoding="utf-8") as handle:
        return Draft202012Validator(json.load(handle))


def _validate_json_value(value: object, path: str = "$", depth: int = 0) -> tuple[bool, str | None]:
    if depth > 30:
        return _error(path, "nesting is too deep")
    if value is None or isinstance(value, (str, bool)):
        return True, None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (True, None) if math.isfinite(value) else _error(path, "number must be finite")
    if isinstance(value, list):
        for index, item in enumerate(value):
            valid, error = _validate_json_value(item, f"{path}[{index}]", depth + 1)
            if not valid:
                return valid, error
        return True, None
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                return _error(path, "object keys must be strings")
            valid, error = _validate_json_value(item, f"{path}.{key}", depth + 1)
            if not valid:
                return valid, error
        return True, None
    return _error(path, f"unsupported value type {type(value).__name__}")


def _json_path(error: ValidationError) -> str:
    parts: list[str] = []
    for part in error.absolute_path:
        if isinstance(part, int):
            if parts:
                parts[-1] = f"{parts[-1]}[{part}]"
            else:
                parts.append(f"$[{part}]")
        else:
            parts.append(str(part))
    if error.validator == "required":
        match = re.search(r"'([^']+)' is a required property", error.message)
        if match:
            parts.append(match.group(1))
    return ".".join(parts) if parts else "$"


def _schema_error_message(error: ValidationError) -> str:
    path = _json_path(error)
    if error.validator == "required":
        return "is required"
    if error.validator == "type":
        expected = error.validator_value
        expected = expected[0] if isinstance(expected, list) and len(expected) == 1 else expected
        if isinstance(expected, list):
            if set(expected) == {"number", "null"}:
                return "must be a nonnegative number or null" if path.endswith(".maxFeet") else "must be a number or null"
            if set(expected) == {"object", "null"}:
                return "must be an object or null"
            return error.message
        return {
            "array": "must be a list",
            "object": "must be an object",
            "string": "must be a string",
            "boolean": "must be a boolean",
            "number": "must be a number",
            "integer": "must be an integer",
        }.get(expected, error.message)
    if error.validator == "const" and path == "schemaVersion":
        return f"must be version {SCHEMA_VERSION}"
    if error.validator == "enum":
        if path.startswith("settings.units."):
            return "has an unsupported unit"
        if path == "settings.theme":
            return 'must be "light" or "dark"'
        if path == "settings.timeFormat":
            return 'must be "12" or "24"'
        if path == "settings.defaultHomeLake":
            return "has an unsupported lake"
        if path.endswith("spotAssignmentMode"):
            return 'must be "automatic" or "manual"'
        return "has an unsupported value"
    if error.validator == "propertyNames":
        if path == "settings.bathymetryLakeCalibrationsFeet":
            return "has an unsupported lake"
        if path == "settings.speciesMapColors":
            return "must not contain an empty species"
        if path == "settings.defaultSavedSetupIds":
            return "must not contain an empty method"
        return "contains an unsupported property name"
    if error.validator == "pattern":
        if path.startswith("settings.speciesMapColors."):
            return "must be a six-digit hex color"
        if path.endswith(".filename"):
            return "must be a filename"
        return "must be a non-empty string"
    if error.validator == "minItems":
        return "must contain at least one rod"
    if error.validator in {"minimum", "maximum"}:
        minimum = error.schema.get("minimum") if isinstance(error.schema, dict) else None
        maximum = error.schema.get("maximum") if isinstance(error.schema, dict) else None
        if minimum is not None and maximum is not None:
            return f"must be between {minimum:g} and {maximum:g}"
        if minimum == 0:
            return "must be a nonnegative number or null"
        if minimum is not None:
            return f"must be at least {minimum:g}"
        if maximum is not None:
            return f"must be at most {maximum:g}"
    return error.message


def _validate_with_json_schema(payload: dict) -> tuple[bool, str | None]:
    errors = sorted(_schema_validator().iter_errors(payload), key=lambda item: list(item.absolute_path))
    if not errors:
        return True, None
    error = errors[0]
    return _error(_json_path(error), _schema_error_message(error))


def _validate_unique_ids(payload: dict) -> tuple[bool, str | None]:
    for key in OBJECT_COLLECTION_KEYS:
        seen: set[str] = set()
        for index, item in enumerate(payload.get(key, [])):
            item_id = item.get("id") if isinstance(item, dict) else None
            if item_id:
                if item_id in seen:
                    return _error(f"{key}[{index}].id", f'duplicate id "{item_id}"')
                seen.add(item_id)
    return True, None


def _validate_settings_semantics(settings: dict) -> tuple[bool, str | None]:
    if "speciesMapColors" in settings:
        names: set[str] = set()
        for species in settings["speciesMapColors"]:
            species_key = species.strip().casefold()
            if species_key in names:
                return _error("settings.speciesMapColors", "must not repeat a species")
            names.add(species_key)

    if "chopRanges" in settings:
        seen = set()
        for index, item in enumerate(settings["chopRanges"]):
            if item["id"] in seen:
                return _error(f"settings.chopRanges[{index}].id", "must be unique")
            seen.add(item["id"])

    if "checklists" in settings:
        checklist_ids: set[str] = set()
        checklist_names: set[str] = set()
        for index, checklist in enumerate(settings["checklists"]):
            path = f"settings.checklists[{index}]"
            if checklist["id"] in checklist_ids:
                return _error(f"{path}.id", "must be unique")
            checklist_ids.add(checklist["id"])
            name_key = checklist["name"].strip().casefold()
            if name_key in checklist_names:
                return _error(f"{path}.name", "must be unique ignoring case")
            checklist_names.add(name_key)
            item_ids: set[str] = set()
            for item_index, item in enumerate(checklist["items"]):
                if item["id"] in item_ids:
                    return _error(f"{path}.items[{item_index}].id", "must be unique within its checklist")
                item_ids.add(item["id"])

    if "privatePhotoLocations" in settings:
        ids: set[str] = set()
        for index, item in enumerate(settings["privatePhotoLocations"]):
            if item["id"] in ids:
                return _error(f"settings.privatePhotoLocations[{index}].id", "must be unique")
            ids.add(item["id"])

    spread_ids: set[str] = set()
    if "trollingSpreads" in settings:
        spread_names: set[str] = set()
        for index, item in enumerate(settings["trollingSpreads"]):
            path = f"settings.trollingSpreads[{index}]"
            if item["id"] in spread_ids:
                return _error(f"{path}.id", "must be unique")
            spread_ids.add(item["id"])
            name_key = item["name"].strip().casefold()
            if name_key in spread_names:
                return _error(f"{path}.name", "must be unique ignoring case")
            spread_names.add(name_key)
    default_spread_id = settings.get("defaultTrollingSpreadId", "")
    if default_spread_id and default_spread_id not in spread_ids:
        return _error("settings.defaultTrollingSpreadId", "must reference a saved trolling spread")

    setup_methods_by_id: dict[str, str] = {}
    if "savedSetups" in settings:
        setup_ids: set[str] = set()
        setup_names: dict[str, set[str]] = {}
        for index, item in enumerate(settings["savedSetups"]):
            path = f"settings.savedSetups[{index}]"
            if item["id"] in setup_ids:
                return _error(f"{path}.id", "must be unique")
            setup_ids.add(item["id"])
            method_key = item["method"].strip().casefold()
            names = setup_names.setdefault(method_key, set())
            name_key = item["name"].strip().casefold()
            if name_key in names:
                return _error(f"{path}.name", "must be unique within the method ignoring case")
            names.add(name_key)
            setup_methods_by_id[item["id"]] = item["method"].strip()
    if "defaultSavedSetupIds" in settings:
        for method, setup_id in settings["defaultSavedSetupIds"].items():
            setup_method = setup_methods_by_id.get(setup_id)
            if not setup_method or setup_method.casefold() != method.strip().casefold():
                return _error(f"settings.defaultSavedSetupIds.{method}", "must reference a saved setup for that method")
    return True, None


def _validate_spot_names(payload: dict) -> tuple[bool, str | None]:
    names: set[str] = set()
    for index, spot in enumerate(payload.get("spots", [])):
        name_key = spot["name"].strip().casefold()
        if name_key in names:
            return _error(f"spots[{index}].name", "must be unique ignoring case")
        names.add(name_key)
    return True, None


def _validate_expedition_dates(payload: dict) -> tuple[bool, str | None]:
    for index, expedition in enumerate(payload.get("expeditions", [])):
        path = f"expeditions[{index}]"
        parsed_dates = []
        for field in ("startDate", "endDate"):
            try:
                parsed_dates.append(date.fromisoformat(expedition[field]))
            except ValueError:
                return _error(f"{path}.{field}", "must be a valid ISO date")
        if parsed_dates[1] < parsed_dates[0]:
            return _error(f"{path}.endDate", "must be on or after startDate")
    return True, None


def validate_logbook(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return _error("$", "logbook must be a JSON object")

    valid, error = _validate_json_value(payload)
    if not valid:
        return valid, error
    version = payload.get("schemaVersion", 0)
    if not isinstance(version, int) or isinstance(version, bool):
        return _error("schemaVersion", "must be an integer")
    if version != SCHEMA_VERSION:
        return _error("schemaVersion", f"must be version {SCHEMA_VERSION}")

    valid, error = _validate_with_json_schema(payload)
    if not valid:
        return valid, error
    semantic_rules = (
        _validate_unique_ids,
        lambda data: _validate_settings_semantics(data["settings"]),
        _validate_spot_names,
        _validate_expedition_dates,
    )
    for rule in semantic_rules:
        valid, error = rule(payload)
        if not valid:
            return valid, error
    return True, None
