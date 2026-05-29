from __future__ import annotations

import json
import math
from copy import deepcopy
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend_config import (
    ASTRONOMY_QUERY_KEYS,
    DEFAULT_UNITS,
    MARINE_HOURLY_FIELDS,
    MARINE_QUERY_KEYS,
    OPEN_METEO_ARCHIVE_URL,
    OPEN_METEO_FORECAST_URL,
    OPEN_METEO_MARINE_URL,
    SUNRISE_SUNSET_URL,
    WEATHER_DAILY_FIELDS,
    WEATHER_HOURLY_FIELDS,
    WEATHER_QUERY_KEYS,
)
from logbook_store import normalize_logbook, read_logbook, write_logbook


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


def unit_symbol(units: dict | None, key: str) -> str:
    value = (units or {}).get(key) or DEFAULT_UNITS.get(key, "")
    if value in ("C", "F"):
        return f"°{value}"
    return value


def convert_unit_value(value: object, from_unit: str, to_unit: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if from_unit == to_unit:
        return number
    conversions = {
        ("C", "F"): lambda item: (item * 9 / 5) + 32,
        ("F", "C"): lambda item: (item - 32) * 5 / 9,
        ("mph", "kph"): lambda item: item * 1.609344,
        ("mph", "kn"): lambda item: item * 0.868976,
        ("m", "ft"): lambda item: item * 3.28084,
        ("ft", "m"): lambda item: item / 3.28084,
    }
    fn = conversions.get((from_unit, to_unit))
    return fn(number) if fn else number


def format_unit_value(value: object, units: dict | None, key: str, from_unit: str, digits: int = 0) -> str:
    to_unit = (units or {}).get(key) or DEFAULT_UNITS.get(key, from_unit)
    converted = convert_unit_value(value, from_unit, to_unit)
    if converted is None:
        return ""
    rounded_value = round(converted, digits)
    text = str(int(rounded_value)) if float(rounded_value).is_integer() else str(rounded_value)
    return f"{text} {unit_symbol(units, key)}"


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


def weather_wind_text(weather_data: dict, units: dict | None = None) -> str:
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
    gust_text = f", gust {format_unit_value(gust, units, 'windSpeed', 'mph')}" if isinstance(gust, (int, float)) else ""
    return f"{direction_text + ' ' if direction_text else ''}{format_unit_value(wind, units, 'windSpeed', 'mph')}{gust_text}"


def enrich_trip_weather_backend(logbook: dict, trip: dict, weather_cache: dict, astronomy_cache: dict, marine_cache: dict) -> tuple[dict, str]:
    units = normalize_logbook(logbook).get("settings", {}).get("units", {})
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
            trip["waveHeight"] = format_unit_value(marine["waveHeightM"], units, "waveHeight", "m", 1)
        else:
            trip["waveHeight"] = ""
    trip["wind"] = weather_wind_text(weather_data, units)
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


