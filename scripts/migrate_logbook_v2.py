"""One-time offline migration for legacy Fishing Logbook data.

The running application accepts and persists canonical schema-v2 documents only.
This module is intentionally a script boundary: it is never imported by the
server or browser. Use it to convert an old SQLite snapshot or portable mobile
archive before opening it with the current application.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import uuid
from collections import Counter
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from zipfile import BadZipFile, ZIP_STORED, ZipFile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import logbook_repository, logbook_store  # noqa: E402
from backend.backend_config import (  # noqa: E402
    BATHYMETRY_LAKES,
    DATABASE_FILE,
    DEFAULT_LOGBOOK,
    UNIT_OPTIONS,
    UPLOAD_CATEGORIES,
)
from backend.media_service import referenced_uploads  # noqa: E402


COLLECTION_KEYS = tuple(logbook_store._COLLECTION_KEYS)
OBJECT_COLLECTION_KEYS = set(logbook_store._OBJECT_COLLECTION_KEYS)
MIGRATION_NAMESPACE = uuid.UUID("f3ebca58-41b2-4b3e-8d7f-c8e1d9b17e6e")

LEGACY_SETTINGS_FIELDS = {
    "bathymetryOffsetFeet",
    "bathymetryLakeOffsetsFeet",
    "boatFeatureEnabled",
    "boatLayout",
    "defaultTrollingSpread",
    "defaultTrollingSpreads",
    "spreadTemplates",
    "tackleBoxes",
    "tripTemplates",
}
LEGACY_TRIP_FIELDS = {"checklist", "endTime", "linesSetTime", "startTime"}
LEGACY_SETUP_FIELDS = {
    "boatItemId",
    "defaultTrollingSpread",
    "defaultTrollingSpreadTarget",
    "deepestRigger",
}
LEGACY_CATCH_FIELDS = {"speed"}
LEGACY_MEDIA_FIELDS = {
    "image",
    "imageFilename",
    "imagePath",
    "path",
    "previewImage",
    "previewPath",
    "previewUrl",
    "url",
}
LEGACY_GEAR_MEDIA_FIELDS = {
    "image",
    "imageFilename",
    "imagePath",
    "photos",
    "previewFilename",
    "previewImage",
    "previewPath",
}
TEXT_OPTION_KEYS = (
    "species",
    "methods",
    "lureTypes",
    "flasherTypes",
    "waterClarities",
    "weatherTypes",
    "reelStyles",
    "rodTypes",
    "lineTypes",
    "riggings",
    "structureOptions",
    "flyCategories",
    "flyPresentations",
    "waterLevels",
    "lureBladeTypes",
    "lureSpoonSizes",
    "trollingDirections",
)
CHOICE_OPTION_KEYS = ("trollingPresentations", "setupLineSides")
OPTIONAL_MODERN_SETTINGS = {"shareAppearancePresets"}


class MigrationError(ValueError):
    """The legacy document cannot be converted without risking data loss."""


def _present(value: object) -> bool:
    return value is not None and value != ""


def _first_present(*values: object) -> object:
    for value in values:
        if _present(value):
            return value
    return ""


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _stable_id(prefix: str, *parts: object) -> str:
    seed = ":".join([prefix, *(str(part or "").strip().casefold() for part in parts)])
    return str(uuid.uuid5(MIGRATION_NAMESPACE, seed))


def _finite_number(value: object, fallback: float = 0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def _rounded_number(value: object, fallback: float = 0) -> float:
    return round(_finite_number(value, fallback), 2)


def _slug(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().casefold()).strip("-")


def _basename(value: object) -> str:
    text = str(value or "").strip().replace("\\", "/")
    return text.rsplit("/", 1)[-1]


def _normalize_coordinates(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    latitude = _finite_number(value.get("latitude"), math.nan)
    longitude = _finite_number(value.get("longitude"), math.nan)
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    if latitude == 0 and longitude == 0:
        return None
    return {"latitude": latitude, "longitude": longitude}


def _normalize_text_options(key: str, value: object, fallback: list) -> list[str]:
    source = value if isinstance(value, list) else deepcopy(fallback)
    result: list[str] = []
    seen: set[str] = set()
    for item in source:
        candidate = item.get("label") or item.get("value") if isinstance(item, dict) else item
        text = str(candidate or "").strip()
        if not text or text.casefold() in seen:
            continue
        if key == "waterClarities" and text.casefold() == "algae bloom":
            continue
        result.append(text)
        seen.add(text.casefold())
    return result


def _canonical_choice_value(key: str, value: object) -> str:
    text = str(value or "").strip()
    if key == "setupLineSides":
        aliases = {"port": "Port", "center": "Center", "starboard": "Starboard"}
        return aliases.get(text.casefold(), text)
    return text


def _normalize_choice_options(key: str, value: object, fallback: list) -> list[dict]:
    source = value if isinstance(value, list) else deepcopy(fallback)
    result: list[dict] = []
    seen: set[str] = set()
    for item in source:
        if isinstance(item, dict):
            raw_value = item.get("value") or item.get("label")
            raw_label = item.get("label") or item.get("value")
        else:
            raw_value = item
            raw_label = item
        option_value = _canonical_choice_value(key, raw_value)
        label = str(raw_label or option_value).strip()
        if not option_value or not label or option_value.casefold() in seen:
            continue
        result.append({"value": option_value, "label": label})
        seen.add(option_value.casefold())
    return result


def _normalize_chop_ranges(value: object) -> list[dict]:
    fallback = deepcopy(DEFAULT_LOGBOOK["settings"]["chopRanges"])
    source = value if isinstance(value, list) and value else fallback
    result: list[dict] = []
    for index, item in enumerate(source):
        if not isinstance(item, dict):
            continue
        default = fallback[index] if index < len(fallback) else fallback[-1]
        label = str(item.get("label") or default["label"]).strip()
        if not label:
            continue
        maximum = item.get("maxFeet")
        max_feet = None if maximum in (None, "") else max(0, _rounded_number(maximum))
        result.append({
            "id": str(item.get("id") or default["id"]).strip() or default["id"],
            "label": label,
            "maxFeet": max_feet,
        })
    if not result or not any(item["maxFeet"] is None for item in result):
        result.append(deepcopy(fallback[-1]))
    return result


def _normalize_spread_rows(value: object) -> list[dict]:
    result: list[dict] = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        combo_id = str(item.get("comboId") or "").strip()
        if not combo_id:
            continue
        side = _canonical_choice_value("setupLineSides", item.get("side"))
        presentation = str(item.get("presentation") or "").strip()
        if not side or not presentation:
            continue
        result.append({
            "comboId": combo_id,
            "side": side,
            "presentation": presentation,
        })
    return result


def _normalize_spreads(value: object, legacy_values: list, legacy_value: object) -> list[dict]:
    source = value if isinstance(value, list) and value else []
    if not source:
        source = legacy_values
        if not source and isinstance(legacy_value, list):
            source = [{"spread": legacy_value}]
    result: list[dict] = []
    used_ids: set[str] = set()
    used_names: set[str] = set()
    for index, item in enumerate(source):
        if not isinstance(item, dict):
            continue
        rows = _normalize_spread_rows(item.get("spread"))
        if not rows:
            continue
        target_species = str(item.get("targetSpecies") or "").strip()
        fallback_name = f"{target_species} Spread" if target_species else f"Trolling Spread {index + 1}"
        name = str(item.get("name") or fallback_name).strip()[:60] or fallback_name
        base_name = name
        suffix = 2
        while name.casefold() in used_names:
            name = f"{base_name[: max(1, 60 - len(str(suffix)) - 3)]} ({suffix})"
            suffix += 1
        spread_id = str(item.get("id") or _stable_id("trolling-spread", index, name)).strip()
        while spread_id in used_ids:
            spread_id = _stable_id("trolling-spread", index, name, len(used_ids))
        used_ids.add(spread_id)
        used_names.add(name.casefold())
        result.append({"id": spread_id, "name": name, "spread": rows})
    return result


def _normalize_saved_setups(value: object) -> list[dict]:
    result: list[dict] = []
    used_ids: set[str] = set()
    names_by_method: dict[str, set[str]] = {}
    for index, item in enumerate(_as_list(value)):
        if not isinstance(item, dict):
            continue
        method = str(item.get("method") or "").strip()
        name = str(item.get("name") or "").strip()[:60]
        rows = [{"comboId": str(row.get("comboId") or "").strip()}
                for row in _as_list(item.get("rows")) if isinstance(row, dict) and str(row.get("comboId") or "").strip()]
        if not method or not name or not rows:
            continue
        method_key = method.casefold()
        names = names_by_method.setdefault(method_key, set())
        base_name = name
        suffix = 2
        while name.casefold() in names:
            name = f"{base_name[: max(1, 60 - len(str(suffix)) - 3)]} ({suffix})"
            suffix += 1
        setup_id = str(item.get("id") or _stable_id("saved-setup", index, method, name)).strip()
        while setup_id in used_ids:
            setup_id = _stable_id("saved-setup", index, method, name, len(used_ids))
        used_ids.add(setup_id)
        names.add(name.casefold())
        result.append({"id": setup_id, "name": name, "method": method, "rows": rows})
    return result


def _normalize_default_setup_ids(value: object, setups: list[dict]) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, str] = {}
    for method, setup_id in value.items():
        method_text = str(method or "").strip()
        setup_text = str(setup_id or "").strip()
        match = next((item for item in setups if item["id"] == setup_text and item["method"].casefold() == method_text.casefold()), None)
        if match:
            result[match["method"]] = match["id"]
    return result


def _normalize_settings(source: object) -> dict:
    raw = source if isinstance(source, dict) else {}
    defaults = deepcopy(DEFAULT_LOGBOOK["settings"])
    settings = {
        key: deepcopy(value)
        for key, value in raw.items()
        if key not in LEGACY_SETTINGS_FIELDS
    }
    for key, value in defaults.items():
        settings.setdefault(key, deepcopy(value))

    settings["theme"] = settings.get("theme") if settings.get("theme") in {"light", "dark"} else "light"
    settings["hasFishHawk"] = settings.get("hasFishHawk") is not False
    settings["timeFormat"] = settings.get("timeFormat") if settings.get("timeFormat") in {"12", "24"} else "24"
    valid_lakes = {"", *BATHYMETRY_LAKES}
    settings["defaultHomeLake"] = settings.get("defaultHomeLake") if settings.get("defaultHomeLake") in valid_lakes else ""
    settings["defaultPeople"] = list(dict.fromkeys(str(item).strip() for item in _as_list(settings.get("defaultPeople")) if str(item).strip()))

    global_offset = _finite_number(raw.get("bathymetryOffsetFeet"), 0)
    legacy_offsets = raw.get("bathymetryLakeOffsetsFeet") if isinstance(raw.get("bathymetryLakeOffsetsFeet"), dict) else {}
    modern_calibrations = raw.get("bathymetryLakeCalibrationsFeet") if isinstance(raw.get("bathymetryLakeCalibrationsFeet"), dict) else {}
    settings["bathymetryLakeCalibrationsFeet"] = {
        lake: {
            "shallowOffsetFeet": _rounded_number(modern_calibrations.get(lake, {}).get("shallowOffsetFeet"), 0)
            if isinstance(modern_calibrations.get(lake), dict) else 0,
            "offshoreOffsetFeet": _rounded_number(
                modern_calibrations.get(lake, {}).get("offshoreOffsetFeet")
                if isinstance(modern_calibrations.get(lake), dict) and "offshoreOffsetFeet" in modern_calibrations.get(lake, {})
                else legacy_offsets.get(lake, global_offset),
                0,
            ),
        }
        for lake in BATHYMETRY_LAKES
    }

    units = deepcopy(DEFAULT_LOGBOOK["settings"]["units"])
    if isinstance(raw.get("units"), dict):
        for key, allowed in UNIT_OPTIONS.items():
            if raw["units"].get(key) in allowed:
                units[key] = raw["units"][key]
    settings["units"] = units
    settings["chopRanges"] = _normalize_chop_ranges(raw.get("chopRanges"))
    settings["trollingSpreads"] = _normalize_spreads(
        raw.get("trollingSpreads"),
        raw.get("defaultTrollingSpreads") if isinstance(raw.get("defaultTrollingSpreads"), list) else [],
        raw.get("defaultTrollingSpread"),
    )
    spread_ids = {item["id"] for item in settings["trollingSpreads"]}
    requested_spread = str(raw.get("defaultTrollingSpreadId") or "").strip()
    settings["defaultTrollingSpreadId"] = requested_spread if requested_spread in spread_ids else ""
    settings["savedSetups"] = _normalize_saved_setups(raw.get("savedSetups"))
    settings["defaultSavedSetupIds"] = _normalize_default_setup_ids(raw.get("defaultSavedSetupIds"), settings["savedSetups"])

    private_locations = []
    for index, item in enumerate(_as_list(raw.get("privatePhotoLocations"))):
        if not isinstance(item, dict):
            continue
        coordinates = _normalize_coordinates(item.get("coordinates"))
        if not coordinates:
            continue
        private_locations.append({
            **item,
            "id": str(item.get("id") or _stable_id("private-location", index, item.get("name"))).strip(),
            "name": str(item.get("name") or f"Home {index + 1}").strip() or f"Home {index + 1}",
            "coordinates": coordinates,
            "radiusMeters": max(25, min(10000, _finite_number(item.get("radiusMeters"), 400))),
        })
    settings["privatePhotoLocations"] = private_locations
    settings["checklists"] = _normalize_checklists(raw.get("checklists"))
    return settings


def _normalize_checklists(value: object) -> list[dict]:
    result = []
    used_ids: set[str] = set()
    for index, item in enumerate(_as_list(value)):
        if isinstance(item, str):
            item = {"name": item, "items": []}
        if not isinstance(item, dict):
            continue
        checklist_id = str(item.get("id") or _stable_id("checklist", index, item.get("name"))).strip()
        while checklist_id in used_ids:
            checklist_id = _stable_id("checklist", index, checklist_id, len(used_ids))
        used_ids.add(checklist_id)
        name = str(item.get("name") or f"Checklist {index + 1}").strip()[:60] or f"Checklist {index + 1}"
        items = []
        item_ids: set[str] = set()
        for item_index, child in enumerate(_as_list(item.get("items"))):
            if isinstance(child, str):
                child = {"label": child}
            if not isinstance(child, dict):
                continue
            child_id = str(child.get("id") or _stable_id("checklist-item", checklist_id, item_index)).strip()
            while child_id in item_ids:
                child_id = _stable_id("checklist-item", checklist_id, item_index, len(item_ids))
            item_ids.add(child_id)
            label = str(child.get("label") or "").strip()[:120]
            if label:
                items.append({**child, "id": child_id, "label": label, "done": bool(child.get("done"))})
        result.append({**item, "id": checklist_id, "name": name, "items": items})
    return result


def _normalize_media(item: object, category: str, path: str) -> dict:
    if not isinstance(item, dict):
        raise MigrationError(f"{path} is not a media object")
    result = deepcopy(item)
    filename = _basename(_first_present(
        result.get("filename"),
        result.get("imageFilename"),
        result.get("imagePath"),
        result.get("path"),
        result.get("url"),
        result.get("image"),
    ))
    if not filename:
        raise MigrationError(f"{path} has no recoverable filename")
    result["filename"] = filename
    result["category"] = str(result.get("category") or category)
    preview = _basename(_first_present(result.get("previewFilename"), result.get("previewPath"), result.get("previewUrl"), result.get("previewImage")))
    if preview:
        result["previewFilename"] = preview
    elif "previewFilename" in result:
        result.pop("previewFilename", None)
    if "mediaType" not in result:
        suffix = Path(filename).suffix.casefold()
        result["mediaType"] = "video" if suffix in {".mov", ".mp4", ".m4v", ".webm", ".avi", ".mpeg", ".mpg", ".3gp"} else "image"
    result.setdefault("id", _stable_id("media", category, path, filename))
    for key in LEGACY_MEDIA_FIELDS:
        result.pop(key, None)
    return result


def _normalize_media_list(items: object, category: str, path: str) -> list[dict]:
    result = []
    for index, item in enumerate(_as_list(items)):
        result.append(_normalize_media(item, category, f"{path}[{index}]"))
    return result


def _normalize_gear_media(record: dict, category: str, path: str) -> None:
    """Move v1 gear images/photos into the canonical v2 media list."""
    normalized = _normalize_media_list(record.get("media"), category, f"{path}.media")
    normalized.extend(_normalize_media_list(record.get("photos"), category, f"{path}.photos"))

    legacy_filename = _first_present(record.get("imageFilename"), record.get("imagePath"), record.get("image"))
    if _present(legacy_filename):
        normalized.append(_normalize_media({
            "filename": legacy_filename,
            "previewFilename": _first_present(
                record.get("previewFilename"),
                record.get("previewPath"),
                record.get("previewImage"),
            ),
        }, category, f"{path}.legacyMedia"))

    deduplicated: list[dict] = []
    seen_filenames: set[str] = set()
    for item in normalized:
        filename = item["filename"]
        if filename in seen_filenames:
            continue
        seen_filenames.add(filename)
        deduplicated.append(item)
    record["media"] = deduplicated
    for key in LEGACY_GEAR_MEDIA_FIELDS:
        record.pop(key, None)


def _normalize_locations(source: object) -> list[dict]:
    result: list[dict] = []
    by_name: dict[str, dict] = {}
    for index, item in enumerate(_as_list(source)):
        if isinstance(item, str):
            name = item.strip()
            item = {"name": name} if name else None
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("location") or "").strip()
        if not name:
            continue
        location_id = str(item.get("id") or _stable_id("location", name)).strip()
        location = {
            **item,
            "id": location_id,
            "name": name,
            "coordinates": _normalize_coordinates(item.get("coordinates")),
            "launches": [],
        }
        location.pop("location", None)
        for launch_index, launch in enumerate(_as_list(item.get("launches"))):
            if isinstance(launch, str):
                launch = {"name": launch}
            if not isinstance(launch, dict):
                continue
            launch_name = str(launch.get("name") or launch.get("launch") or "").strip()
            if not launch_name:
                continue
            launch_record = {
                **launch,
                "id": str(launch.get("id") or _stable_id("launch", location_id, launch_name)).strip(),
                "name": launch_name,
                "coordinates": _normalize_coordinates(launch.get("coordinates")),
            }
            launch_record.pop("launch", None)
            location["launches"].append(launch_record)
        key = name.casefold()
        existing = by_name.get(key)
        if existing is None:
            by_name[key] = location
            result.append(location)
        else:
            existing["coordinates"] = existing.get("coordinates") or location.get("coordinates")
            known_launches = {str(launch.get("name") or "").casefold() for launch in existing["launches"]}
            existing["launches"].extend(launch for launch in location["launches"] if str(launch.get("name") or "").casefold() not in known_launches)
    return result


def _normalize_trip(trip: object, index: int, locations: list[dict]) -> dict:
    if not isinstance(trip, dict):
        raise MigrationError(f"trips[{index}] is not an object")
    result = deepcopy(trip)
    result["launchTime"] = str(_first_present(result.get("launchTime"), result.get("linesSetTime"), result.get("startTime")) or "")
    result["linesPulledTime"] = str(_first_present(result.get("linesPulledTime"), result.get("endTime")) or "")
    for key in LEGACY_TRIP_FIELDS:
        result.pop(key, None)
    result.setdefault("gearUsed", [])
    result.setdefault("catches", [])
    result.setdefault("lostFish", [])
    result.setdefault("people", [])
    result.setdefault("notePhotos", [])

    location_name = str(result.get("location") or "").strip()
    location_id = str(result.get("locationId") or "").strip()
    location = next((item for item in locations if item["id"] == location_id), None)
    if location is None and location_name:
        location = next((item for item in locations if item["name"].casefold() == location_name.casefold()), None)
    if location is not None:
        result["location"] = location["name"]
        result["locationId"] = location["id"]
    launch_name = str(result.get("launch") or "").strip()
    launch_id = str(result.get("launchId") or "").strip()
    launch = next((item for item in (location or {}).get("launches", []) if item["id"] == launch_id), None)
    if launch is None and launch_name:
        launch = next((item for item in (location or {}).get("launches", []) if item["name"].casefold() == launch_name.casefold()), None)
    if launch is not None:
        result["launch"] = launch["name"]
        result["launchId"] = launch["id"]

    normalized_gear = []
    for line_index, item in enumerate(_as_list(result.get("gearUsed"))):
        if not isinstance(item, dict):
            continue
        line = deepcopy(item)
        for key in LEGACY_SETUP_FIELDS:
            line.pop(key, None)
        normalized_gear.append(line)
    result["gearUsed"] = normalized_gear

    def normalize_fish(items: object, group: str) -> list[dict]:
        normalized = []
        for fish_index, item in enumerate(_as_list(items)):
            if not isinstance(item, dict):
                continue
            fish = deepcopy(item)
            if not _present(fish.get("gpsSpeed")) and "speed" in fish:
                fish["gpsSpeed"] = fish.get("speed")
            for key in LEGACY_CATCH_FIELDS:
                fish.pop(key, None)
            if "photos" in fish:
                fish["photos"] = _normalize_media_list(fish["photos"], "catch-photos", f"trips[{index}].{group}[{fish_index}].photos")
            normalized.append(fish)
        return normalized

    result["catches"] = normalize_fish(result.get("catches"), "catches")
    result["lostFish"] = normalize_fish(result.get("lostFish"), "lostFish")
    result["notePhotos"] = _normalize_media_list(result.get("notePhotos"), "trip-photos", f"trips[{index}].notePhotos")
    return result


def audit_document(document: dict) -> Counter[str]:
    """Return known legacy fields found in a logical document."""
    findings: Counter[str] = Counter()
    if document.get("schemaVersion") != 2:
        findings["schemaVersion"] += 1
    if "tripTypes" in document:
        findings["tripTypes"] += 1
    settings = document.get("settings") if isinstance(document.get("settings"), dict) else {}
    for key in LEGACY_SETTINGS_FIELDS:
        if key in settings:
            findings[key] += 1
    for collection in ("lures", "flashers", "reels", "rods"):
        for record in _as_list(document.get(collection)):
            if not isinstance(record, dict):
                continue
            for key in LEGACY_GEAR_MEDIA_FIELDS:
                if key in record:
                    findings[f"{collection}.{key}"] += 1
            for media_list_name in ("media", "photos"):
                for item in _as_list(record.get(media_list_name)):
                    for key in LEGACY_MEDIA_FIELDS:
                        if isinstance(item, dict) and key in item:
                            findings[f"media.{key}"] += 1
                    if isinstance(item, dict) and "category" not in item:
                        findings["media.category"] += 1
    for index, trip in enumerate(_as_list(document.get("trips"))):
        if not isinstance(trip, dict):
            continue
        for key in LEGACY_TRIP_FIELDS:
            if key in trip:
                findings[f"trip.{key}"] += 1
        for item in _as_list(trip.get("gearUsed")):
            if isinstance(item, dict):
                for key in LEGACY_SETUP_FIELDS:
                    if key in item:
                        findings[f"gearUsed.{key}"] += 1
        for group in ("catches", "lostFish"):
            for item in _as_list(trip.get(group)):
                if isinstance(item, dict):
                    for key in LEGACY_CATCH_FIELDS:
                        if key in item:
                            findings[f"{group}.{key}"] += 1
                    for media in _as_list(item.get("photos")):
                        for key in LEGACY_MEDIA_FIELDS:
                            if isinstance(media, dict) and key in media:
                                findings[f"media.{key}"] += 1
                        if isinstance(media, dict) and "category" not in media:
                            findings["media.category"] += 1
        for media in _as_list(trip.get("notePhotos")):
            for key in LEGACY_MEDIA_FIELDS:
                if isinstance(media, dict) and key in media:
                    findings[f"media.{key}"] += 1
            if isinstance(media, dict) and "category" not in media:
                findings["media.category"] += 1
    return findings


def migrate_document(source: dict) -> dict:
    """Convert known legacy shapes to one canonical schema-v2 document."""
    if not isinstance(source, dict):
        raise MigrationError("Logbook must be a JSON object")
    if not audit_document(source) and source.get("schemaVersion") == 2:
        return deepcopy(source)

    document = deepcopy(DEFAULT_LOGBOOK)
    document.update(deepcopy(source))
    document["schemaVersion"] = 2
    document.pop("tripTypes", None)
    for key in COLLECTION_KEYS:
        if not isinstance(document.get(key), list):
            document[key] = deepcopy(DEFAULT_LOGBOOK.get(key, []))
    document["settings"] = _normalize_settings(source.get("settings"))

    for key in TEXT_OPTION_KEYS:
        document[key] = _normalize_text_options(key, source.get(key), DEFAULT_LOGBOOK[key])
    for key in CHOICE_OPTION_KEYS:
        document[key] = _normalize_choice_options(key, source.get(key), DEFAULT_LOGBOOK[key])

    document["locations"] = _normalize_locations(source.get("locations"))
    for collection in ("lures", "flashers", "reels", "rods"):
        for record in _as_list(document.get(collection)):
            if not isinstance(record, dict):
                continue
            _normalize_gear_media(record, collection, f"{collection}[{record.get('id', '?')}]")
    document["trips"] = [
        _normalize_trip(trip, index, document["locations"])
        for index, trip in enumerate(_as_list(source.get("trips")))
    ]
    return document


def _read_database(path: Path) -> dict:
    loaded = logbook_repository.read(path, COLLECTION_KEYS)
    if loaded is None:
        raise MigrationError(f"Database does not contain a logbook: {path}")
    return loaded


def _read_archive(path: Path) -> tuple[dict, dict, list[str]]:
    try:
        with ZipFile(path) as bundle:
            names = bundle.namelist()
            if len(names) != len(set(names)):
                raise MigrationError(f"Archive contains duplicate file paths: {path}")
            if "manifest.json" not in names or "logbook.json" not in names:
                raise MigrationError(f"Archive is missing its manifest or logbook: {path}")
            manifest = json.loads(bundle.read("manifest.json"))
            document = json.loads(bundle.read("logbook.json"))
    except (BadZipFile, KeyError, json.JSONDecodeError) as error:
        raise MigrationError(f"Could not read archive: {path}") from error
    if not isinstance(manifest, dict) or not isinstance(document, dict):
        raise MigrationError(f"Archive manifest and logbook must be JSON objects: {path}")
    return manifest, document, names


def _archive_media_names(names: list[str]) -> set[str]:
    media_names: set[str] = set()
    for name in names:
        if not name.startswith("media/") or name.endswith("/"):
            continue
        parts = Path(name).parts
        if "\\" in name or len(parts) < 3 or parts[0] != "media" or parts[1] not in UPLOAD_CATEGORIES or any(part in {".", ".."} for part in parts):
            raise MigrationError("Archive contains an invalid media path.")
        if name in media_names:
            raise MigrationError("Archive contains duplicate media paths.")
        media_names.add(name)
    return media_names


def _validate_archive_media(document: dict, names: list[str]) -> None:
    media_names = _archive_media_names(names)
    missing_media = sorted(
        f"media/{category}/{filename}"
        for category, filename in referenced_uploads(document)
        if f"media/{category}/{filename}" not in media_names
    )
    if missing_media:
        raise MigrationError(f"Archive is missing referenced media: {missing_media[0]}")


def _document_media_files(document: dict) -> set[str]:
    paths: set[str] = set()

    def walk(value: object) -> None:
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return
        category = value.get("category")
        filename = value.get("filename")
        if category in UPLOAD_CATEGORIES and isinstance(filename, str) and filename and "/" not in filename and "\\" not in filename:
            paths.add(f"media/{category}/{filename}")
            preview = value.get("previewFilename")
            if isinstance(preview, str) and preview and "/" not in preview and "\\" not in preview:
                paths.add(f"media/{category}/_previews/{preview}")
        for item in value.values():
            walk(item)

    walk(document)
    return paths


def _archive_names_with_media_root(document: dict, names: list[str], media_root: Path | None) -> list[str]:
    if media_root is None:
        return names
    available = set(names)
    for archive_name in _document_media_files(document) - available:
        relative = Path(archive_name).relative_to("media")
        if (media_root / relative).is_file():
            available.add(archive_name)
    return sorted(available)


def _v2_archive_manifest(source: dict) -> dict:
    manifest = deepcopy(source)
    manifest.update({
        "archiveVersion": 2,
        "format": "fishing-logbook-archive",
        "schemaVersion": 2,
    })
    return manifest


def _backup_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def _rewrite_archive(path: Path, manifest: dict, document: dict, media_root: Path | None = None) -> list[str]:
    """Rewrite only the JSON members while streaming media binaries unchanged."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.stem}-v2-migration-",
        suffix=path.suffix,
        dir=path.parent,
    )
    os.close(descriptor)
    temporary_path = Path(temporary_name)
    existing_names = set()
    added_media: list[str] = []
    try:
        with ZipFile(path) as source, ZipFile(temporary_path, "w", compression=ZIP_STORED, allowZip64=True) as destination:
            existing_names = set(source.namelist())
            for info in source.infolist():
                if info.filename == "manifest.json":
                    destination.writestr(info, json.dumps(_v2_archive_manifest(manifest), separators=(",", ":"), allow_nan=False).encode())
                elif info.filename == "logbook.json":
                    destination.writestr(info, json.dumps(document, separators=(",", ":"), allow_nan=False).encode())
                elif info.is_dir():
                    destination.writestr(info, b"")
                else:
                    with source.open(info) as input_stream, destination.open(info, "w") as output_stream:
                        shutil.copyfileobj(input_stream, output_stream, length=1024 * 1024)
            if media_root is not None:
                for archive_name in sorted(_document_media_files(document) - existing_names):
                    relative = Path(archive_name).relative_to("media")
                    source_path = media_root / relative
                    if not source_path.is_file():
                        continue
                    destination.write(source_path, archive_name)
                    added_media.append(archive_name)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return added_media


