from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
from copy import deepcopy
from threading import Lock, Thread
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .backend_config import GREAT_LAKES_BATHYMETRY_URL
from .logbook_store import read_logbook, write_logbook

DEPTH_SOURCE = "Great Lakes Bathymetry ArcGIS"
DEPTH_OFFSET_FEET = 7.5
FEET_PER_METER = 3.28084
SEARCH_DISTANCES_METERS = (500, 1000, 2000)
logger = logging.getLogger(__name__)

_CACHE_LOCK = Lock()
_BATHYMETRY_CACHE: dict[tuple[str, str], dict] = {}


def rounded_coordinate_key(latitude: float, longitude: float) -> tuple[str, str]:
    return (f"{latitude:.5f}", f"{longitude:.5f}")


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


def lookup_depth(latitude: float, longitude: float) -> dict | None:
    key = rounded_coordinate_key(latitude, longitude)
    with _CACHE_LOCK:
        cached = _BATHYMETRY_CACHE.get(key)
    if cached is not None:
        return deepcopy(cached)

    for distance_meters in SEARCH_DISTANCES_METERS:
        features = query_bathymetry_features(latitude, longitude, distance_meters)
        nearest = nearest_bathymetry_feature(latitude, longitude, features)
        if nearest is None:
            continue
        depth_m, depth_ft = corrected_bathymetry_depths(
            nearest.get("attributes", {}).get("depth_ft"),
            nearest.get("attributes", {}).get("depth_m"),
        )
        result = {
            "depth_m": depth_m,
            "depth_ft": depth_ft,
            "lake_name": nearest.get("attributes", {}).get("Lake"),
            "depth_source": DEPTH_SOURCE,
        }
        with _CACHE_LOCK:
            _BATHYMETRY_CACHE[key] = deepcopy(result)
        return result
    return None


