from __future__ import annotations

import json
import math
import os
import uuid
from copy import deepcopy
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.utils import secure_filename


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "logbook.json"
UPLOADS_DIR = DATA_DIR / "uploads"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
UPLOAD_CATEGORIES = {"catch-photos", "trip-photos", "lures", "flashers", "reels", "rods", "queue"}
ALLOWED_IMAGE_EXTENSIONS = {".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".webm", ".avi", ".mpeg", ".mpg", ".3gp"}
ALLOWED_MEDIA_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
PREVIEW_DIRNAME = "_previews"
PREVIEW_MAX_SIZE = (1200, 1200)
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
SUNRISE_SUNSET_URL = "https://api.sunrisesunset.io/json"
WEATHER_QUERY_KEYS = {
    "latitude",
    "longitude",
    "start_date",
    "end_date",
    "timezone",
    "cell_selection",
    "temperature_unit",
    "wind_speed_unit",
    "precipitation_unit",
    "hourly",
    "daily",
}
MARINE_QUERY_KEYS = {
    "latitude",
    "longitude",
    "start_date",
    "end_date",
    "timezone",
    "cell_selection",
    "hourly",
}
ASTRONOMY_QUERY_KEYS = {"lat", "lng", "date", "timezone", "time_format"}
WEATHER_HOURLY_FIELDS = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "dew_point_2m",
    "precipitation",
    "rain",
    "snowfall",
    "weather_code",
    "surface_pressure",
    "pressure_msl",
    "cloud_cover",
    "visibility",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]
MARINE_HOURLY_FIELDS = ["wave_height", "wave_direction", "wave_period"]
WEATHER_DAILY_FIELDS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "rain_sum",
    "snowfall_sum",
    "sunshine_duration",
    "daylight_duration",
    "sunrise",
    "sunset",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
]


DEFAULT_LOGBOOK = {
    "species": [
        "Lake Trout",
        "Largemouth Bass",
        "Smallmouth Bass",
        "Chinook Salmon",
        "Coho Salmon",
        "Rainbow Trout",
        "Brown Trout",
        "Walleye",
        "Northern Pike",
        "Muskie",
        "Rock Bass",
        "Perch",
        "Crappie",
        "Bluegill",
    ],
    "methods": [
        "Trolling",
        "Casting",
        "Jigging",
        "Fly Fishing",
        "Bait Fishing",
        "Ice Fishing",
        "Shore Fishing",
    ],
    "lureTypes": [
        "Spoon",
        "Fly",
        "Meat Rig",
        "Crankbait",
        "Spinner",
        "Jig",
        "Soft Plastic",
        "Plug",
        "Swimbait",
        "Flasher/Fly",
        "Jerkbait",
        "Topwater",
        "Blade Bait",
        "Other",
    ],
    "flasherTypes": [
        "Paddle",
        "Spin Doctor",
    ],
    "lures": [],
    "flashers": [],
    "reels": [],
    "rods": [],
    "rodReelCombos": [],
    "settings": {
        "chopRanges": [
            {"id": "calm", "label": "Calm", "maxFeet": 0.5},
            {"id": "light", "label": "Light Chop", "maxFeet": 1},
            {"id": "moderate", "label": "Moderate Chop", "maxFeet": 1.5},
            {"id": "very-choppy", "label": "Very Choppy", "maxFeet": 2},
            {"id": "rough", "label": "Rough", "maxFeet": None},
        ],
    },
    "people": [],
    "locations": [],
    "trips": [],
}


