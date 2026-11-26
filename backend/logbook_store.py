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
from .home_port import valid_home_port

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


def _is_plain_json(value: object, depth: int = 0) -> bool:
    """Fast pass/fail twin of ``_validate_json_value``.

    It only answers "is this plainly valid?". Anything it rejects, including
    exotic but acceptable subclasses, is re-checked by the detailed walk, which
    also builds the error path.
    """
    kind = type(value)
    if kind is list or kind is dict:
        if value and depth >= 30:
            return False
        if kind is dict:
            for key in value:
                if type(key) is not str:
                    return False
            value = value.values()
        for item in value:
            item_kind = type(item)
            if item_kind is str or item_kind is int or item_kind is bool or item is None:
                continue
            if item_kind is float:
                if not math.isfinite(item):
                    return False
                continue
            if not _is_plain_json(item, depth + 1):
                return False
        return True
    if kind is float:
        return math.isfinite(value)
    return kind is str or kind is int or kind is bool or value is None


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


def _validate_experiments(payload: dict) -> tuple[bool, str | None]:
    def unique(records, path):
        for key in ("id", "name"):
            seen = set()
            for index, item in enumerate(records):
                value = item[key].strip().lower() if key == "name" else item[key]
                if value in seen:
                    return _error(f"{path}[{index}].{key}", "must be unique")
                seen.add(value)
        return None

    experiments = payload.get("experiments", [])
    duplicate = unique(experiments, "experiments")
    if duplicate:
        return duplicate
    definitions = {}
    for index, experiment in enumerate(experiments):
        path = f"experiments[{index}]"
        duplicate = unique(experiment["variants"], f"{path}.variants")
        if duplicate:
            return duplicate
        definitions[experiment["id"]] = {variant["id"] for variant in experiment["variants"]}
    for trip_index, trip in enumerate(payload["trips"]):
        trip_experiment_ids = set()
        for index, experiment_id in enumerate(trip.get("experimentIds", [])):
            path = f"trips[{trip_index}].experimentIds[{index}]"
            if experiment_id not in definitions:
                return _error(path, "must reference an experiment")
            if experiment_id in trip_experiment_ids:
                return _error(path, "must be unique")
            trip_experiment_ids.add(experiment_id)
        for line_index, line in enumerate(trip.get("gearUsed", [])):
            seen = set()
            for index, assignment in enumerate(line.get("experimentAssignments", [])):
                path = f"trips[{trip_index}].gearUsed[{line_index}].experimentAssignments[{index}]"
                experiment_id = assignment["experimentId"]
                if experiment_id not in definitions or experiment_id in seen:
                    return _error(f"{path}.experimentId", "must reference a unique experiment on this setup")
                seen.add(experiment_id)
                if assignment["variantId"] not in definitions[experiment_id]:
                    return _error(f"{path}.variantId", "must reference a variant in the experiment")
    return True, None


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
        path = f"spots[{index}]"
        name_key = spot["name"].strip().casefold()
        if name_key in names:
            return _error(f"{path}.name", "must be unique ignoring case")
        names.add(name_key)
        if spot.get("boundaryType", "circle") != "polygon":
            continue
        vertices = spot["polygon"]
        points = [(point["longitude"], point["latitude"]) for point in vertices]
        if len(set(points)) != len(points):
            return _error(f"{path}.polygon", "must have distinct vertices")
        area = sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))
        if abs(area) < 1e-10:
            return _error(f"{path}.polygon", "must have a nonzero area")
        def crosses(a, b, c, d):
            def side(p, q, r):
                return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
            return side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0
        for first in range(len(points)):
            for second in range(first + 2, len(points)):
                if first == 0 and second == len(points) - 1:
                    continue
                if crosses(points[first], points[(first + 1) % len(points)], points[second], points[(second + 1) % len(points)]):
                    return _error(f"{path}.polygon", "must not cross itself")
    return True, None


def _validate_drifts(payload: dict) -> tuple[bool, str | None]:
    names: set[str] = set()
    for index, drift in enumerate(payload.get("drifts", [])):
        path = f"drifts[{index}]"
        name_key = drift["name"].strip().casefold()
        if name_key in names:
            return _error(f"{path}.name", "must be unique ignoring case")
        names.add(name_key)
        vertices = drift["polygon"]
        points = [(point["longitude"], point["latitude"]) for point in vertices]
        if len(set(points)) != len(points):
            return _error(f"{path}.polygon", "must have distinct vertices")
        area = sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))
        if abs(area) < 1e-10:
            return _error(f"{path}.polygon", "must have a nonzero area")
        def crosses(a, b, c, d):
            def side(p, q, r):
                return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
            return side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0
        for first in range(len(points)):
            for second in range(first + 2, len(points)):
                if first == 0 and second == len(points) - 1:
                    continue
                if crosses(points[first], points[(first + 1) % len(points)], points[second], points[(second + 1) % len(points)]):
                    return _error(f"{path}.polygon", "must not cross itself")
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

    if not _is_plain_json(payload):
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
        _validate_experiments,
        _validate_unique_ids,
        lambda data: _validate_settings_semantics(data["settings"]),
        _validate_spot_names,
        _validate_drifts,
        _validate_expedition_dates,
    )
    for rule in semantic_rules:
        valid, error = rule(payload)
        if not valid:
            return valid, error
    reference = payload["settings"].get("homePort")
    if reference:
        location = next((item for item in payload["locations"] if item.get("id") == reference["locationId"]), None)
        launches = [item for item in (location or {}).get("launches", []) if item.get("id") == reference["launchId"]]
        launch = launches[0] if len(launches) == 1 else None
        if not launch or not isinstance(launch.get("name"), str) or not launch["name"].strip() or not valid_home_port(launch.get("coordinates")):
            return _error("settings.homePort", "must reference a named saved launch on a Great Lake at least 1 km offshore")
    return True, None
