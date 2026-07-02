from __future__ import annotations

import json
import math
import os
import tempfile
import uuid
from copy import deepcopy
from threading import RLock

from .backend_config import DATA_DIR, DATA_FILE, DEFAULT_LOGBOOK, DEFAULT_UNITS, UNIT_OPTIONS

SCHEMA_VERSION = 1
_STORE_LOCK = RLock()


def normalize_logbook(payload: dict | None = None) -> dict:
    normalized = deepcopy(DEFAULT_LOGBOOK)
    if isinstance(payload, dict):
        normalized.update(payload)

    normalized.pop("tripTypes", None)
    normalized["schemaVersion"] = SCHEMA_VERSION
    if not isinstance(normalized.get("settings"), dict):
        normalized["settings"] = deepcopy(DEFAULT_LOGBOOK["settings"])
    else:
        default_ranges = deepcopy(DEFAULT_LOGBOOK["settings"]["chopRanges"])
        ranges = normalized["settings"].get("chopRanges")
        time_format = str(normalized["settings"].get("timeFormat") or "24")
        if time_format not in ("12", "24"):
            time_format = "24"
        raw_units = normalized["settings"].get("units")
        cleaned_units = deepcopy(DEFAULT_UNITS)
        if isinstance(raw_units, dict):
            for key, default_value in DEFAULT_UNITS.items():
                value = raw_units.get(key)
                if value in UNIT_OPTIONS.get(key, set()):
                    cleaned_units[key] = value
        if not isinstance(ranges, list) or not ranges:
            ranges = default_ranges
        cleaned_ranges = []
        for index, item in enumerate(ranges):
            if not isinstance(item, dict):
                continue
            fallback = default_ranges[index] if index < len(default_ranges) else default_ranges[-1]
            label = str(item.get("label") or fallback["label"]).strip()
            if not label:
                continue
            try:
                max_feet = None if item.get("maxFeet") in (None, "") else round(max(0, float(item.get("maxFeet"))), 2)
            except (TypeError, ValueError):
                max_feet = None
            cleaned_ranges.append({
                "id": str(item.get("id") or fallback["id"]),
                "label": label,
                "maxFeet": max_feet,
            })
        if not any(item.get("maxFeet") is None for item in cleaned_ranges):
            cleaned_ranges.append(default_ranges[-1])
        normalized["settings"] = {**deepcopy(DEFAULT_LOGBOOK["settings"]), **normalized["settings"], "timeFormat": time_format, "units": cleaned_units, "chopRanges": cleaned_ranges or default_ranges}

    list_keys = ("species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips")
    for key in list_keys:
        if not isinstance(normalized.get(key), list):
            normalized[key] = deepcopy(DEFAULT_LOGBOOK[key])

    def clean_text_options(key: str) -> None:
        seen = set()
        cleaned = []
        source = normalized.get(key) if isinstance(normalized.get(key), list) else DEFAULT_LOGBOOK[key]
        for item in source:
            value = item.get("label") or item.get("value") if isinstance(item, dict) else item
            text = str(value or "").strip()
            folded = text.lower()
            if text and folded not in seen:
                cleaned.append(text)
                seen.add(folded)
        normalized[key] = cleaned

    def slug_option_value(label: str) -> str:
        return "-".join("".join(char.lower() if char.isalnum() else " " for char in str(label)).split())

    def clean_choice_options(key: str) -> None:
        seen = set()
        cleaned = []
        source = normalized.get(key) if isinstance(normalized.get(key), list) else DEFAULT_LOGBOOK[key]
        for item in source:
            if isinstance(item, dict):
                label = str(item.get("label") or item.get("value") or "").strip()
                value = str(item.get("value") or slug_option_value(label)).strip()
            else:
                label = str(item or "").strip()
                value = slug_option_value(label) or label
            folded = value.lower()
            if value and label and folded not in seen:
                cleaned.append({"value": value, "label": label})
                seen.add(folded)
        normalized[key] = cleaned

    for key in ("species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "trollingDirections"):
        clean_text_options(key)
    for key in ("trollingPresentations", "setupLineSides"):
        clean_choice_options(key)

    known_people = {
        person.get("id"): person
        for person in normalized["people"]
        if isinstance(person, dict) and person.get("id")
    }
    for trip in normalized["trips"]:
        if not isinstance(trip, dict):
            continue
        for person in trip.get("people", []):
            if (
                isinstance(person, dict)
                and person.get("id")
                and person.get("name")
                and person.get("id") not in known_people
            ):
                known_people[person["id"]] = {"id": person["id"], "name": person["name"]}
    normalized["people"] = list(known_people.values())

    def usable_coordinates(value: object) -> dict | None:
        if not isinstance(value, dict):
            return None
        try:
            latitude = float(value.get("latitude"))
            longitude = float(value.get("longitude"))
        except (TypeError, ValueError):
            return None
        if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
            return None
        if latitude == 0 and longitude == 0:
            return None
        return {"latitude": latitude, "longitude": longitude}

    def slug_id(prefix: str, value: str) -> str:
        slug = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
        while "--" in slug:
            slug = slug.replace("--", "-")
        return f"{prefix}-{slug}" if slug else str(uuid.uuid4())

    def normalize_launch(launch: object, location_id: str) -> dict | None:
        if isinstance(launch, str):
            name = launch.strip()
            return {"id": slug_id(f"{location_id}-launch", name), "name": name, "coordinates": None} if name else None
        if not isinstance(launch, dict):
            return None
        name = str(launch.get("name") or launch.get("launch") or "").strip()
        if not name:
            return None
        return {
            "id": str(launch.get("id") or slug_id(f"{location_id}-launch", name)),
            "name": name,
            "coordinates": usable_coordinates(launch.get("coordinates")),
        }

    def normalize_location(location: object) -> dict | None:
        if isinstance(location, str):
            name = location.strip()
            return {"id": slug_id("loc", name), "name": name, "coordinates": None, "launches": []} if name else None
        if not isinstance(location, dict):
            return None
        name = str(location.get("name") or location.get("location") or "").strip()
        if not name:
            return None
        location_id = str(location.get("id") or slug_id("loc", name))
        launches = [
            item for item in (
                normalize_launch(launch, location_id)
                for launch in location.get("launches", [])
            )
            if item
        ] if isinstance(location.get("launches"), list) else []
        return {
            "id": location_id,
            "name": name,
            "coordinates": usable_coordinates(location.get("coordinates")),
            "launches": launches,
        }

    known_locations: dict[str, dict] = {}
    for location in normalized["locations"]:
        location_record = normalize_location(location)
        if not location_record:
            continue
        key = location_record["name"].lower()
        existing = known_locations.get(key)
        if not existing:
            known_locations[key] = location_record
            continue
        existing["coordinates"] = existing.get("coordinates") or location_record.get("coordinates")
        for launch in location_record.get("launches", []):
            if not any(item["name"].lower() == launch["name"].lower() for item in existing.get("launches", [])):
                existing.setdefault("launches", []).append(launch)
    for trip in normalized["trips"]:
        if isinstance(trip, dict) and str(trip.get("location", "")).strip():
            location = str(trip["location"]).strip()
            known_locations.setdefault(location.lower(), normalize_location(location))
    normalized["locations"] = sorted(known_locations.values(), key=lambda item: item["name"].lower())

    for trip in normalized["trips"]:
        if not isinstance(trip, dict):
            continue
        location_name = str(trip.get("location", "")).strip()
        location_id = str(trip.get("locationId", "")).strip()
        location_record = next((item for item in normalized["locations"] if item["id"] == location_id), None)
        if location_record is None and location_name:
            location_record = next((item for item in normalized["locations"] if item["name"].lower() == location_name.lower()), None)
        launch_name = str(trip.get("launch", "")).strip()
        launch_id = str(trip.get("launchId", "")).strip()
        launch_record = None
        if location_record:
            launch_record = next((item for item in location_record.get("launches", []) if item["id"] == launch_id), None)
            if launch_record is None and launch_name:
                launch_record = next((item for item in location_record.get("launches", []) if item["name"].lower() == launch_name.lower()), None)
        trip["location"] = location_record["name"] if location_record else location_name
        trip["locationId"] = location_record["id"] if location_record else location_id
        trip["launch"] = launch_record["name"] if launch_record else launch_name
        trip["launchId"] = launch_record["id"] if launch_record else launch_id

    return normalized


def read_logbook() -> dict:
    with _STORE_LOCK:
        if not DATA_FILE.exists():
            return normalize_logbook()

        try:
            with DATA_FILE.open("r", encoding="utf-8") as file:
                loaded = json.load(file)
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Stored logbook is unreadable: {error}") from error

        is_valid, error = validate_logbook(loaded)
        if not is_valid:
            raise RuntimeError(f"Stored logbook is invalid: {error}")
        return normalize_logbook(loaded)

def write_logbook(payload: dict) -> None:
    normalized = normalize_logbook(payload)
    is_valid, error = validate_logbook(normalized)
    if not is_valid:
        raise ValueError(error)

    with _STORE_LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=DATA_DIR,
                prefix=".logbook-",
                suffix=".tmp",
                delete=False,
            ) as file:
                temporary_path = file.name
                json.dump(normalized, file, indent=2, allow_nan=False)
                file.write("\n")
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary_path, DATA_FILE)
        finally:
            if temporary_path and os.path.exists(temporary_path):
                os.unlink(temporary_path)


