from __future__ import annotations

import json
import math
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .backend_config import (
    ASTRONOMY_QUERY_KEYS,
    MARINE_HOURLY_FIELDS,
    MARINE_QUERY_KEYS,
    OPEN_METEO_ARCHIVE_URL,
    OPEN_METEO_FORECAST_URL,
    OPEN_METEO_MARINE_URL,
    SUNRISE_SUNSET_URL,
    WEATHER_QUERY_KEYS,
)


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
