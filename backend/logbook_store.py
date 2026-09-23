from __future__ import annotations

import math
from copy import deepcopy
from datetime import date

from .backend_config import BATHYMETRY_LAKES, DATABASE_FILE, DEFAULT_LOGBOOK, UNIT_OPTIONS, UPLOAD_CATEGORIES
from . import logbook_repository

SCHEMA_VERSION = 2
PRIVATE_PHOTO_LOCATION_RADIUS_MIN_METERS = 25
PRIVATE_PHOTO_LOCATION_RADIUS_MAX_METERS = 10000
_COLLECTION_KEYS = (
    "species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes",
    "reelStyles", "rodTypes", "lineTypes", "riggings", "structureOptions", "flyCategories", "flyPresentations", "waterLevels", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections",
    "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people",
    "locations", "spots", "expeditions", "trips",
)
_OBJECT_COLLECTION_KEYS = {"lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "spots", "expeditions", "trips"}


def database_exists() -> bool:
    return logbook_repository.exists(DATABASE_FILE)


def initialize_database() -> None:
    logbook_repository.initialize(DATABASE_FILE)


def read_logbook_file(database_file, *, allow_empty: bool = True) -> dict:
    loaded = logbook_repository.read(database_file, _COLLECTION_KEYS)
    if loaded is None:
        if not allow_empty:
            raise ValueError("Database does not contain a Fishing Logbook.")
        return deepcopy(DEFAULT_LOGBOOK)
    is_valid, error = validate_logbook(loaded)
    if not is_valid:
        raise ValueError(f"Stored logbook is invalid: {error}")
    return loaded


def read_logbook() -> dict:
    return read_logbook_file(DATABASE_FILE)


def write_logbook(payload: dict) -> None:
    is_valid, error = validate_logbook(payload)
    if not is_valid:
        raise ValueError(error)

    logbook_repository.write(DATABASE_FILE, payload, _COLLECTION_KEYS, _OBJECT_COLLECTION_KEYS)


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


def _validate_schema(payload: dict) -> tuple[bool, str | None]:
    valid, error = _validate_json_value(payload, "$")
    if not valid:
        return valid, error

    version = payload.get("schemaVersion", 0)
    if not isinstance(version, int) or isinstance(version, bool):
        return _error("schemaVersion", "must be an integer")
    if version != SCHEMA_VERSION:
        return _error("schemaVersion", f"must be version {SCHEMA_VERSION}")
    return True, None


def _validate_required_lists(payload: dict) -> tuple[bool, str | None]:
    for key in _COLLECTION_KEYS:
        if key not in payload:
            return _error(key, "is required")
        if not isinstance(payload[key], list):
            return _error(key, "must be a list")
    if not isinstance(payload.get("settings"), dict):
        return _error("settings", "is required and must be an object")
    return True, None


def _validate_option_lists(payload: dict) -> tuple[bool, str | None]:
    keys = (
        "species", "methods", "lureTypes", "flasherTypes", "waterClarities",
        "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "riggings", "structureOptions", "flyCategories", "flyPresentations", "waterLevels", "lureBladeTypes", "lureSpoonSizes", "trollingDirections",
    )
    for key in keys:
        if key not in payload:
            continue
        values = payload[key]
        if not isinstance(values, list):
            return _error(key, "must be a list")
        for index, value in enumerate(values):
            if not isinstance(value, str):
                return _error(f"{key}[{index}]", "must be a string")
    return True, None


def _validate_choice_lists(payload: dict) -> tuple[bool, str | None]:
    for key in ("trollingPresentations", "setupLineSides"):
        if key not in payload:
            continue
        valid, error = _validate_nested_records(payload[key], key)
        if not valid:
            return valid, error
        for index, item in enumerate(payload[key]):
            for field in ("value", "label"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    return _error(f"{key}[{index}].{field}", "must be a non-empty string")
    return True, None


def _validate_object_lists(payload: dict) -> tuple[bool, str | None]:
    keys = ("lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "spots", "expeditions", "trips")
    for key in keys:
        valid, error = _validate_object_list(payload, key)
        if not valid:
            return valid, error
    return True, None


def _validate_units(settings: dict) -> tuple[bool, str | None]:
    units = settings.get("units")
    if units is not None and not isinstance(units, dict):
        return _error("settings.units", "must be an object")
    if not isinstance(units, dict):
        return True, None
    for key, value in units.items():
        if key in UNIT_OPTIONS and (
            not isinstance(value, str) or value not in UNIT_OPTIONS[key]
        ):
            return _error(f"settings.units.{key}", "has an unsupported unit")
    return True, None


def _validate_settings(payload: dict) -> tuple[bool, str | None]:
    settings = payload.get("settings")
    if settings is not None and not isinstance(settings, dict):
        return _error("settings", "must be an object")
    if not isinstance(settings, dict):
        return True, None
    if "theme" in settings and settings["theme"] not in ("light", "dark"):
        return _error("settings.theme", 'must be "light" or "dark"')
    if "hasFishHawk" in settings and not isinstance(settings["hasFishHawk"], bool):
        return _error("settings.hasFishHawk", "must be a boolean")
    if "timeFormat" in settings and settings["timeFormat"] not in ("12", "24"):
        return _error("settings.timeFormat", 'must be "12" or "24"')
    if "defaultHomeLake" in settings and settings["defaultHomeLake"] not in ("", "Superior", "Michigan", "Huron", "Erie", "Ontario"):
        return _error("settings.defaultHomeLake", "has an unsupported lake")
    if "bathymetryLakeCalibrationsFeet" in settings:
        calibrations = settings["bathymetryLakeCalibrationsFeet"]
        if not isinstance(calibrations, dict):
            return _error("settings.bathymetryLakeCalibrationsFeet", "must be an object")
        for lake, calibration in calibrations.items():
            if lake not in BATHYMETRY_LAKES:
                return _error("settings.bathymetryLakeCalibrationsFeet", "has an unsupported lake")
            if not isinstance(calibration, dict):
                return _error(f"settings.bathymetryLakeCalibrationsFeet.{lake}", "must be an object")
            for key in ("shallowOffsetFeet", "offshoreOffsetFeet"):
                value = calibration.get(key, 0)
                if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
                    return _error(f"settings.bathymetryLakeCalibrationsFeet.{lake}.{key}", "must be a number")
    valid, error = _validate_units(settings)
    if not valid:
        return valid, error
    if "chopRanges" in settings:
        chop_ranges = settings["chopRanges"]
        if not isinstance(chop_ranges, list):
            return _error("settings.chopRanges", "must be a list")
        chop_ids: set[str] = set()
        for index, item in enumerate(chop_ranges):
            path = f"settings.chopRanges[{index}]"
            if not isinstance(item, dict):
                return _error(path, "must be an object")
            range_id = item.get("id")
            if not isinstance(range_id, str) or not range_id.strip():
                return _error(f"{path}.id", "must be a non-empty string")
            if range_id in chop_ids:
                return _error(f"{path}.id", "must be unique")
            chop_ids.add(range_id)
            if not isinstance(item.get("label"), str) or not item["label"].strip():
                return _error(f"{path}.label", "must be a non-empty string")
            maximum = item.get("maxFeet")
            if maximum is not None and (not isinstance(maximum, (int, float)) or isinstance(maximum, bool) or not math.isfinite(maximum) or maximum < 0):
                return _error(f"{path}.maxFeet", "must be a nonnegative number or null")
    if "checklists" in settings:
        checklists = settings["checklists"]
        if not isinstance(checklists, list):
            return _error("settings.checklists", "must be a list")
        checklist_ids: set[str] = set()
        checklist_names: set[str] = set()
        for index, checklist in enumerate(checklists):
            path = f"settings.checklists[{index}]"
            if not isinstance(checklist, dict):
                return _error(path, "must be an object")
            checklist_id = checklist.get("id")
            if not isinstance(checklist_id, str) or not checklist_id.strip():
                return _error(f"{path}.id", "must be a non-empty string")
            if checklist_id in checklist_ids:
                return _error(f"{path}.id", "must be unique")
            checklist_ids.add(checklist_id)
            name = checklist.get("name")
            if not isinstance(name, str) or not name.strip():
                return _error(f"{path}.name", "must be a non-empty string")
            name_key = name.strip().casefold()
            if name_key in checklist_names:
                return _error(f"{path}.name", "must be unique ignoring case")
            checklist_names.add(name_key)
            items = checklist.get("items")
            if not isinstance(items, list):
                return _error(f"{path}.items", "must be a list")
            item_ids: set[str] = set()
            for item_index, item in enumerate(items):
                item_path = f"{path}.items[{item_index}]"
                if not isinstance(item, dict):
                    return _error(item_path, "must be an object")
                item_id = item.get("id")
                if not isinstance(item_id, str) or not item_id.strip():
                    return _error(f"{item_path}.id", "must be a non-empty string")
                if item_id in item_ids:
                    return _error(f"{item_path}.id", "must be unique within its checklist")
                item_ids.add(item_id)
                if not isinstance(item.get("label"), str) or not item["label"].strip():
                    return _error(f"{item_path}.label", "must be a non-empty string")
                if not isinstance(item.get("done"), bool):
                    return _error(f"{item_path}.done", "must be a boolean")
    if "trollingSpreads" in settings:
        spreads = settings["trollingSpreads"]
        if not isinstance(spreads, list):
            return _error("settings.trollingSpreads", "must be a list")
        spread_ids = set()
        spread_names = set()
        for index, item in enumerate(spreads):
            path = f"settings.trollingSpreads[{index}]"
            if not isinstance(item, dict):
                return _error(path, "must be an object")
            spread_id = item.get("id")
            if not isinstance(spread_id, str) or not spread_id.strip():
                return _error(f"{path}.id", "must be a non-empty string")
            if spread_id in spread_ids:
                return _error(f"{path}.id", "must be unique")
            spread_ids.add(spread_id)
            spread_name = item.get("name")
            if not isinstance(spread_name, str) or not spread_name.strip():
                return _error(f"{path}.name", "must be a non-empty string")
            spread_name_key = spread_name.strip().casefold()
            if spread_name_key in spread_names:
                return _error(f"{path}.name", "must be unique ignoring case")
            spread_names.add(spread_name_key)
            rows = item.get("spread")
            if not isinstance(rows, list) or not rows:
                return _error(f"{path}.spread", "must contain at least one rod")
            for row_index, row in enumerate(rows):
                row_path = f"{path}.spread[{row_index}]"
                if not isinstance(row, dict):
                    return _error(row_path, "must be an object")
                combo_id = row.get("comboId")
                if not isinstance(combo_id, str) or not combo_id.strip():
                    return _error(f"{row_path}.comboId", "must be a non-empty string")
                for field in ("side", "presentation"):
                    if not isinstance(row.get(field), str) or not row[field].strip():
                        return _error(f"{row_path}.{field}", "must be a non-empty string")
        default_spread_id = settings.get("defaultTrollingSpreadId", "")
        if not isinstance(default_spread_id, str):
            return _error("settings.defaultTrollingSpreadId", "must be a string")
        if default_spread_id and default_spread_id not in spread_ids:
            return _error("settings.defaultTrollingSpreadId", "must reference a saved trolling spread")
    if "savedSetups" in settings:
        setups = settings["savedSetups"]
        if not isinstance(setups, list):
            return _error("settings.savedSetups", "must be a list")
        setup_ids = set()
        setup_names = {}
        setup_methods_by_id = {}
        for index, item in enumerate(setups):
            path = f"settings.savedSetups[{index}]"
            if not isinstance(item, dict):
                return _error(path, "must be an object")
            setup_id = item.get("id")
            if not isinstance(setup_id, str) or not setup_id.strip():
                return _error(f"{path}.id", "must be a non-empty string")
            if setup_id in setup_ids:
                return _error(f"{path}.id", "must be unique")
            setup_ids.add(setup_id)
            method = item.get("method")
            if not isinstance(method, str) or not method.strip():
                return _error(f"{path}.method", "must be a non-empty string")
            method_key = method.strip().casefold()
            method_names = setup_names.setdefault(method_key, set())
            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                return _error(f"{path}.name", "must be a non-empty string")
            name_key = name.strip().casefold()
            if name_key in method_names:
                return _error(f"{path}.name", "must be unique within the method ignoring case")
            method_names.add(name_key)
            rows = item.get("rows")
            if not isinstance(rows, list) or not rows:
                return _error(f"{path}.rows", "must contain at least one rod")
            for row_index, row in enumerate(rows):
                row_path = f"{path}.rows[{row_index}]"
                if not isinstance(row, dict):
                    return _error(row_path, "must be an object")
                combo_id = row.get("comboId")
                if not isinstance(combo_id, str) or not combo_id.strip():
                    return _error(f"{row_path}.comboId", "must be a non-empty string")
            setup_methods_by_id[setup_id] = method.strip()
    else:
        setup_methods_by_id = {}
    if "defaultSavedSetupIds" in settings:
        default_setup_ids = settings["defaultSavedSetupIds"]
        if not isinstance(default_setup_ids, dict):
            return _error("settings.defaultSavedSetupIds", "must be an object")
        for method, setup_id in default_setup_ids.items():
            method_text = str(method or "").strip()
            if not method_text:
                return _error("settings.defaultSavedSetupIds", "must not contain an empty method")
            if not isinstance(setup_id, str):
                return _error(f"settings.defaultSavedSetupIds.{method}", "must be a setup ID string")
            setup_method = setup_methods_by_id.get(setup_id)
            if not setup_method or setup_method.casefold() != method_text.casefold():
                return _error(f"settings.defaultSavedSetupIds.{method}", "must reference a saved setup for that method")
    if "defaultPeople" in settings:
        if not isinstance(settings["defaultPeople"], list) or any(not isinstance(person_id, str) for person_id in settings["defaultPeople"]):
            return _error("settings.defaultPeople", "must be a list of person IDs")
    if "privatePhotoLocations" in settings:
        private_locations = settings["privatePhotoLocations"]
        if not isinstance(private_locations, list):
            return _error("settings.privatePhotoLocations", "must be a list")
        private_ids: set[str] = set()
        for index, item in enumerate(private_locations):
            path = f"settings.privatePhotoLocations[{index}]"
            if not isinstance(item, dict):
                return _error(path, "must be an object")
            location_id = item.get("id")
            if not isinstance(location_id, str) or not location_id.strip():
                return _error(f"{path}.id", "must be a non-empty string")
            if location_id in private_ids:
                return _error(f"{path}.id", "must be unique")
            private_ids.add(location_id)
            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                return _error(f"{path}.name", "must be a non-empty string")
            if "coordinates" not in item or item.get("coordinates") is None:
                return _error(f"{path}.coordinates", "is required")
            valid, error = _validate_coordinates(item["coordinates"], f"{path}.coordinates")
            if not valid:
                return valid, error
            radius = item.get("radiusMeters")
            if not isinstance(radius, (int, float)) or isinstance(radius, bool) or not math.isfinite(radius):
                return _error(f"{path}.radiusMeters", "must be a finite number")
            if radius < PRIVATE_PHOTO_LOCATION_RADIUS_MIN_METERS or radius > PRIVATE_PHOTO_LOCATION_RADIUS_MAX_METERS:
                return _error(f"{path}.radiusMeters", "must be between 25 and 10000")
    return True, None


def _validate_locations(payload: dict) -> tuple[bool, str | None]:
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
    return True, None


def _validate_people(payload: dict) -> tuple[bool, str | None]:
    for index, person in enumerate(payload.get("people", [])):
        if not isinstance(person.get("name"), str) or not person["name"].strip():
            return _error(f"people[{index}].name", "must be a non-empty string")
    return True, None


def _validate_spots(payload: dict) -> tuple[bool, str | None]:
    names = set()
    for index, spot in enumerate(payload.get("spots", [])):
        path = f"spots[{index}]"
        if not isinstance(spot.get("id"), str) or not spot["id"].strip():
            return _error(f"{path}.id", "must be a non-empty string")
        if not isinstance(spot.get("name"), str) or not spot["name"].strip():
            return _error(f"{path}.name", "must be a non-empty string")
        name_key = spot["name"].strip().lower()
        if name_key in names:
            return _error(f"{path}.name", "must be unique ignoring case")
        names.add(name_key)
        valid, error = _validate_coordinates(spot.get("coordinates"), f"{path}.coordinates")
        if not valid:
            return valid, error
        if spot.get("coordinates") is None:
            return _error(f"{path}.coordinates", "is required")
        radius = spot.get("radiusMeters")
        if not isinstance(radius, (int, float)) or isinstance(radius, bool) or not math.isfinite(radius):
            return _error(f"{path}.radiusMeters", "must be a finite number")
        if not 25 <= radius <= 500:
            return _error(f"{path}.radiusMeters", "must be between 25 and 500")
    return True, None


def _validate_expeditions(payload: dict) -> tuple[bool, str | None]:
    for index, expedition in enumerate(payload.get("expeditions", [])):
        path = f"expeditions[{index}]"
        if not isinstance(expedition.get("name"), str) or not expedition["name"].strip():
            return _error(f"{path}.name", "must be a non-empty string")
        parsed_dates = []
        for field in ("startDate", "endDate"):
            value = expedition.get(field)
            if not isinstance(value, str) or not value.strip():
                return _error(f"{path}.{field}", "must be a non-empty ISO date")
            try:
                parsed_dates.append(date.fromisoformat(value))
            except ValueError:
                return _error(f"{path}.{field}", "must be a valid ISO date")
        if parsed_dates[1] < parsed_dates[0]:
            return _error(f"{path}.endDate", "must be on or after startDate")
        for field in ("destination", "notes"):
            if field in expedition and not isinstance(expedition[field], str):
                return _error(f"{path}.{field}", "must be a string")
    return True, None


def _validate_reels(payload: dict) -> tuple[bool, str | None]:
    for index, reel in enumerate(payload.get("reels", [])):
        valid, error = _validate_nested_records(reel.get("lineHistory", []), f"reels[{index}].lineHistory")
        if not valid:
            return valid, error
    return True, None


def _validate_trips(payload: dict) -> tuple[bool, str | None]:
    for index, trip in enumerate(payload.get("trips", [])):
        path = f"trips[{index}]"
        for field in ("people", "gearUsed", "catches", "lostFish", "notePhotos"):
            valid, error = _validate_nested_records(trip.get(field, []), f"{path}.{field}")
            if not valid:
                return valid, error
        for record_group in ("catches", "lostFish"):
            for catch_index, catch in enumerate(trip.get(record_group, [])):
                record_path = f"{path}.{record_group}[{catch_index}]"
                for field in ("coordinates", "manualCoordinates", "lockedLocationCoordinates"):
                    valid, error = _validate_coordinates(catch.get(field), f"{record_path}.{field}")
                    if not valid:
                        return valid, error
                if "spotId" in catch and not isinstance(catch["spotId"], str):
                    return _error(f"{record_path}.spotId", "must be a string")
                if "spotAssignmentMode" in catch and catch["spotAssignmentMode"] not in ("automatic", "manual"):
                    return _error(f"{record_path}.spotAssignmentMode", 'must be "automatic" or "manual"')
    return True, None


def _validate_media(payload: dict) -> tuple[bool, str | None]:
    def check(items: object, path: str) -> tuple[bool, str | None]:
        if not isinstance(items, list):
            return _error(path, "must be a list")
        for index, item in enumerate(items):
            item_path = f"{path}[{index}]"
            if not isinstance(item, dict):
                return _error(item_path, "must be an object")
            if not isinstance(item.get("id"), str) or not item["id"]:
                return _error(f"{item_path}.id", "must be a non-empty string")
            if item.get("category") not in UPLOAD_CATEGORIES:
                return _error(f"{item_path}.category", "must be an upload category")
            filename = item.get("filename")
            if not isinstance(filename, str) or not filename or "/" in filename or "\\" in filename:
                return _error(f"{item_path}.filename", "must be a filename")
        return True, None

    for collection in ("lures", "flashers", "rods", "reels"):
        for index, gear in enumerate(payload[collection]):
            path = f"{collection}[{index}]"
            valid, error = check(gear.get("media", []), f"{path}.media")
            if not valid:
                return valid, error
    for trip_index, trip in enumerate(payload["trips"]):
        valid, error = check(trip.get("notePhotos", []), f"trips[{trip_index}].notePhotos")
        if not valid:
            return valid, error
        for group in ("catches", "lostFish"):
            for fish_index, fish in enumerate(trip.get(group, [])):
                valid, error = check(fish.get("photos", []), f"trips[{trip_index}].{group}[{fish_index}].photos")
                if not valid:
                    return valid, error
    return True, None


def validate_logbook(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return _error("$", "logbook must be a JSON object")

    validators = (
        _validate_schema,
        _validate_required_lists,
        _validate_option_lists,
        _validate_choice_lists,
        _validate_object_lists,
        _validate_settings,
        _validate_locations,
        _validate_people,
        _validate_spots,
        _validate_expeditions,
        _validate_reels,
        _validate_trips,
        _validate_media,
    )
    for validator in validators:
        valid, error = validator(payload)
        if not valid:
            return valid, error

    return True, None