def normalize_logbook(payload: dict | None = None) -> dict:
    normalized = deepcopy(DEFAULT_LOGBOOK)
    if isinstance(payload, dict):
        normalized.update(payload)

    normalized["methods"] = deepcopy(DEFAULT_LOGBOOK["methods"])
    normalized.pop("tripTypes", None)
    if not isinstance(normalized.get("settings"), dict):
        normalized["settings"] = deepcopy(DEFAULT_LOGBOOK["settings"])
    else:
        default_ranges = deepcopy(DEFAULT_LOGBOOK["settings"]["chopRanges"])
        ranges = normalized["settings"].get("chopRanges")
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
        normalized["settings"] = {**deepcopy(DEFAULT_LOGBOOK["settings"]), **normalized["settings"], "chopRanges": cleaned_ranges or default_ranges}

    list_keys = ("species", "lureTypes", "flasherTypes", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips")
    for key in list_keys:
        if not isinstance(normalized.get(key), list):
            normalized[key] = deepcopy(DEFAULT_LOGBOOK[key])

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


def upload_category_path(category: str) -> Path:
    if category not in UPLOAD_CATEGORIES:
        abort(404)
    path = UPLOADS_DIR / category
    path.mkdir(parents=True, exist_ok=True)
    return path


def upload_metadata_path(category: str, filename: str) -> Path:
    return upload_category_path(category) / f"{filename}.json"


def upload_preview_path(category: str, filename: str) -> Path:
    preview_dir = upload_category_path(category) / PREVIEW_DIRNAME
    preview_dir.mkdir(parents=True, exist_ok=True)
    return preview_dir / f"{Path(filename).stem}.jpg"


def write_upload_metadata(category: str, filename: str, metadata: dict) -> None:
    upload_metadata_path(category, filename).write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def read_upload_metadata(category: str, filename: str) -> dict:
    metadata_path = upload_metadata_path(category, filename)
    if not metadata_path.exists():
        return {}
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def delete_upload_file(category: str, filename: str, metadata: dict | None = None) -> None:
    metadata = metadata or read_upload_metadata(category, filename)
    media_path = upload_category_path(category) / filename
    metadata_path = upload_metadata_path(category, filename)
    preview_filename = metadata.get("previewFilename") or upload_preview_path(category, filename).name
    preview_path = upload_category_path(category) / PREVIEW_DIRNAME / preview_filename
    for path in (media_path, metadata_path, preview_path):
        if path.is_file():
            path.unlink()


def media_key_from_reference(value: object) -> tuple[str, str] | None:
    if not isinstance(value, dict):
        return None

    path = str(value.get("path") or "")
    if "/" in path:
        category, stored_name = path.split("/", 1)
        return category, stored_name

    for field in ("url", "image"):
        media_path = str(value.get(field) or "")
        if not media_path.startswith("/uploads/"):
            continue
        parts = media_path.removeprefix("/uploads/").split("/")
        if len(parts) >= 2:
            return parts[0], parts[1]

    return None


def referenced_uploads(value: object) -> set[tuple[str, str]]:
    references: set[tuple[str, str]] = set()
    if isinstance(value, list):
        for item in value:
            references.update(referenced_uploads(item))
    elif isinstance(value, dict):
        media_key = media_key_from_reference(value)
        if media_key:
            references.add(media_key)
        elif value.get("filename"):
            filename = str(value.get("filename") or "")
            for category in UPLOAD_CATEGORIES:
                if (upload_category_path(category) / filename).is_file():
                    references.add((category, filename))
        for item in value.values():
            references.update(referenced_uploads(item))
    return references


def create_upload_preview(category: str, filename: str) -> str:
    source = upload_category_path(category) / filename
    preview = upload_preview_path(category, filename)
    try:
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail(PREVIEW_MAX_SIZE)
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(preview, "JPEG", quality=78, optimize=True)
    except (OSError, UnidentifiedImageError):
        return ""
    return preview.name


def upload_media_type(mimetype: str, suffix: str) -> str:
    if suffix in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if suffix in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    if mimetype.startswith("image/"):
        return "image"
    if mimetype.startswith("video/"):
        return "video"
    return ""


def upload_payload(category: str, filename: str, metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    preview_filename = metadata.get("previewFilename") or ""
    return {
        **metadata,
        "filename": filename,
        "name": metadata.get("name") or filename,
        "path": f"{category}/{filename}",
        "url": f"/uploads/{category}/{filename}",
        "image": f"/uploads/{category}/{filename}",
        "mediaType": metadata.get("mediaType") or "image",
        "previewFilename": preview_filename,
        "previewPath": f"{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
        "previewUrl": f"/uploads/{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
        "previewImage": f"/uploads/{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
    }


def upload_gallery_items(category: str) -> list[dict]:
    directory = upload_category_path(category)
    items = []
    for file_path in directory.iterdir():
        if not file_path.is_file() or file_path.suffix == ".json":
            continue
        metadata = read_upload_metadata(category, file_path.name)
        items.append({
            **upload_payload(category, file_path.name, metadata),
            "category": category,
            "size": file_path.stat().st_size,
            "modified": file_path.stat().st_mtime,
            "downloadUrl": f"/uploads/{category}/{file_path.name}",
        })
    return items


def orphaned_upload_items() -> list[dict]:
    references = referenced_uploads(read_logbook())
    items = []
    for category in sorted(UPLOAD_CATEGORIES - {"queue"}):
        for item in upload_gallery_items(category):
            if (category, item["filename"]) not in references:
                items.append(item)
    items.sort(key=lambda item: item["modified"], reverse=True)
    return items


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


def weather_archive_payload(args: dict) -> tuple[dict, int]:
    params = {key: str(args.get(key, "")).strip() for key in WEATHER_QUERY_KEYS if str(args.get(key, "")).strip()}
    try:
        latitude = float(params.get("latitude", ""))
        longitude = float(params.get("longitude", ""))
    except ValueError:
        return {"error": "Weather coordinates are invalid."}, 400
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return {"error": "Weather coordinates are invalid."}, 400
    if not params.get("start_date") or not params.get("end_date"):
        return {"error": "Weather date is required."}, 400

    params.setdefault("timezone", "auto")
    params.setdefault("cell_selection", "nearest")
    try:
        url = f"{OPEN_METEO_ARCHIVE_URL}?{urlencode(params)}"
        request_headers = {"User-Agent": "FishingLogbook/1.0 (+https://sunrisesunset.io/api/)"}
        with urlopen(Request(url, headers=request_headers), timeout=20) as response:
            return json.loads(response.read().decode("utf-8")), 200
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("reason") or payload.get("error")
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = None
        return {"error": message or "Weather data is unavailable for this trip."}, error.code
    except (URLError, TimeoutError, OSError):
        return {"error": "Weather service unavailable. Try again later."}, 503


def weather_forecast_payload(args: dict) -> tuple[dict, int]:
    params = {key: str(args.get(key, "")).strip() for key in WEATHER_QUERY_KEYS if str(args.get(key, "")).strip()}
    try:
        latitude = float(params.get("latitude", ""))
        longitude = float(params.get("longitude", ""))
    except ValueError:
        return {"error": "Weather coordinates are invalid."}, 400
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return {"error": "Weather coordinates are invalid."}, 400
    params.setdefault("timezone", "auto")
    params.setdefault("cell_selection", "nearest")
    try:
        url = f"{OPEN_METEO_FORECAST_URL}?{urlencode(params)}"
        request_headers = {"User-Agent": "FishingLogbook/1.0 (+https://open-meteo.com/)"}
        with urlopen(Request(url, headers=request_headers), timeout=20) as response:
            return json.loads(response.read().decode("utf-8")), 200
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("reason") or payload.get("error")
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = None
        return {"error": message or "Forecast weather data is unavailable for this trip."}, error.code
    except (URLError, TimeoutError, OSError):
        return {"error": "Weather service unavailable. Try again later."}, 503


def marine_weather_payload(args: dict) -> tuple[dict, int]:
    params = {key: str(args.get(key, "")).strip() for key in MARINE_QUERY_KEYS if str(args.get(key, "")).strip()}
    try:
        latitude = float(params.get("latitude", ""))
        longitude = float(params.get("longitude", ""))
    except ValueError:
        return {"error": "Marine coordinates are invalid."}, 400
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return {"error": "Marine coordinates are invalid."}, 400
    params.setdefault("timezone", "auto")
    params.setdefault("cell_selection", "nearest")
    params.setdefault("hourly", ",".join(MARINE_HOURLY_FIELDS))

    def has_numeric_wave_height(payload: dict) -> bool:
        hourly = payload.get("hourly") if isinstance(payload, dict) else None
        series = hourly.get("wave_height") if isinstance(hourly, dict) else None
        if not isinstance(series, list):
            return False
        for value in series:
            try:
                if math.isfinite(float(value)):
                    return True
            except (TypeError, ValueError):
                continue
        return False

    def fetch_marine(fetch_params: dict) -> tuple[dict, int]:
        url = f"{OPEN_METEO_MARINE_URL}?{urlencode(fetch_params)}"
        request_headers = {"User-Agent": "FishingLogbook/1.0 (+https://open-meteo.com/)"}
        with urlopen(Request(url, headers=request_headers), timeout=20) as response:
            return json.loads(response.read().decode("utf-8")), 200

    try:
        payload, status = fetch_marine(params)
        if status == 200 and has_numeric_wave_height(payload):
            return payload, status
        if "cell_selection" in params:
            retry_params = dict(params)
            retry_params.pop("cell_selection", None)
            retry_payload, retry_status = fetch_marine(retry_params)
            if retry_status == 200:
                return retry_payload, retry_status
        return payload, status
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("reason") or payload.get("error")
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = None
        return {"error": message or "Marine weather data is unavailable for this trip."}, error.code
    except (URLError, TimeoutError, OSError):
        return {"error": "Marine weather service unavailable. Try again later."}, 503


def astronomy_payload(args: dict) -> tuple[dict, int]:
    params = {key: str(args.get(key, "")).strip() for key in ASTRONOMY_QUERY_KEYS if str(args.get(key, "")).strip()}
    try:
        latitude = float(params.get("lat", ""))
        longitude = float(params.get("lng", ""))
    except ValueError:
        return {"error": "Astronomy coordinates are invalid."}, 400
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return {"error": "Astronomy coordinates are invalid."}, 400
    if not params.get("date"):
        return {"error": "Astronomy date is required."}, 400

    params.setdefault("time_format", "24")
    try:
        url = f"{SUNRISE_SUNSET_URL}?{urlencode(params)}"
        request_headers = {"User-Agent": "FishingLogbook/1.0 (+https://sunrisesunset.io/api/)"}
        with urlopen(Request(url, headers=request_headers), timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("status") and payload.get("status") != "OK":
            return {"error": payload.get("status") or "Astronomy data is unavailable."}, 502
        return payload, 200
    except HTTPError as error:
        return {"error": "Astronomy data is unavailable for this trip."}, error.code
    except (URLError, TimeoutError, OSError):
        return {"error": "Astronomy service unavailable. Try again later."}, 503


def weather_source_for_trip(logbook: dict, trip: dict) -> dict | None:
    location_id = str(trip.get("locationId") or "")
    location_name = str(trip.get("location") or "").strip().lower()
    location = next((item for item in logbook.get("locations", []) if item.get("id") == location_id), None)
    if location is None and location_name:
        location = next((item for item in logbook.get("locations", []) if str(item.get("name", "")).strip().lower() == location_name), None)
    if not location:
        return None
    launch_id = str(trip.get("launchId") or "")
    launch_name = str(trip.get("launch") or "").strip().lower()
    launch = next((item for item in location.get("launches", []) if item.get("id") == launch_id), None)
    if launch is None and launch_name:
        launch = next((item for item in location.get("launches", []) if str(item.get("name", "")).strip().lower() == launch_name), None)
    if launch and launch.get("coordinates"):
        return {"type": "launch", "name": launch.get("name", ""), "coordinates": launch["coordinates"]}
    if location.get("coordinates"):
        return {"type": "location", "name": location.get("name", ""), "coordinates": location["coordinates"]}
    return None


def trip_end_date(trip: dict) -> str:
    trip_date = str(trip.get("date") or "")
    start_time = str(trip.get("startTime") or "")
    end_time = str(trip.get("endTime") or "")
    if not trip_date or not start_time or not end_time:
        return trip_date
    try:
        start_hour, start_minute = [int(part) for part in start_time.split(":")[:2]]
        end_hour, end_minute = [int(part) for part in end_time.split(":")[:2]]
    except ValueError:
        return trip_date
    if (end_hour * 60 + end_minute) >= (start_hour * 60 + start_minute):
        return trip_date
    try:
        from datetime import date, timedelta
        parsed = date.fromisoformat(trip_date)
    except ValueError:
        return trip_date
    return (parsed + timedelta(days=1)).isoformat()


def rounded_coordinate_key(coordinates: dict) -> tuple[str, str]:
    return (f"{float(coordinates['latitude']):.3f}", f"{float(coordinates['longitude']):.3f}")


def admin_weather_bundle(coordinates: dict, start_date: str, end_date: str, cache: dict) -> dict:
    key = (*rounded_coordinate_key(coordinates), start_date, end_date)
    if key in cache:
        return cache[key]
    payload, status = weather_archive_payload({
        "latitude": str(coordinates["latitude"]),
        "longitude": str(coordinates["longitude"]),
        "start_date": start_date,
        "end_date": end_date,
        "timezone": "auto",
        "cell_selection": "nearest",
        "temperature_unit": "celsius",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "hourly": ",".join(WEATHER_HOURLY_FIELDS),
        "daily": ",".join(WEATHER_DAILY_FIELDS),
    })
    if status != 200:
        raise RuntimeError(payload.get("error") or "Weather API unavailable")
    cache[key] = payload
    return payload


def admin_marine_bundle(coordinates: dict, start_date: str, end_date: str, cache: dict) -> dict | None:
    key = (*rounded_coordinate_key(coordinates), start_date, end_date)
    if key in cache:
        return cache[key]
    payload, status = marine_weather_payload({
        "latitude": str(coordinates["latitude"]),
        "longitude": str(coordinates["longitude"]),
        "start_date": start_date,
        "end_date": end_date,
        "timezone": "auto",
        "cell_selection": "nearest",
        "hourly": ",".join(MARINE_HOURLY_FIELDS),
    })
    if status != 200:
        cache[key] = None
        return None
    cache[key] = payload
    return payload


def admin_astronomy_bundle(coordinates: dict, trip_date: str, timezone: str, cache: dict) -> dict | None:
    key = (*rounded_coordinate_key(coordinates), trip_date, timezone or "auto")
    if key in cache:
        return cache[key]
    payload, status = astronomy_payload({
        "lat": str(coordinates["latitude"]),
        "lng": str(coordinates["longitude"]),
        "date": trip_date,
        "timezone": timezone,
        "time_format": "24",
    })
    if status != 200:
        cache[key] = None
        return None
    result = payload.get("results") or {}
    astronomy = {
        "sunrise": result.get("sunrise") or "",
        "sunset": result.get("sunset") or "",
        "moonrise": result.get("moonrise") or "",
        "moonset": result.get("moonset") or "",
        "phase": result.get("moon_phase") or "",
        "illuminationPercent": result.get("moon_illumination"),
    } if result else None
    cache[key] = astronomy
    return astronomy


def list_value(values: dict, key: str, index: int) -> object:
    series = values.get(key)
    if isinstance(series, list) and index < len(series):
        return series[index]
    return None


def hourly_records(bundle: dict) -> list[dict]:
    hourly = bundle.get("hourly") or {}
    times = hourly.get("time") or []
    return [
        {
            "time": time_value,
            "temperatureC": list_value(hourly, "temperature_2m", index),
            "apparentTemperatureC": list_value(hourly, "apparent_temperature", index),
            "humidityPercent": list_value(hourly, "relative_humidity_2m", index),
            "dewPointC": list_value(hourly, "dew_point_2m", index),
            "precipitationIn": list_value(hourly, "precipitation", index),
            "rainIn": list_value(hourly, "rain", index),
            "snowfallIn": list_value(hourly, "snowfall", index),
            "weatherCode": list_value(hourly, "weather_code", index),
            "pressureHpa": list_value(hourly, "pressure_msl", index) if list_value(hourly, "pressure_msl", index) is not None else list_value(hourly, "surface_pressure", index),
            "pressureMslHpa": list_value(hourly, "pressure_msl", index),
            "cloudCoverPercent": list_value(hourly, "cloud_cover", index),
            "visibilityMeters": list_value(hourly, "visibility", index),
            "windSpeedMph": list_value(hourly, "wind_speed_10m", index),
            "windDirectionDegrees": list_value(hourly, "wind_direction_10m", index),
            "windGustMph": list_value(hourly, "wind_gusts_10m", index),
        }
        for index, time_value in enumerate(times)
    ]


def marine_records(bundle: dict | None) -> list[dict]:
    hourly = (bundle or {}).get("hourly") or {}
    times = hourly.get("time") or []
    return [
        {
            "time": time_value,
            "waveHeightM": list_value(hourly, "wave_height", index),
            "waveDirectionDegrees": list_value(hourly, "wave_direction", index),
            "wavePeriodSeconds": list_value(hourly, "wave_period", index),
        }
        for index, time_value in enumerate(times)
    ]


def marine_data_available(records: list[dict]) -> bool:
    return bool(numeric_values(records, "waveHeightM"))


def nearest_marine_record(records: list[dict], trip: dict) -> dict | None:
    valid_records = [record for record in records if isinstance(record.get("waveHeightM"), (int, float))]
    if not valid_records:
        return None
    trip_date = str(trip.get("date") or valid_records[0].get("time", "")[:10])
    start_time = str(trip.get("startTime") or "12:00")
    try:
        from datetime import datetime
        target = datetime.fromisoformat(f"{trip_date}T{start_time}").timestamp()
    except ValueError:
        return valid_records[0]
    best = None
    best_delta = None
    for record in valid_records:
        try:
            from datetime import datetime
            delta = abs(datetime.fromisoformat(str(record.get("time") or "")).timestamp() - target)
        except ValueError:
            continue
        if best_delta is None or delta < best_delta:
            best = record
            best_delta = delta
    return best or valid_records[0]


def daily_record(bundle: dict) -> dict:
    daily = bundle.get("daily") or {}
    return {
        "date": list_value(daily, "time", 0) or "",
        "weatherCode": list_value(daily, "weather_code", 0),
        "temperatureMaxC": list_value(daily, "temperature_2m_max", 0),
        "temperatureMinC": list_value(daily, "temperature_2m_min", 0),
        "precipitationIn": list_value(daily, "precipitation_sum", 0),
        "rainIn": list_value(daily, "rain_sum", 0),
        "snowfallIn": list_value(daily, "snowfall_sum", 0),
        "sunshineDurationSeconds": list_value(daily, "sunshine_duration", 0),
        "daylightDurationSeconds": list_value(daily, "daylight_duration", 0),
        "sunrise": list_value(daily, "sunrise", 0) or "",
        "sunset": list_value(daily, "sunset", 0) or "",
        "windSpeedMaxMph": list_value(daily, "wind_speed_10m_max", 0),
        "windGustMaxMph": list_value(daily, "wind_gusts_10m_max", 0),
        "windDirectionDegrees": list_value(daily, "wind_direction_10m_dominant", 0),
    }


def numeric_values(records: list[dict], key: str) -> list[float]:
    values = []
    for record in records:
        try:
            value = float(record.get(key))
        except (TypeError, ValueError):
            continue
        values.append(value)
    return values


def rounded(value: float, digits: int = 1) -> float:
    return round(value, digits)


def meters_to_feet(value: object) -> float | None:
    try:
        meters = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(meters):
        return None
    return round(meters * 3.28084, 1)


def average_number(records: list[dict], key: str) -> float | None:
    values = numeric_values(records, key)
    return rounded(sum(values) / len(values)) if values else None


def sum_number(records: list[dict], key: str) -> float | None:
    values = numeric_values(records, key)
    return round(sum(values), 2) if values else None


def min_number(records: list[dict], key: str) -> float | None:
    values = numeric_values(records, key)
    return rounded(min(values)) if values else None


def max_number(records: list[dict], key: str) -> float | None:
    values = numeric_values(records, key)
    return rounded(max(values)) if values else None


def trip_window_hours(trip: dict, records: list[dict]) -> list[dict]:
    trip_date = str(trip.get("date") or "")
    start_time = str(trip.get("startTime") or "")
    end_time = str(trip.get("endTime") or "")
    if not start_time or not end_time:
        return [record for record in records if str(record.get("time", "")).startswith(trip_date)]
    start = f"{trip_date}T{start_time}"
    end = f"{trip_end_date(trip)}T{end_time}"
    return [record for record in records if start <= str(record.get("time", "")) <= end]


def trip_window_summary(records: list[dict]) -> dict:
    return {
        "temperatureC": average_number(records, "temperatureC"),
        "apparentTemperatureC": average_number(records, "apparentTemperatureC"),
        "temperatureMaxC": max_number(records, "temperatureC"),
        "temperatureMinC": min_number(records, "temperatureC"),
        "humidityPercent": average_number(records, "humidityPercent"),
        "pressureHpa": average_number(records, "pressureHpa"),
        "pressureMslHpa": average_number(records, "pressureMslHpa"),
        "cloudCoverPercent": average_number(records, "cloudCoverPercent"),
        "visibilityMeters": average_number(records, "visibilityMeters"),
        "precipitationIn": sum_number(records, "precipitationIn"),
        "windSpeedMph": average_number(records, "windSpeedMph"),
        "windGustMph": average_number(records, "windGustMph"),
        "windDirectionDegrees": average_number(records, "windDirectionDegrees"),
    }


def marine_window_summary(records: list[dict], trip: dict | None = None) -> dict:
    if not marine_data_available(records):
        return {
            "marineDataAvailable": False,
            "waveHeightM": None,
            "waveHeightMaxM": None,
            "waveDirectionDegrees": None,
            "wavePeriodSeconds": None,
            "waveTime": "",
        }
    nearest = nearest_marine_record(records, trip or {})
    return {
        "marineDataAvailable": True,
        "waveHeightM": nearest.get("waveHeightM") if nearest else None,
        "waveHeightMaxM": max_number(records, "waveHeightM"),
        "waveDirectionDegrees": nearest.get("waveDirectionDegrees") if nearest else None,
        "wavePeriodSeconds": nearest.get("wavePeriodSeconds") if nearest else None,
        "waveTime": str(nearest.get("time") or "") if nearest else "",
    }


def record_time_minutes(record: dict) -> int | None:
    value = time_text_minutes(str(record.get("time") or ""))
    return value or None


def barometric_trend_rate(records: list[dict]) -> float | None:
    pressure_records = []
    for record in records:
        pressure = record.get("pressureMslHpa")
        if pressure is None:
            pressure = record.get("pressureHpa")
        minutes = record_time_minutes(record)
        if minutes is None:
            continue
        try:
            pressure_records.append((minutes, float(pressure)))
        except (TypeError, ValueError):
            continue
    if len(pressure_records) < 2:
        return None
    pressure_records.sort(key=lambda item: item[0])
    current_minutes, current_pressure = pressure_records[-1]
    target_minutes = current_minutes - 180
    prior_minutes, prior_pressure = min(pressure_records, key=lambda item: abs(item[0] - target_minutes))
    if prior_minutes == current_minutes:
        return None
    return rounded(current_pressure - prior_pressure)


def barometric_trend_rate_label(delta: float | None) -> str:
    if delta is None:
        return ""
    if delta <= -3:
        return "falling fast"
    if delta < -0.8:
        return "falling"
    if delta >= 3:
        return "rising fast"
    if delta > 0.8:
        return "rising"
    return "steady"


def numeric_delta(records: list[dict], key: str) -> float | None:
    values = numeric_values(records, key)
    return rounded(values[-1] - values[0]) if len(values) >= 2 else None


def wind_direction_shift(records: list[dict]) -> int | None:
    values = numeric_values(records, "windDirectionDegrees")
    if len(values) < 2:
        return None
    delta = abs(((values[-1] - values[0]) % 360 + 540) % 360 - 180)
    return round(delta)


def trend_label(delta: float | None, unit: str, threshold: float = 1) -> str:
    if delta is None:
        return ""
    if abs(delta) < threshold:
        return f"steady {unit}"
    return f"{'rising' if delta > 0 else 'falling'} {unit}"


def trip_weather_trend(records: list[dict]) -> dict:
    pressure_delta = numeric_delta(records, "pressureHpa")
    temperature_delta = numeric_delta(records, "temperatureC")
    wind_delta = numeric_delta(records, "windSpeedMph")
    cloud_delta = numeric_delta(records, "cloudCoverPercent")
    wind_shift = wind_direction_shift(records)
    return {
        "pressureDeltaHpa": pressure_delta,
        "temperatureDeltaC": temperature_delta,
        "windSpeedDeltaMph": wind_delta,
        "cloudCoverDeltaPercent": cloud_delta,
        "windDirectionShiftDegrees": wind_shift,
        "pressureTrend": trend_label(pressure_delta, "pressure", 1.5),
        "temperatureTrend": trend_label(temperature_delta, "temp", 2),
        "windTrend": trend_label(wind_delta, "wind", 2),
        "cloudTrend": trend_label(cloud_delta, "clouds", 15),
    }


def front_tag_from_trend(trend: dict) -> str:
    pressure = trend.get("pressureDeltaHpa")
    wind_shift = trend.get("windDirectionShiftDegrees")
    clouds = trend.get("cloudCoverDeltaPercent")
    wind = trend.get("windSpeedDeltaMph")
    if isinstance(pressure, (int, float)) and pressure <= -2 and (
        (isinstance(wind_shift, (int, float)) and wind_shift >= 45)
        or (isinstance(clouds, (int, float)) and clouds >= 20)
        or (isinstance(wind, (int, float)) and wind >= 4)
    ):
        return "Front moving in"
    if isinstance(pressure, (int, float)) and pressure >= 2 and (
        (isinstance(clouds, (int, float)) and clouds <= -15)
        or (isinstance(wind, (int, float)) and wind <= -3)
    ):
        return "Post-front clearing"
    if isinstance(pressure, (int, float)) and abs(pressure) < 1.5 and (not isinstance(wind_shift, (int, float)) or wind_shift < 35):
        return "Stable"
    return "Unsettled"


def nearest_hourly_record(records: list[dict], trip: dict, catch_time: str) -> dict | None:
    if not catch_time:
        return None
    trip_date = str(trip.get("date") or "")
    date_key = trip_date
    if str(trip.get("startTime") or "") and str(trip.get("endTime") or "") and trip_end_date(trip) != trip_date:
        try:
            catch_hour, catch_minute = [int(part) for part in catch_time.split(":")[:2]]
            start_hour, start_minute = [int(part) for part in str(trip.get("startTime")).split(":")[:2]]
            if (catch_hour * 60 + catch_minute) < (start_hour * 60 + start_minute):
                date_key = trip_end_date(trip)
        except ValueError:
            pass
    target = f"{date_key}T{catch_time}"
    if not records:
        return None
    return min(records, key=lambda record: abs(time_text_minutes(str(record.get("time") or "")) - time_text_minutes(target)))


def time_text_minutes(value: str) -> int:
    try:
        date_part, time_part = value.split("T", 1)
        hour, minute = [int(part) for part in time_part.split(":")[:2]]
        from datetime import date
        ordinal = date.fromisoformat(date_part).toordinal()
        return ordinal * 1440 + hour * 60 + minute
    except (ValueError, AttributeError):
        return 0


def weather_units(bundle: dict) -> dict:
    units = {}
    units.update(bundle.get("hourly_units") or {})
    units.update(bundle.get("daily_units") or {})
    return units


def wind_direction_label(degrees: object) -> str:
    try:
        value = float(degrees)
    except (TypeError, ValueError):
        return ""
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return directions[round((value % 360) / 45) % len(directions)]


def weather_wind_text(weather_data: dict) -> str:
    trip_window = weather_data.get("tripWindow") or {}
    daily = weather_data.get("daily") or {}
    wind = trip_window.get("windSpeedMph")
    gust = trip_window.get("windGustMph")
    direction = trip_window.get("windDirectionDegrees")
    if wind is None:
        wind = daily.get("windSpeedMaxMph")
        gust = daily.get("windGustMaxMph")
        direction = daily.get("windDirectionDegrees")
    if wind is None:
        return ""
    direction_text = wind_direction_label(direction)
    gust_text = f", gust {round(float(gust))} mph" if isinstance(gust, (int, float)) else ""
    return f"{direction_text + ' ' if direction_text else ''}{round(float(wind))} mph{gust_text}"


def enrich_trip_weather_backend(logbook: dict, trip: dict, weather_cache: dict, astronomy_cache: dict, marine_cache: dict) -> tuple[dict, str]:
    source = weather_source_for_trip(logbook, trip)
    if not trip.get("date") or not source:
        trip["weatherData"] = {
            "status": "missing-date" if source else "missing-coordinates",
            "updatedAt": now_iso(),
        }
        return trip, "skipped"

    end_date = trip_end_date(trip) or trip["date"]
    bundle = admin_weather_bundle(source["coordinates"], trip["date"], end_date, weather_cache)
    hourly = hourly_records(bundle)
    window_records = trip_window_hours(trip, hourly)
    trend = trip_weather_trend(window_records)
    pressure_rate = barometric_trend_rate(hourly)
    trip_window = {
        **trip_window_summary(window_records),
        "pressureTrendRateHpa3h": pressure_rate,
        "pressureTrendRateLabel": barometric_trend_rate_label(pressure_rate),
    }
    marine_bundle = admin_marine_bundle(source["coordinates"], trip["date"], end_date, marine_cache)
    marine_all = marine_records(marine_bundle)
    marine_hourly = trip_window_hours(trip, marine_all)
    marine = {
        "source": source,
        "timezone": (marine_bundle or {}).get("timezone") or "",
        "units": (marine_bundle or {}).get("hourly_units") or {},
        "hourly": marine_hourly,
        **marine_window_summary(marine_all, trip),
    } if marine_bundle else {
        "status": "unavailable",
        "message": "Marine data unavailable",
        "marineDataAvailable": False,
        "waveHeightM": None,
        "waveHeightMaxM": None,
        "waveDirectionDegrees": None,
        "wavePeriodSeconds": None,
        "waveTime": "",
    }
    weather_data = {
        "source": source,
        "fetchedAt": now_iso(),
        "timezone": bundle.get("timezone") or "",
        "units": weather_units(bundle),
        "daily": daily_record(bundle),
        "hourly": window_records,
        "tripWindow": trip_window,
        "trend": trend,
        "marine": marine,
        "sunMoon": admin_astronomy_bundle(source["coordinates"], trip["date"], bundle.get("timezone") or "", astronomy_cache),
    }
    weather_data["frontTag"] = front_tag_from_trend(trend)

    updated_catches = []
    for catch in trip.get("catches", []):
        if not isinstance(catch, dict) or not catch.get("time"):
            updated_catches.append(catch)
            continue
        catch_source = source
        coordinates = catch.get("coordinates")
        if isinstance(coordinates, dict) and coordinates.get("latitude") is not None and coordinates.get("longitude") is not None:
            try:
                latitude = float(coordinates["latitude"])
                longitude = float(coordinates["longitude"])
                if -90 <= latitude <= 90 and -180 <= longitude <= 180 and (latitude != 0 or longitude != 0):
                    catch_source = {"type": "catch", "name": "Catch GPS", "coordinates": {"latitude": latitude, "longitude": longitude}}
            except (TypeError, ValueError):
                pass
        catch_bundle = bundle if catch_source == source else admin_weather_bundle(catch_source["coordinates"], trip["date"], end_date, weather_cache)
        nearest = nearest_hourly_record(hourly_records(catch_bundle), trip, str(catch.get("time") or ""))
        if nearest:
            catch = {
                **catch,
                "weatherData": {
                    "source": catch_source,
                    "fetchedAt": now_iso(),
                    "timezone": catch_bundle.get("timezone") or "",
                    "units": weather_units(catch_bundle),
                    "hourly": nearest,
                },
            }
        updated_catches.append(catch)

    trip["weatherData"] = weather_data
    if not str(trip.get("waveHeight") or "").strip():
        if marine.get("marineDataAvailable") and marine.get("waveHeightM") is not None:
            wave_height_feet = meters_to_feet(marine["waveHeightM"])
            trip["waveHeight"] = f"{wave_height_feet} ft" if wave_height_feet is not None else ""
        else:
            trip["waveHeight"] = ""
    trip["wind"] = weather_wind_text(weather_data)
    trip["catches"] = updated_catches
    return trip, "refreshed"


def now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def refresh_all_trip_weather() -> dict:
    logbook = read_logbook()
    weather_cache: dict = {}
    astronomy_cache: dict = {}
    marine_cache: dict = {}
    results = []
    refreshed = 0
    skipped = 0
    failed = 0
    updated_trips = []
    for trip in logbook.get("trips", []):
        if not isinstance(trip, dict):
            updated_trips.append(trip)
            continue
        label = trip.get("title") or trip.get("location") or trip.get("date") or trip.get("id") or "Trip"
        try:
            updated_trip, status = enrich_trip_weather_backend(logbook, deepcopy(trip), weather_cache, astronomy_cache, marine_cache)
            updated_trips.append(updated_trip)
            if status == "refreshed":
                refreshed += 1
            else:
                skipped += 1
            results.append({"tripId": trip.get("id"), "name": label, "status": status})
        except Exception as error:  # Keep the batch moving if one API call fails.
            failed += 1
            trip["weatherData"] = {
                **(trip.get("weatherData") or {}),
                "status": "error",
                "message": str(error) or "Could not fetch weather.",
                "updatedAt": now_iso(),
            }
            updated_trips.append(trip)
            results.append({"tripId": trip.get("id"), "name": label, "status": "error", "message": str(error)})
    logbook["trips"] = updated_trips
    write_logbook(logbook)
    return {
        "ok": True,
        "refreshed": refreshed,
        "skipped": skipped,
        "failed": failed,
        "total": len(updated_trips),
        "results": results,
    }


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)

    @app.after_request
    def add_no_store_header(response: Response) -> Response:
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/logbook")
    def get_logbook() -> Response:
        return jsonify(read_logbook())

    @app.put("/api/logbook")
    def update_logbook() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True)
        is_valid, error = validate_logbook(payload)
        if not is_valid:
            return jsonify({"error": error}), 400

        write_logbook(normalize_logbook(payload))
        return jsonify({"ok": True})

    @app.get("/api/weather/archive")
    def weather_archive() -> tuple[Response, int]:
        payload, status = weather_archive_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/weather/forecast")
    def weather_forecast() -> tuple[Response, int]:
        payload, status = weather_forecast_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/weather/marine")
    def marine_weather() -> tuple[Response, int]:
        payload, status = marine_weather_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/astronomy")
    def astronomy() -> tuple[Response, int]:
        payload, status = astronomy_payload(request.args)
        return jsonify(payload), status

    @app.post("/api/uploads/<category>")
    def upload_photo(category: str) -> tuple[Response, int] | Response:
        upload_category_path(category)
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return jsonify({"error": "No file uploaded"}), 400

        filename = secure_filename(upload.filename) or "upload.jpg"
        suffix = Path(filename).suffix.lower() or ".jpg"
        media_type = upload_media_type(upload.mimetype or "", suffix)
        if not media_type or suffix not in ALLOWED_MEDIA_EXTENSIONS:
            return jsonify({"error": "Only photo and video uploads are supported"}), 400

        stored_name = f"{uuid.uuid4().hex}{suffix}"
        destination = upload_category_path(category) / stored_name
        upload.save(destination)
        preview_filename = create_upload_preview(category, stored_name) if media_type == "image" else ""
        metadata = request.form.get("metadata")
        try:
            metadata_payload = json.loads(metadata) if metadata else {}
        except json.JSONDecodeError:
            metadata_payload = {}
        metadata_payload = {
            **metadata_payload,
            "name": filename,
            "mimeType": upload.mimetype,
            "mediaType": media_type,
            "previewFilename": preview_filename,
        }
        write_upload_metadata(category, stored_name, metadata_payload)

        return jsonify(upload_payload(category, stored_name, metadata_payload))

    @app.get("/api/photo-queue")
    def list_photo_queue() -> Response:
        queue_dir = upload_category_path("queue")
        items = []
        for file_path in queue_dir.iterdir():
            if not file_path.is_file() or file_path.suffix == ".json":
                continue
            metadata = read_upload_metadata("queue", file_path.name)
            items.append({
                **upload_payload("queue", file_path.name, metadata),
                "modified": file_path.stat().st_mtime,
            })
        items.sort(key=lambda item: item["modified"], reverse=True)
        return jsonify({"photos": items})

    @app.get("/api/gallery")
    def list_gallery() -> Response:
        category = request.args.get("category", "all")
        categories = sorted(UPLOAD_CATEGORIES) if category == "all" else [category]
        if any(item not in UPLOAD_CATEGORIES for item in categories):
            return jsonify({"error": "Invalid upload category"}), 400
        items = []
        for item_category in categories:
            items.extend(upload_gallery_items(item_category))
        items.sort(key=lambda item: item["modified"], reverse=True)
        return jsonify({"media": items})

    @app.get("/api/orphaned-media")
    def list_orphaned_media() -> Response:
        return jsonify({"media": orphaned_upload_items()})

    @app.delete("/api/uploads/<category>/<filename>")
    def delete_upload(category: str, filename: str) -> tuple[Response, int] | Response:
        if category not in UPLOAD_CATEGORIES or category == "queue":
            return jsonify({"error": "Invalid upload category"}), 400
        safe_name = secure_filename(filename)
        media_path = upload_category_path(category) / safe_name
        if not safe_name or not media_path.exists() or not media_path.is_file():
            return jsonify({"error": "Upload not found"}), 404
        if (category, safe_name) in referenced_uploads(read_logbook()):
            return jsonify({"error": "This upload is still attached to the logbook"}), 409

        delete_upload_file(category, safe_name)
        return jsonify({"ok": True})

    @app.post("/api/photo-queue/claim")
    def claim_photo_queue_item() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True) or {}
        filename = secure_filename(str(payload.get("filename", "")))
        target_category = str(payload.get("targetCategory", ""))
        if target_category not in UPLOAD_CATEGORIES or target_category == "queue":
            return jsonify({"error": "Invalid target category"}), 400
        source = upload_category_path("queue") / filename
        if not filename or not source.exists() or not source.is_file():
            return jsonify({"error": "Queued photo not found"}), 404

        suffix = source.suffix.lower() or ".jpg"
        target_name = f"{uuid.uuid4().hex}{suffix}"
        destination = upload_category_path(target_category) / target_name
        source.replace(destination)

        metadata = read_upload_metadata("queue", filename)
        media_type = metadata.get("mediaType") or upload_media_type(metadata.get("mimeType", ""), suffix)
        preview_filename = metadata.get("previewFilename") or ""
        if preview_filename:
            source_preview = upload_preview_path("queue", filename)
            target_preview = upload_preview_path(target_category, target_name)
            if source_preview.exists():
                source_preview.replace(target_preview)
                preview_filename = target_preview.name
            else:
                preview_filename = create_upload_preview(target_category, target_name)
        else:
            preview_filename = create_upload_preview(target_category, target_name) if media_type == "image" else ""
        metadata["mediaType"] = media_type or "image"
        metadata["previewFilename"] = preview_filename
        source_metadata = upload_metadata_path("queue", filename)
        if source_metadata.exists():
            source_metadata.unlink()
        write_upload_metadata(target_category, target_name, metadata)
        return jsonify(upload_payload(target_category, target_name, metadata))

    @app.delete("/api/photo-queue/<filename>")
    def delete_photo_queue_item(filename: str) -> Response:
        safe_name = secure_filename(filename)
        photo = upload_category_path("queue") / safe_name
        metadata = upload_metadata_path("queue", safe_name)
        preview = upload_preview_path("queue", safe_name)
        if photo.exists() and photo.is_file():
            photo.unlink()
        if metadata.exists():
            metadata.unlink()
        if preview.exists():
            preview.unlink()
        return jsonify({"ok": True})

    @app.get("/uploads/<category>/_previews/<filename>")
    def uploaded_preview_file(category: str, filename: str) -> Response:
        return send_from_directory(upload_category_path(category) / PREVIEW_DIRNAME, filename)

    @app.get("/uploads/<category>/<filename>")
    def uploaded_file(category: str, filename: str) -> Response:
        return send_from_directory(upload_category_path(category), filename)

    @app.get("/api/export")
    def export_logbook() -> Response:
        body = json.dumps(read_logbook(), indent=2)
        return Response(
            body,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment; filename=fishing-logbook.json"},
        )

    @app.get("/favicon.ico")
    def favicon() -> tuple[str, int]:
        return "", 204

    @app.get("/")
    def index() -> Response:
        return send_file(ROOT / "index.html")

    @app.get("/<path:filename>")
    def static_files(filename: str) -> Response:
        requested = (ROOT / filename).resolve()
        if ROOT not in requested.parents or not requested.is_file():
            abort(404)
        return send_from_directory(ROOT, filename)

    return app


app = create_app()


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        write_logbook(DEFAULT_LOGBOOK)

    print(f"Fishing Logbook running at http://{HOST}:{PORT}")
    print(f"Data file: {DATA_FILE}")
    app.run(host=HOST, port=PORT, threaded=True)


if __name__ == "__main__":
    main()
