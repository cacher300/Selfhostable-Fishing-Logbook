from __future__ import annotations

import math
import uuid
from copy import deepcopy

from .backend_config import BATHYMETRY_LAKES, DATABASE_FILE, DEFAULT_LOGBOOK, DEFAULT_UNITS, UNIT_OPTIONS
from . import logbook_repository

SCHEMA_VERSION = 1
BOAT_LAYOUT_SLOT_LIMIT = 52
_COLLECTION_KEYS = (
    "species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes",
    "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections",
    "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people",
    "locations", "trips",
)
_OBJECT_COLLECTION_KEYS = {"lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips"}


def normalize_logbook(payload: dict | None = None) -> dict:
    normalized = deepcopy(DEFAULT_LOGBOOK)
    if isinstance(payload, dict):
        normalized.update(payload)

    normalized.pop("tripTypes", None)
    normalized["schemaVersion"] = SCHEMA_VERSION

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

    if not isinstance(normalized.get("settings"), dict):
        normalized["settings"] = deepcopy(DEFAULT_LOGBOOK["settings"])
    else:
        default_ranges = deepcopy(DEFAULT_LOGBOOK["settings"]["chopRanges"])
        ranges = normalized["settings"].get("chopRanges")
        time_format = str(normalized["settings"].get("timeFormat") or "24")
        if time_format not in ("12", "24"):
            time_format = "24"
        try:
            legacy_bathymetry_offset_feet = float(normalized["settings"].get("bathymetryOffsetFeet") or 0)
        except (TypeError, ValueError):
            legacy_bathymetry_offset_feet = 0
        raw_lake_offsets = normalized["settings"].get("bathymetryLakeOffsetsFeet")
        raw_lake_calibrations = normalized["settings"].get("bathymetryLakeCalibrationsFeet")
        lake_calibrations = {}
        for lake in BATHYMETRY_LAKES:
            legacy_offset = raw_lake_offsets.get(lake, legacy_bathymetry_offset_feet) if isinstance(raw_lake_offsets, dict) else legacy_bathymetry_offset_feet
            calibration = raw_lake_calibrations.get(lake) if isinstance(raw_lake_calibrations, dict) else None
            offshore_value = calibration.get("offshoreOffsetFeet", legacy_offset) if isinstance(calibration, dict) else legacy_offset
            try:
                offshore_offset = round(float(offshore_value or 0), 2)
            except (TypeError, ValueError):
                offshore_offset = 0
            lake_calibrations[lake] = {"shallowOffsetFeet": 0, "offshoreOffsetFeet": offshore_offset}
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
        cleaned_default_spread = []
        default_spread = normalized["settings"].get("defaultTrollingSpread")
        if isinstance(default_spread, list):
            for item in default_spread:
                if not isinstance(item, dict):
                    continue
                combo_id = str(item.get("comboId") or "").strip()
                if not combo_id:
                    continue
                cleaned_default_spread.append({
                    "comboId": combo_id,
                    "side": str(item.get("side") or "").strip(),
                    "presentation": str(item.get("presentation") or "").strip(),
                })
        cleaned_default_spreads = []
        raw_default_spreads = normalized["settings"].get("defaultTrollingSpreads")
        if isinstance(raw_default_spreads, list):
            for item in raw_default_spreads:
                if not isinstance(item, dict):
                    continue
                spread = []
                rows = item.get("spread")
                if not isinstance(rows, list):
                    continue
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    combo_id = str(row.get("comboId") or "").strip()
                    if not combo_id:
                        continue
                    spread.append({
                        "comboId": combo_id,
                        "side": str(row.get("side") or "").strip(),
                        "presentation": str(row.get("presentation") or "").strip(),
                    })
                if spread:
                    cleaned_default_spreads.append({
                        "targetSpecies": str(item.get("targetSpecies") or "").strip(),
                        "spread": spread,
                    })
        if cleaned_default_spread and not any(not item["targetSpecies"] for item in cleaned_default_spreads):
            cleaned_default_spreads.append({"targetSpecies": "", "spread": cleaned_default_spread})
        cleaned_private_locations = []
        private_locations = normalized["settings"].get("privatePhotoLocations")
        if isinstance(private_locations, list):
            for index, item in enumerate(private_locations):
                if not isinstance(item, dict):
                    continue
                coordinates = usable_coordinates(item.get("coordinates"))
                if not coordinates:
                    continue
                try:
                    radius_meters = max(25, min(10000, float(item.get("radiusMeters") or 400)))
                except (TypeError, ValueError):
                    radius_meters = 400
                name = str(item.get("name") or f"Home {index + 1}").strip() or f"Home {index + 1}"
                cleaned_private_locations.append({
                    "id": str(item.get("id") or uuid.uuid4()),
                    "name": name,
                    "radiusMeters": round(radius_meters, 2),
                    "coordinates": coordinates,
                })
        raw_boat_layout = normalized["settings"].get("boatLayout")
        boat_name = str(raw_boat_layout.get("name") or "").strip()[:50] if isinstance(raw_boat_layout, dict) else ""
        raw_boat_equipment = raw_boat_layout.get("equipment") if isinstance(raw_boat_layout, dict) else []
        raw_boat_items = raw_boat_layout.get("items") if isinstance(raw_boat_layout, dict) else []
        allowed_boat_types = {
            "rod-holder", "downrigger", "fish-finder", "live-well", "trolling-motor",
            "chartplotter", "marine-radio", "battery", "tackle", "cooler",
            "landing-net", "seat", "anchor", "custom",
        }
        boat_image_fields = (
            "image", "previewImage", "imagePath", "imageFilename",
            "previewPath", "previewFilename",
        )
        cleaned_boat_equipment = []
        boat_equipment_by_id = {}
        used_boat_equipment_ids = set()

        def clean_boat_equipment(item: dict, equipment_id: str = "") -> dict:
            item_type = str(item.get("type") or "custom")
            if item_type not in allowed_boat_types:
                item_type = "custom"
            fallback_name = " ".join(part.capitalize() for part in item_type.split("-"))
            name = str(item.get("name") or item.get("label") or fallback_name).strip()[:50] or fallback_name
            cleaned = {
                "id": equipment_id or str(item.get("id") or uuid.uuid4()),
                "type": item_type,
                "name": name,
            }
            cleaned.update({field: str(item.get(field) or "") for field in boat_image_fields})
            if not cleaned["previewImage"]:
                cleaned["previewImage"] = cleaned["image"]
            return cleaned

        for item in raw_boat_equipment if isinstance(raw_boat_equipment, list) else []:
            if not isinstance(item, dict) or len(cleaned_boat_equipment) >= 100:
                continue
            equipment_id = str(item.get("id") or uuid.uuid4())
            if equipment_id in used_boat_equipment_ids:
                equipment_id = str(uuid.uuid4())
            cleaned_equipment = clean_boat_equipment(item, equipment_id)
            cleaned_boat_equipment.append(cleaned_equipment)
            boat_equipment_by_id[equipment_id] = cleaned_equipment
            used_boat_equipment_ids.add(equipment_id)

        cleaned_boat_items = []
        used_boat_slots = set()
        used_boat_ids = set()
        legacy_boat_equipment_by_key = {}
        for item in raw_boat_items if isinstance(raw_boat_items, list) else []:
            if not isinstance(item, dict) or len(cleaned_boat_items) >= BOAT_LAYOUT_SLOT_LIMIT:
                continue
            try:
                slot = int(item.get("slot"))
            except (TypeError, ValueError):
                continue
            if slot < 0 or slot >= BOAT_LAYOUT_SLOT_LIMIT or slot in used_boat_slots:
                continue
            item_id = str(item.get("id") or uuid.uuid4())
            if item_id in used_boat_ids:
                item_id = str(uuid.uuid4())
            requested_equipment_id = str(item.get("equipmentId") or "")
            equipment_id = requested_equipment_id
            if equipment_id not in boat_equipment_by_id:
                cleaned_equipment = clean_boat_equipment(item)
                legacy_key = (
                    f"{cleaned_equipment['type']}:{cleaned_equipment['name'].lower()}"
                    if not requested_equipment_id
                    else ""
                )
                shared_equipment_id = legacy_boat_equipment_by_key.get(legacy_key)
                if shared_equipment_id:
                    equipment_id = shared_equipment_id
                else:
                    equipment_id = equipment_id or f"equipment-{item_id}"
                    if equipment_id in used_boat_equipment_ids:
                        equipment_id = str(uuid.uuid4())
                    cleaned_equipment["id"] = equipment_id
                    cleaned_boat_equipment.append(cleaned_equipment)
                    boat_equipment_by_id[equipment_id] = cleaned_equipment
                    used_boat_equipment_ids.add(equipment_id)
                    if legacy_key:
                        legacy_boat_equipment_by_key[legacy_key] = equipment_id
            cleaned_boat_items.append({"id": item_id, "equipmentId": equipment_id, "slot": slot})
            used_boat_slots.add(slot)
            used_boat_ids.add(item_id)
        cleaned_boat_layout = {
            "name": boat_name,
            "equipment": cleaned_boat_equipment,
            "items": cleaned_boat_items,
        }

        allowed_tackle_colors = {
            "#118753", "#2763a7", "#d88418", "#b84848", "#7c4db2", "#4b5563",
        }
        allowed_tackle_item_types = {
            "lure", "flasher", "rod", "reel", "combo",
        }
        allowed_tackle_styles = {"organizer", "cantilever"}
        raw_tackle_boxes = normalized["settings"].get("tackleBoxes")
        cleaned_tackle_boxes = []
        used_tackle_box_ids = set()
        for index, box in enumerate(raw_tackle_boxes if isinstance(raw_tackle_boxes, list) else []):
            if not isinstance(box, dict):
                continue
            box_id = str(box.get("id") or uuid.uuid4())
            if box_id in used_tackle_box_ids:
                box_id = str(uuid.uuid4())
            used_tackle_box_ids.add(box_id)
            style = str(box.get("style") or "organizer")
            if style not in allowed_tackle_styles:
                style = "organizer"
            try:
                layer_count = max(2, min(4, round(float(box.get("layerCount") or 3))))
            except (TypeError, ValueError):
                layer_count = 3
            compartment_count = 6 if style == "cantilever" else 15
            refs = []
            used_refs = set()
            raw_refs = box.get("itemRefs")
            for ref_index, ref in enumerate(raw_refs if isinstance(raw_refs, list) else []):
                if not isinstance(ref, dict):
                    continue
                ref_type = str(ref.get("type") or "")
                ref_id = str(ref.get("id") or "")
                ref_key = (ref_type, ref_id)
                if ref_type not in allowed_tackle_item_types or not ref_id or ref_key in used_refs:
                    continue
                legacy_layer = min(layer_count - 1, ref_index // compartment_count)
                try:
                    layer = max(0, min(layer_count - 1, round(float(ref.get("layer", legacy_layer)))))
                except (TypeError, ValueError):
                    layer = legacy_layer
                used_refs.add(ref_key)
                refs.append({"type": ref_type, "id": ref_id, "layer": layer})
            name = str(box.get("name") or f"Tackle Box {index + 1}").strip()[:50] or f"Tackle Box {index + 1}"
            color = str(box.get("color") or "")
            cleaned_tackle_boxes.append({
                "id": box_id,
                "name": name,
                "color": color if color in allowed_tackle_colors else "#118753",
                "style": style,
                "layerCount": layer_count,
                "itemRefs": refs,
            })

        normalized["settings"] = {
            **deepcopy(DEFAULT_LOGBOOK["settings"]),
            **normalized["settings"],
            "timeFormat": time_format,
            "bathymetryLakeCalibrationsFeet": lake_calibrations,
            "units": cleaned_units,
            "chopRanges": cleaned_ranges or default_ranges,
            "defaultTrollingSpread": cleaned_default_spread,
            "defaultTrollingSpreads": cleaned_default_spreads,
            "boatLayout": cleaned_boat_layout,
            "tackleBoxes": cleaned_tackle_boxes,
            "privatePhotoLocations": cleaned_private_locations,
        }
        normalized["settings"].pop("bathymetryOffsetFeet", None)
        normalized["settings"].pop("bathymetryLakeOffsetsFeet", None)

    list_keys = ("species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips")
    for key in list_keys:
        if not isinstance(normalized.get(key), list):
            normalized[key] = deepcopy(DEFAULT_LOGBOOK[key])

    def clean_text_options(key: str) -> None:
        seen = set()
        cleaned = []
        source = [
            *(normalized.get(key) if isinstance(normalized.get(key), list) else []),
            *DEFAULT_LOGBOOK[key],
        ]
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

    for key in ("species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingDirections"):
        clean_text_options(key)
    for key in ("trollingPresentations", "setupLineSides"):
        clean_choice_options(key)

    for lure in normalized["lures"]:
        if not isinstance(lure, dict):
            continue
        name = str(lure.get("name") or "").strip()
        if name:
            lure["name"] = name
            continue
        generated_name = " ".join(
            value
            for value in (
                str(lure.get("color") or "").strip(),
                str(lure.get("spoonSize") or "").strip(),
                str(lure.get("bladeType") or "").strip(),
                str(lure.get("brand") or "").strip(),
                str(lure.get("type") or "").strip(),
            )
            if value
        )
        lure["name"] = generated_name or "Unnamed Lure"

    known_people = {
        person.get("id"): person
        for person in normalized["people"]
        if isinstance(person, dict) and person.get("id")
    }
    for trip in normalized["trips"]:
        if not isinstance(trip, dict):
            continue
        lines_set_time = str(trip.get("linesSetTime") or trip.get("startTime") or "")
        lines_pulled_time = str(trip.get("linesPulledTime") or trip.get("endTime") or "")
        trip["launchTime"] = str(trip.get("launchTime") or "")
        trip["linesSetTime"] = lines_set_time
        trip["linesPulledTime"] = lines_pulled_time
        trip["startTime"] = lines_set_time
        trip["endTime"] = lines_pulled_time
        for person in trip.get("people", []):
            if (
                isinstance(person, dict)
                and person.get("id")
                and person.get("name")
                and person.get("id") not in known_people
            ):
                known_people[person["id"]] = {"id": person["id"], "name": person["name"]}
    normalized["people"] = list(known_people.values())

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
        title = str(trip.get("title") or "").strip()
        if title:
            trip["title"] = title
        else:
            date = str(trip.get("date") or "").strip()
            species = str(trip.get("targetSpecies") or "").strip()
            trip["title"] = " ".join(
                value for value in (date, f"{species} Trip" if species else "Trip") if value
            )
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


def database_exists() -> bool:
    return logbook_repository.exists(DATABASE_FILE)


def initialize_database() -> None:
    logbook_repository.initialize(DATABASE_FILE)


def read_logbook() -> dict:
    loaded = logbook_repository.read(DATABASE_FILE, _COLLECTION_KEYS)
    if loaded is None:
        return normalize_logbook()
    is_valid, error = validate_logbook(loaded)
    if not is_valid:
        raise ValueError(f"Stored logbook is invalid: {error}")
    return normalize_logbook(loaded)


def write_logbook(payload: dict) -> None:
    is_valid, error = validate_logbook(payload)
    if not is_valid:
        raise ValueError(error)

    normalized = normalize_logbook(payload)
    logbook_repository.write(DATABASE_FILE, normalized, _COLLECTION_KEYS, _OBJECT_COLLECTION_KEYS)


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
    if version < 0:
        return _error("schemaVersion", "must not be negative")
    if version > SCHEMA_VERSION:
        return _error("schemaVersion", f"version {version} is newer than supported version {SCHEMA_VERSION}")
    return True, None


def _validate_required_lists(payload: dict) -> tuple[bool, str | None]:
    for key in ("trips", "lures", "flashers"):
        if key not in payload:
            return _error(key, "is required")
    return True, None


def _validate_option_lists(payload: dict) -> tuple[bool, str | None]:
    keys = (
        "species", "methods", "lureTypes", "flasherTypes", "waterClarities",
        "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingDirections",
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
    keys = ("lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips")
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
                try:
                    float(calibration.get(key, 0))
                except (TypeError, ValueError):
                    return _error(f"settings.bathymetryLakeCalibrationsFeet.{lake}.{key}", "must be a number")
    valid, error = _validate_units(settings)
    if not valid:
        return valid, error
    if "chopRanges" in settings:
        valid, error = _validate_nested_records(settings["chopRanges"], "settings.chopRanges")
        if not valid:
            return valid, error
    if "defaultTrollingSpread" in settings:
        valid, error = _validate_nested_records(settings["defaultTrollingSpread"], "settings.defaultTrollingSpread")
        if not valid:
            return valid, error
    if "defaultTrollingSpreads" in settings:
        valid, error = _validate_nested_records(settings["defaultTrollingSpreads"], "settings.defaultTrollingSpreads")
        if not valid:
            return valid, error
    if "privatePhotoLocations" in settings:
        private_locations = settings["privatePhotoLocations"]
        if not isinstance(private_locations, list):
            return _error("settings.privatePhotoLocations", "must be a list")
        for index, item in enumerate(private_locations):
            path = f"settings.privatePhotoLocations[{index}]"
            if not isinstance(item, dict):
                return _error(path, "must be an object")
            if "coordinates" in item:
                valid, error = _validate_coordinates(item.get("coordinates"), f"{path}.coordinates")
                if not valid:
                    return valid, error
            if "radiusMeters" in item:
                try:
                    radius = float(item["radiusMeters"])
                except (TypeError, ValueError):
                    return _error(f"{path}.radiusMeters", "must be a number")
                if radius < 25 or radius > 10000:
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
        for catch_index, catch in enumerate(trip.get("catches", [])):
            for field in ("coordinates", "manualCoordinates", "lockedLocationCoordinates"):
                valid, error = _validate_coordinates(
                    catch.get(field),
                    f"{path}.catches[{catch_index}].{field}",
                )
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
        _validate_reels,
        _validate_trips,
    )
    for validator in validators:
        valid, error = validator(payload)
        if not valid:
            return valid, error

    return True, None