def _error(path: str, message: str) -> tuple[bool, str]:
    return False, f"{path}: {message}"


def _validate_json_value(value: object, path: str, depth: int = 0) -> tuple[bool, str | None]:
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


def _validate_object_list(payload: dict, key: str) -> tuple[bool, str | None]:
    value = payload.get(key, [])
    if not isinstance(value, list):
        return _error(key, "must be a list")
    seen_ids: set[str] = set()
    for index, item in enumerate(value):
        path = f"{key}[{index}]"
        if not isinstance(item, dict):
            return _error(path, "must be an object")
        if "id" in item and not isinstance(item["id"], str):
            return _error(f"{path}.id", "must be a string")
        item_id = item.get("id")
        if item_id:
            if item_id in seen_ids:
                return _error(f"{path}.id", f'duplicate id "{item_id}"')
            seen_ids.add(item_id)
    return True, None


def _validate_coordinates(value: object, path: str) -> tuple[bool, str | None]:
    if value is None:
        return True, None
    if not isinstance(value, dict):
        return _error(path, "must be an object or null")
    for key, minimum, maximum in (("latitude", -90, 90), ("longitude", -180, 180)):
        number = value.get(key)
        if not isinstance(number, (int, float)) or isinstance(number, bool) or not math.isfinite(number):
            return _error(f"{path}.{key}", "must be a finite number")
        if not minimum <= number <= maximum:
            return _error(f"{path}.{key}", f"must be between {minimum} and {maximum}")
    return True, None


