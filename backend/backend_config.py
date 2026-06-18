from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
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
DEFAULT_UNITS = {
    "depth": "m",
    "distance": "km",
    "speed": "kph",
    "windSpeed": "kph",
    "pressure": "hPa",
    "airTemperature": "C",
    "waterTemperature": "F",
    "precipitation": "mm",
    "waveHeight": "m",
    "fishLength": "in",
    "fishWeight": "lb",
}
UNIT_OPTIONS = {
    "depth": {"m", "ft"},
    "distance": {"km", "mi"},
    "speed": {"kph", "mph", "kn"},
    "windSpeed": {"kph", "mph", "kn"},
    "pressure": {"hPa", "kPa", "inHg", "mmHg"},
    "airTemperature": {"C", "F"},
    "waterTemperature": {"C", "F"},
    "precipitation": {"mm", "in"},
    "waveHeight": {"m", "ft"},
    "fishLength": {"in", "cm"},
    "fishWeight": {"lb", "kg"},
}


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
    "waterClarities": [
        "Crystal Clear",
        "Clear",
        "Slightly Stained",
        "Stained",
        "Muddy",
        "Algae Bloom",
    ],
    "weatherTypes": [
        "Sunny",
        "Partly Cloudy",
        "Overcast",
        "Light Rain",
        "Heavy Rain",
        "Thunderstorms",
        "Fog",
        "Snow",
        "Mixed",
    ],
    "reelStyles": ["Baitcaster", "Spinning", "Centerpin", "Fly"],
    "rodTypes": ["Baitcaster", "Spinning", "Downrigging", "Dipsey", "Centerpin", "Fly", "Tipup"],
    "lineTypes": ["Braid", "Mono", "Fluorocarbon", "Leadcore", "Wire", "Copper", "Other"],
    "trollingPresentations": [
        {"value": "downrigger", "label": "Downrigger"},
        {"value": "cheater", "label": "Cheater"},
        {"value": "flatline-leadcore", "label": "Planer Board / Leadcore"},
        {"value": "dipsey-diver", "label": "Dipsey Diver"},
    ],
    "trollingDirections": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    "setupLineSides": [
        {"value": "port", "label": "Port"},
        {"value": "center", "label": "Center"},
        {"value": "starboard", "label": "Starboard"},
    ],
    "lures": [],
    "flashers": [],
    "reels": [],
    "rods": [],
    "rodReelCombos": [],
    "settings": {
        "timeFormat": "24",
        "units": deepcopy(DEFAULT_UNITS),
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

