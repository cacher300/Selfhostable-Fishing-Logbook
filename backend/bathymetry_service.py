from __future__ import annotations

import json
import math
import subprocess
from copy import deepcopy
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .backend_config import GREAT_LAKES_BATHYMETRY_URL

DEPTH_SOURCE = "Great Lakes Bathymetry ArcGIS"
BASE_DEPTH_OFFSET_FEET = 0
FEET_PER_METER = 3.28084
LOOKUP_DISTANCE_METERS = 100
SHALLOW_FOW_FEET = 30
OFFSHORE_FOW_FEET = 80


def valid_coordinates(coordinates: object) -> tuple[float, float] | None:
    if not isinstance(coordinates, dict):
        return None
    try:
        latitude = float(coordinates.get("latitude"))
        longitude = float(coordinates.get("longitude"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return None
    if latitude == 0 and longitude == 0:
        return None
    return latitude, longitude


def lookup_depth(latitude: float, longitude: float, lake_calibrations_feet: object = None) -> dict | None:
    features = query_bathymetry_features(latitude, longitude)
    nearest = nearest_bathymetry_feature(latitude, longitude, features)
    if nearest is None:
        return None
    attributes = nearest.get("attributes", {})
    depth_m, depth_ft = corrected_bathymetry_depths(
        attributes.get("depth_ft"),
        attributes.get("depth_m"),
        lake_depth_offset_feet(
            attributes.get("Lake"),
            attributes.get("depth_ft"),
            attributes.get("depth_m"),
            lake_calibrations_feet,
        ),
    )
    return {
        "depth_m": depth_m,
        "depth_ft": depth_ft,
        "lake_name": attributes.get("Lake"),
        "depth_source": DEPTH_SOURCE,
    }


def finite_float(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def signed_depth(value: float, magnitude: float) -> float:
    return math.copysign(magnitude, value) if value != 0 else magnitude


def lake_depth_offset_feet(lake_name: object, depth_ft: object, depth_m: object, lake_calibrations_feet: object = None) -> float:
    calibration = lake_calibrations_feet.get(str(lake_name or "")) if isinstance(lake_calibrations_feet, dict) else None
    if isinstance(calibration, dict):
        offshore_offset = finite_float(calibration.get("offshoreOffsetFeet")) or 0
    else:
        offshore_offset = finite_float(calibration) or 0
    raw_depth_feet = abs(finite_float(depth_ft) or ((finite_float(depth_m) or 0) * FEET_PER_METER))
    progress = max(0, min(1, (raw_depth_feet - SHALLOW_FOW_FEET) / (OFFSHORE_FOW_FEET - SHALLOW_FOW_FEET)))
    return BASE_DEPTH_OFFSET_FEET + offshore_offset * progress


def corrected_bathymetry_depths(depth_ft: object, depth_m: object, offset_feet: object = 0) -> tuple[float | None, float | None]:
    feet = finite_float(depth_ft)
    meters = finite_float(depth_m)
    offset_feet = finite_float(offset_feet) or 0
    if feet not in (None, 0):
        corrected_feet = signed_depth(feet, max(0, abs(feet) + offset_feet))
        meter_sign_source = meters if meters not in (None, 0) else feet
        corrected_meters = signed_depth(meter_sign_source, abs(corrected_feet) / FEET_PER_METER)
        return round(corrected_meters, 3), round(corrected_feet, 3)
    if meters not in (None, 0):
        corrected_feet_magnitude = max(0, abs(meters) * FEET_PER_METER + offset_feet)
        corrected_feet = signed_depth(meters, corrected_feet_magnitude)
        corrected_meters = signed_depth(meters, corrected_feet_magnitude / FEET_PER_METER)
        return round(corrected_meters, 3), round(corrected_feet, 3)
    return None, None


def query_bathymetry_features(latitude: float, longitude: float) -> list[dict]:
    params = {
        "where": "1=1",
        "geometry": f"{longitude},{latitude}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": str(LOOKUP_DISTANCE_METERS),
        "units": "esriSRUnit_Meter",
        "outFields": "Lake,depth_m,depth_ft",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    url = f"{GREAT_LAKES_BATHYMETRY_URL}?{urlencode(params)}"
    payload = read_json_url(url)

    if payload.get("error"):
        message = payload["error"].get("message") if isinstance(payload["error"], dict) else payload["error"]
        raise RuntimeError(str(message or "Bathymetry service error"))
    features = payload.get("features")
    return features if isinstance(features, list) else []


def read_json_url(url: str) -> dict:
    request_headers = {"User-Agent": "FishingLogbook/1.0 (+https://edumaps.esri.ca/)"}
    try:
        with urlopen(Request(url, headers=request_headers), timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError(f"Bathymetry service returned HTTP {error.code}") from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError("Bathymetry service returned invalid JSON") from error
    except (URLError, TimeoutError, OSError):
        try:
            response = subprocess.run(
                ["curl", "-fsSL", "--max-time", "10", url],
                capture_output=True,
                check=True,
                text=True,
                timeout=12,
            )
            return json.loads(response.stdout)
        except (FileNotFoundError, subprocess.SubprocessError, json.JSONDecodeError) as error:
            raise RuntimeError("Bathymetry service unavailable") from error


def nearest_bathymetry_feature(latitude: float, longitude: float, features: list[dict]) -> dict | None:
    nearest_feature = None
    nearest_distance = None
    for feature in features:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry", {})
        if "x" in geometry and "y" in geometry:
            distance = point_to_segment_meters(latitude, longitude, (geometry["x"], geometry["y"]), (geometry["x"], geometry["y"]))
            if distance is not None and (nearest_distance is None or distance < nearest_distance):
                nearest_feature, nearest_distance = feature, distance
            continue
        for path in geometry.get("paths", []):
            for start, end in zip(path, path[1:]):
                distance = point_to_segment_meters(latitude, longitude, start, end)
                if distance is not None and (nearest_distance is None or distance < nearest_distance):
                    nearest_feature, nearest_distance = feature, distance
    return nearest_feature


def point_to_segment_meters(latitude: float, longitude: float, start: object, end: object) -> float | None:
    if not isinstance(start, list | tuple) or not isinstance(end, list | tuple) or len(start) < 2 or len(end) < 2:
        return None
    try:
        lon_scale = 111320.0 * math.cos(math.radians(latitude))
        ax, ay = (float(start[0]) - longitude) * lon_scale, (float(start[1]) - latitude) * 111320.0
        bx, by = (float(end[0]) - longitude) * lon_scale, (float(end[1]) - latitude) * 111320.0
    except (TypeError, ValueError):
        return None
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    if not length_squared:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, -(ax * dx + ay * dy) / length_squared))
    return math.hypot(ax + t * dx, ay + t * dy)


def catch_needs_depth(catch: dict) -> bool:
    missing_fow = not str(catch.get("fowCaught") or "").strip()
    has_fow_source = bool(format_fow_value(catch.get("depth_ft"), catch.get("depth_m")))
    return not has_depth_metadata(catch) or (missing_fow and has_fow_source)


def has_depth_metadata(catch: dict) -> bool:
    return all(key in catch and catch.get(key) is not None for key in ("depth_m", "depth_ft", "lake_name", "depth_source"))


def format_fow_value(depth_ft: object, depth_m: object = None) -> str:
    if depth_ft is None and depth_m is None:
        return ""
    try:
        value = abs(float(depth_ft))
    except (TypeError, ValueError):
        value = 0
    if value == 0 and depth_m is not None:
        try:
            value = abs(float(depth_m)) * 3.28084
        except (TypeError, ValueError):
            return "0" if depth_ft in (0, "0", 0.0) else ""
    if not math.isfinite(value):
        return ""
    rounded = round(value, 1)
    return str(int(rounded)) if rounded.is_integer() else str(rounded)


def apply_depth_result(catch: dict, result: dict | None) -> None:
    catch.update(result or depth_null_payload())
    if not str(catch.get("fowCaught") or "").strip():
        fow = format_fow_value(catch.get("depth_ft"), catch.get("depth_m"))
        if fow:
            catch["fowCaught"] = fow


def depth_fields(catch: dict) -> dict:
    return {
        "depth_m": catch.get("depth_m"),
        "depth_ft": catch.get("depth_ft"),
        "lake_name": catch.get("lake_name"),
        "depth_source": catch.get("depth_source"),
        "fowCaught": catch.get("fowCaught"),
    }


def trip_fish_records(trip: dict) -> list:
    return [
        fish
        for key in ("catches", "lostFish")
        for fish in (trip.get(key) if isinstance(trip.get(key), list) else [])
    ]


def preserve_existing_depth_fields(incoming_logbook: dict, existing_logbook: dict) -> dict:
    depth_by_catch_id = {}
    for trip in existing_logbook.get("trips", []):
        if not isinstance(trip, dict):
            continue
        for catch in trip_fish_records(trip):
            if not isinstance(catch, dict) or not catch.get("id") or not has_depth_metadata(catch):
                continue
            depth_by_catch_id[str(catch["id"])] = depth_fields(catch)

    for trip in incoming_logbook.get("trips", []):
        if not isinstance(trip, dict):
            continue
        for catch in trip_fish_records(trip):
            if not isinstance(catch, dict) or not catch.get("id") or not catch_needs_depth(catch):
                continue
            existing_depth = depth_by_catch_id.get(str(catch["id"]))
            if existing_depth is not None:
                for key, value in existing_depth.items():
                    if key == "fowCaught" and str(catch.get("fowCaught") or "").strip():
                        continue
                    catch[key] = value
    return incoming_logbook


def depth_null_payload() -> dict:
    return {
        "depth_m": None,
        "depth_ft": None,
        "lake_name": None,
        "depth_source": None,
    }