def _validate_nested_records(records: object, path: str) -> tuple[bool, str | None]:
    if not isinstance(records, list):
        return _error(path, "must be a list")
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            return _error(f"{path}[{index}]", "must be an object")
    return True, None

def validate_logbook(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return _error("$", "logbook must be a JSON object")

    valid, error = _validate_json_value(payload, "$")
    if not valid:
        return valid, error

    version = payload.get("schemaVersion", 0)
    if not isinstance(version, int) or isinstance(version, bool):
        return _error("schemaVersion", "must be an integer")
    if version < 0:
        return _error("schemaVersion", "must not be negative")
    if version > SCHEMA_VERSION:
        return _error("schemaVersion", f"version {version} is newer than supported version {SCHEMA_VERSION}")

    required_lists = ("trips", "lures", "flashers")
    for key in required_lists:
        if key not in payload:
            return _error(key, "is required")

    option_lists = (
        "species", "methods", "lureTypes", "flasherTypes", "waterClarities",
        "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "trollingDirections",
    )
    for key in option_lists:
        if key not in payload:
            continue
        values = payload[key]
        if not isinstance(values, list):
            return _error(key, "must be a list")
        for index, value in enumerate(values):
            if not isinstance(value, str):
                return _error(f"{key}[{index}]", "must be a string")

    choice_lists = ("trollingPresentations", "setupLineSides")
    for key in choice_lists:
        if key not in payload:
            continue
        valid, error = _validate_nested_records(payload[key], key)
        if not valid:
            return valid, error
        for index, item in enumerate(payload[key]):
            for field in ("value", "label"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    return _error(f"{key}[{index}].{field}", "must be a non-empty string")

    object_lists = ("lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips")
    for key in object_lists:
        valid, error = _validate_object_list(payload, key)
        if not valid:
            return valid, error

    settings = payload.get("settings")
    if settings is not None and not isinstance(settings, dict):
        return _error("settings", "must be an object")
    if isinstance(settings, dict):
        if "timeFormat" in settings and settings["timeFormat"] not in ("12", "24"):
            return _error("settings.timeFormat", 'must be "12" or "24"')
        units = settings.get("units")
        if units is not None and not isinstance(units, dict):
            return _error("settings.units", "must be an object")
        if isinstance(units, dict):
            for key, value in units.items():
                if key in UNIT_OPTIONS and value not in UNIT_OPTIONS[key]:
                    return _error(f"settings.units.{key}", "has an unsupported unit")
        if "chopRanges" in settings:
            valid, error = _validate_nested_records(settings["chopRanges"], "settings.chopRanges")
            if not valid:
                return valid, error

    for index, location in enumerate(payload.get("locations", [])):
        path = f"locations[{index}]"
        if not isinstance(location.get("name"), str) or not location["name"].strip():
            return _error(f"{path}.name", "must be a non-empty string")
        valid, error = _validate_coordinates(location.get("coordinates"), f"{path}.coordinates")
        if not valid:
            return valid, error
        valid, error = _validate_nested_records(location.get("launches", []), f"{path}.launches")
        if not valid:
            return valid, error

    for index, person in enumerate(payload.get("people", [])):
        if not isinstance(person.get("name"), str) or not person["name"].strip():
            return _error(f"people[{index}].name", "must be a non-empty string")

    for index, reel in enumerate(payload.get("reels", [])):
        valid, error = _validate_nested_records(reel.get("lineHistory", []), f"reels[{index}].lineHistory")
        if not valid:
            return valid, error

    for index, trip in enumerate(payload.get("trips", [])):
        path = f"trips[{index}]"
        for field in ("people", "gearUsed", "catches", "lostFish", "notePhotos"):
            valid, error = _validate_nested_records(trip.get(field, []), f"{path}.{field}")
            if not valid:
                return valid, error
        for catch_index, catch in enumerate(trip.get("catches", [])):
            for field in ("coordinates", "manualCoordinates"):
                valid, error = _validate_coordinates(
                    catch.get(field),
                    f"{path}.catches[{catch_index}].{field}",
                )
                if not valid:
                    return valid, error

    return True, None