def finite_float(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def signed_depth(value: float, magnitude: float) -> float:
    return math.copysign(magnitude, value) if value != 0 else magnitude


def corrected_bathymetry_depths(depth_ft: object, depth_m: object) -> tuple[float | None, float | None]:
    feet = finite_float(depth_ft)
    meters = finite_float(depth_m)
    if feet not in (None, 0):
        corrected_feet = signed_depth(feet, abs(feet) + DEPTH_OFFSET_FEET)
        meter_sign_source = meters if meters not in (None, 0) else feet
        corrected_meters = signed_depth(meter_sign_source, abs(corrected_feet) / FEET_PER_METER)
        return round(corrected_meters, 3), round(corrected_feet, 3)
    if meters not in (None, 0):
        corrected_feet_magnitude = abs(meters) * FEET_PER_METER + DEPTH_OFFSET_FEET
        corrected_feet = signed_depth(meters, corrected_feet_magnitude)
        corrected_meters = signed_depth(meters, corrected_feet_magnitude / FEET_PER_METER)
        return round(corrected_meters, 3), round(corrected_feet, 3)
    return None, None


def query_bathymetry_features(latitude: float, longitude: float, distance_meters: int) -> list[dict]:
    params = {
        "where": "1=1",
        "geometry": f"{longitude},{latitude}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": str(distance_meters),
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
        return read_json_url_with_curl(url)


def read_json_url_with_curl(url: str) -> dict:
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if not curl:
        raise RuntimeError("Bathymetry service unavailable")
    try:
        completed = subprocess.run(
            [
                curl,
                "-fsSL",
                "--max-time",
                "10",
                "-H",
                "User-Agent: FishingLogbook/1.0 (+https://edumaps.esri.ca/)",
                "-H",
                "Accept: application/json",
                url,
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=12,
        )
        return json.loads(completed.stdout)
    except subprocess.CalledProcessError as error:
        raise RuntimeError("Bathymetry service unavailable") from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("Bathymetry service unavailable") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("Bathymetry service returned invalid JSON") from error


def nearest_bathymetry_feature(latitude: float, longitude: float, features: list[dict]) -> dict | None:
    candidates = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        distance = feature_distance_meters(latitude, longitude, feature.get("geometry"))
        if distance is not None:
            candidates.append((distance, feature))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def feature_distance_meters(latitude: float, longitude: float, geometry: object) -> float | None:
    if not isinstance(geometry, dict):
        return None
    if "x" in geometry and "y" in geometry:
        return haversine_meters(latitude, longitude, geometry.get("y"), geometry.get("x"))

    distances = []
    for line in geometry_lines(geometry):
        if len(line) == 1:
            distances.append(haversine_meters(latitude, longitude, line[0][1], line[0][0]))
            continue
        for start, end in zip(line, line[1:]):
            distances.append(point_to_segment_meters(latitude, longitude, start, end))
    return min((item for item in distances if item is not None), default=None)


def geometry_lines(geometry: dict) -> list[list[tuple[float, float]]]:
    raw_lines = []
    if isinstance(geometry.get("paths"), list):
        raw_lines.extend(geometry["paths"])
    if isinstance(geometry.get("rings"), list):
        raw_lines.extend(geometry["rings"])
    if isinstance(geometry.get("points"), list):
        raw_lines.append(geometry["points"])

    lines = []
    for raw_line in raw_lines:
        if not isinstance(raw_line, list):
            continue
        line = []
        for point in raw_line:
            if not isinstance(point, list | tuple) or len(point) < 2:
                continue
            try:
                point_longitude = float(point[0])
                point_latitude = float(point[1])
            except (TypeError, ValueError):
                continue
            if math.isfinite(point_latitude) and math.isfinite(point_longitude):
                line.append((point_longitude, point_latitude))
        if line:
            lines.append(line)
    return lines


def haversine_meters(latitude: float, longitude: float, other_latitude: object, other_longitude: object) -> float | None:
    try:
        lat2 = float(other_latitude)
        lon2 = float(other_longitude)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lat2) or not math.isfinite(lon2):
        return None
    radius = 6371008.8
    lat1_r = math.radians(latitude)
    lat2_r = math.radians(lat2)
    delta_lat = math.radians(lat2 - latitude)
    delta_lon = math.radians(lon2 - longitude)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(delta_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_to_segment_meters(latitude: float, longitude: float, start: tuple[float, float], end: tuple[float, float]) -> float | None:
    lat_scale = 111320.0
    lon_scale = lat_scale * math.cos(math.radians(latitude))
    px, py = 0.0, 0.0
    ax = (start[0] - longitude) * lon_scale
    ay = (start[1] - latitude) * lat_scale
    bx = (end[0] - longitude) * lon_scale
    by = (end[1] - latitude) * lat_scale
    dx = bx - ax
    dy = by - ay
    length_squared = dx * dx + dy * dy
    if length_squared == 0:
        return math.hypot(ax - px, ay - py)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_squared))
    closest_x = ax + t * dx
    closest_y = ay + t * dy
    return math.hypot(closest_x - px, closest_y - py)


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


def enrich_logbook_depths(logbook: dict | None = None) -> dict:
    source = read_logbook() if logbook is None else deepcopy(logbook)
    updated = False
    for trip in source.get("trips", []):
        if not isinstance(trip, dict):
            continue
        for catch in trip_fish_records(trip):
            if not isinstance(catch, dict) or not catch_needs_depth(catch):
                continue
            if has_depth_metadata(catch):
                apply_depth_result(catch, depth_fields(catch))
                updated = True
                continue
            coordinates = valid_coordinates(catch.get("coordinates"))
            if coordinates is None:
                continue
            latitude, longitude = coordinates
            try:
                result = lookup_depth(latitude, longitude)
            except Exception:
                logger.exception("Depth lookup failed for catch %s.", catch.get("id") or "")
                continue
            apply_depth_result(catch, result)
            updated = True
    if logbook is None and updated:
        patch_saved_depths(source)
    return source


def patch_saved_depths(enriched_logbook: dict) -> None:
    current = read_logbook()
    depth_by_catch_id = {}
    for trip in enriched_logbook.get("trips", []):
        if not isinstance(trip, dict):
            continue
        for catch in trip_fish_records(trip):
            if not isinstance(catch, dict) or not catch.get("id"):
                continue
            if any(key in catch for key in ("depth_m", "depth_ft", "lake_name", "depth_source")):
                depth_by_catch_id[str(catch["id"])] = depth_fields(catch)
    if not depth_by_catch_id:
        return

    updated = False
    for trip in current.get("trips", []):
        if not isinstance(trip, dict):
            continue
        for catch in trip_fish_records(trip):
            if not isinstance(catch, dict) or not catch.get("id") or not catch_needs_depth(catch):
                continue
            depth = depth_by_catch_id.get(str(catch["id"]))
            if depth is None:
                continue
            for key, value in depth.items():
                if key == "fowCaught" and str(catch.get("fowCaught") or "").strip():
                    continue
                catch[key] = value
            updated = True
    if updated:
        write_logbook(current)


def schedule_depth_enrichment() -> None:
    thread = Thread(target=_run_depth_enrichment, name="bathymetry-depth-lookup", daemon=True)
    thread.start()


def _run_depth_enrichment() -> None:
    try:
        enrich_logbook_depths()
    except Exception:
        logger.exception("Depth lookup failed after saving catch.")