def _vacuum(path: Path) -> None:
    with sqlite3.connect(path, timeout=30) as connection:
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        connection.execute("VACUUM")


def _backup_path(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return PROJECT_ROOT / "backups" / f"{path.stem}-before-v2-legacy-migration-{stamp}{path.suffix}"


def _print_report(path: Path, before: dict, after: dict, label: str) -> None:
    findings = audit_document(before)
    print(f"{label}: {path}")
    print(f"Before schema: {before.get('schemaVersion')}; after schema: {after.get('schemaVersion')}")
    print(f"Trips: {len(_as_list(after.get('trips')))}")
    if findings:
        print("Legacy fields found:")
        for key, count in sorted(findings.items()):
            print(f"  {key}: {count}")
    else:
        print("Legacy fields found: none")
    print(f"Document changes planned: {'yes' if before != after else 'no'}")
    valid, error = logbook_store.validate_logbook(after)
    print(f"Canonical validation: {'ok' if valid else error}")
    if not valid:
        raise MigrationError(error or "Migrated document is invalid")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument("--database", type=Path, help="SQLite database to inspect or migrate")
    input_group.add_argument("--archive", type=Path, help="Portable desktop/mobile ZIP archive to inspect or migrate")
    parser.add_argument("--apply", action="store_true", help="Back up and persist the migrated database or archive")
    parser.add_argument("--backup", type=Path, help="Optional backup path used with --apply")
    parser.add_argument("--media-root", type=Path, help="Optional upload root used to fill missing archive media files")
    args = parser.parse_args()

    is_archive = args.archive is not None
    input_path = (args.archive or args.database or DATABASE_FILE).resolve()
    media_root = args.media_root.resolve() if args.media_root else None
    manifest = None
    archive_names = None
    if is_archive:
        manifest, before, archive_names = _read_archive(input_path)
    else:
        before = _read_database(input_path)
    after = migrate_document(before)
    _print_report(input_path, before, after, "Archive" if is_archive else "Database")
    if is_archive:
        _validate_archive_media(after, _archive_names_with_media_root(after, archive_names, media_root))
    if not args.apply:
        print("Dry run only. Re-run with --apply to persist the conversion.")
        return 0

    backup = args.backup.resolve() if args.backup else _backup_path(input_path)
    if is_archive:
        _backup_file(input_path, backup)
        added_media = _rewrite_archive(input_path, manifest, after, media_root)
        _, final, final_archive_names = _read_archive(input_path)
        _validate_archive_media(final, final_archive_names)
        if added_media:
            print(f"Added {len(added_media)} missing media files from: {media_root}")
    else:
        logbook_repository.backup(input_path, backup)
        logbook_repository.write(input_path, after, COLLECTION_KEYS, OBJECT_COLLECTION_KEYS)
        _vacuum(input_path)
        final = _read_database(input_path)
    final_findings = audit_document(final)
    valid, error = logbook_store.validate_logbook(final)
    if not valid:
        raise MigrationError(error or "Persisted database is invalid")
    if final_findings:
        raise MigrationError(f"Legacy fields remain after migration: {dict(final_findings)}")
    print(f"Applied. Backup: {backup}")
    print("Post-migration audit: no known legacy fields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
