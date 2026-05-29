from __future__ import annotations

import json
import uuid
from copy import deepcopy

from .backend_config import DATA_DIR, DATA_FILE, DEFAULT_LOGBOOK, DEFAULT_UNITS, UNIT_OPTIONS


def normalize_logbook(payload: dict | None = None) -> dict:
    normalized = deepcopy(DEFAULT_LOGBOOK)
    if isinstance(payload, dict):
        normalized.update(payload)

    normalized.pop("tripTypes", None)
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
    if not DATA_FILE.exists():
        return normalize_logbook()

    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
    except json.JSONDecodeError:
        return normalize_logbook()

    return normalize_logbook(loaded)

def write_logbook(payload: dict) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(normalize_logbook(payload), file, indent=2)





def validate_logbook(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, "Logbook must be a JSON object"

    required_lists = ("trips", "lures", "flashers")
    if any(not isinstance(payload.get(key), list) for key in required_lists):
        return False, "Logbook must include trips, lures, and flashers lists"

    optional_lists = ("reels", "rods", "rodReelCombos")
    if any(key in payload and not isinstance(payload.get(key), list) for key in optional_lists):
        return False, "Logbook gear inventory fields must be lists"

    if not isinstance(payload.get("people", []), list):
        return False, "Logbook people must be a list"

    return True, None


