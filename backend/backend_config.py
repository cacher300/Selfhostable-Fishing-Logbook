"""Static application constants.

Runtime settings (data directory, bind address, secret key, storage backend)
live in :mod:`backend.config`. The ``FISH_*`` cloud values below are read here
only because the frozen cloud client module imports them directly.
"""

from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FISH_STORAGE_BACKEND = os.environ.get("FISH_STORAGE_BACKEND", "local").strip().lower()
FISH_CLOUD_API_URL = os.environ.get("FISH_CLOUD_API_URL", "").strip()
FISH_API_TOKEN = os.environ.get("FISH_API_TOKEN", "")
FISH_API_TOKEN_FILE = os.environ.get("FISH_API_TOKEN_FILE", "").strip()
_SCHEMA_DIR = ROOT / "schema"


def _load_schema_json(name: str) -> object:
    import json

    with (_SCHEMA_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


_SCHEMA_CONSTANTS = _load_schema_json("constants.json")
SCHEMA_CONSTANTS = _SCHEMA_CONSTANTS
UPLOAD_CATEGORIES = set(_SCHEMA_CONSTANTS["uploadCategories"])
ALLOWED_IMAGE_EXTENSIONS = set(_SCHEMA_CONSTANTS["allowedImageExtensions"])
ALLOWED_VIDEO_EXTENSIONS = set(_SCHEMA_CONSTANTS["allowedVideoExtensions"])
ALLOWED_MEDIA_EXTENSIONS = set(_SCHEMA_CONSTANTS["allowedMediaExtensions"])
PREVIEW_DIRNAME = "_previews"
PREVIEW_MAX_SIZE = (1200, 1200)
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
SUNRISE_SUNSET_URL = "https://api.sunrisesunset.io/json"
GREAT_LAKES_BATHYMETRY_URL = "https://edumaps.esri.ca/arcgis/rest/services/MapServices/GreatLakesBathymetry/MapServer/0/query"
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
MARINE_HOURLY_FIELDS = ["wave_height", "wave_direction", "wave_period"]
BATHYMETRY_LAKES = tuple(_SCHEMA_CONSTANTS["bathymetryLakes"])
UNIT_OPTIONS = {key: set(values) for key, values in _SCHEMA_CONSTANTS["unitOptions"].items()}
DEFAULT_LOGBOOK = _load_schema_json("default-logbook.json")
