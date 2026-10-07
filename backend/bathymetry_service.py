from __future__ import annotations

import gzip
import json
import math
import ssl
import threading
import subprocess
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from array import array
from pathlib import Path

from .backend_config import GREAT_LAKES_BATHYMETRY_URL

DEPTH_SOURCE = "Great Lakes Bathymetry ArcGIS"
LOCAL_DEPTH_SOURCE = "NOAA Great Lakes bathymetry contours"
MODEL_DEPTH_SOURCE = "NOAA Great Lakes model bathymetry"
BASE_DEPTH_OFFSET_FEET = 0
FEET_PER_METER = 3.28084
# Bathymetry contours are comparatively sparse in some nearshore areas. A
# wider server-side search preserves a useful nearest-contour lookup there.
LOOKUP_DISTANCE_METERS = 500
SHALLOW_FOW_FEET = 30
OFFSHORE_FOW_FEET = 80
# edumaps.esri.ca only negotiates TLS 1.2 with RSA key exchange
# (AES256-GCM-SHA384). OpenSSL 3.5+ (Python 3.14) no longer offers those
# ciphers by default, so the server drops the handshake. Allow just these two
# for this host; certificate and hostname verification stay on.
BATHYMETRY_EXTRA_CIPHERS = "AES256-GCM-SHA384:AES128-GCM-SHA256"
LOCAL_CONTOUR_LAKES = ("erie", "huron", "michigan", "ontario", "superior")
LOCAL_CONTOUR_DIR = Path(__file__).resolve().parents[1] / "static" / "data"
LOCAL_CONTOUR_BUCKET_DEGREES = 0.01
LOCAL_CONTOUR_INDEX_STEP_METERS = 200.0
_LOCAL_INDEX_CHUNK_CHARS = 64 * 1024
_LOCAL_CONTOUR_CACHE = {}
_LOCAL_CONTOUR_CACHE_LOCK = threading.Lock()
_LOCAL_CONTOUR_LOAD_LOCKS = {lake: threading.Lock() for lake in LOCAL_CONTOUR_LAKES}
_LOCAL_LAKE_BOUNDS = None


def bathymetry_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    default_ciphers = ":".join(cipher["name"] for cipher in context.get_ciphers() if cipher.get("protocol") != "TLSv1.3")
    context.set_ciphers(f"{default_ciphers}:{BATHYMETRY_EXTRA_CIPHERS}" if default_ciphers else BATHYMETRY_EXTRA_CIPHERS)
    return context


_SSL_CONTEXT = bathymetry_ssl_context()


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


def nearest_local_contour(latitude: float, longitude: float) -> tuple[float, str] | None:
    """Find the nearest bundled NOAA depth contour within the existing search radius."""
    best_distance = LOOKUP_DISTANCE_METERS
    best = None
    for lake in _candidate_contour_lakes(latitude, longitude):
        index = _local_contour_index(lake)
        if index is None:
            continue
        segments, buckets = index
        row = math.floor(latitude / LOCAL_CONTOUR_BUCKET_DEGREES)
        column = math.floor(longitude / LOCAL_CONTOUR_BUCKET_DEGREES)
        visited = set()
        for bucket_row in range(row - 1, row + 2):
            for bucket_column in range(column - 1, column + 2):
                for segment_id in buckets.get((bucket_row, bucket_column), ()):
                    if segment_id in visited:
                        continue
                    visited.add(segment_id)
                    offset = segment_id * 5
                    distance = point_to_segment_meters(
                        latitude, longitude,
                        (segments[offset], segments[offset + 1]),
                        (segments[offset + 2], segments[offset + 3]),
                    )
                    if distance is not None and distance < best_distance:
                        best_distance = distance
                        best = (segments[offset + 4], lake.title())
    return best


def _candidate_contour_lakes(latitude: float, longitude: float) -> tuple[str, ...]:
    global _LOCAL_LAKE_BOUNDS
    if _LOCAL_LAKE_BOUNDS is None:
        try:
            manifest = json.loads((LOCAL_CONTOUR_DIR / "bathymetry" / "manifest.json").read_text(encoding="utf-8"))
            bounds = {}
            for lake in LOCAL_CONTOUR_LAKES:
                value = manifest.get("lakes", {}).get(lake, {}).get("bounds")
                if value and len(value) == 2:
                    bounds[lake] = (float(value[0][0]), float(value[0][1]), float(value[1][0]), float(value[1][1]))
            _LOCAL_LAKE_BOUNDS = bounds
        except (OSError, ValueError, TypeError, KeyError, IndexError):
            _LOCAL_LAKE_BOUNDS = {}
    margin = 0.01
    candidates = tuple(
        lake for lake, (south, west, north, east) in _LOCAL_LAKE_BOUNDS.items()
        if south - margin <= latitude <= north + margin and west - margin <= longitude <= east + margin
    )
    return candidates if _LOCAL_LAKE_BOUNDS else LOCAL_CONTOUR_LAKES


def _local_contour_index(lake: str):
    with _LOCAL_CONTOUR_CACHE_LOCK:
        cached = _LOCAL_CONTOUR_CACHE.get(lake)
    if cached is not None:
        return cached
    with _LOCAL_CONTOUR_LOAD_LOCKS[lake]:
        with _LOCAL_CONTOUR_CACHE_LOCK:
            cached = _LOCAL_CONTOUR_CACHE.get(lake)
        if cached is not None:
            return cached
        path = LOCAL_CONTOUR_DIR / f"lake-{lake}-contours.geojson.gz"
        if not path.is_file():
            return None
        try:
            built = _build_local_contour_index(path)
        except (OSError, ValueError, TypeError, KeyError, IndexError, EOFError):
            return None
        with _LOCAL_CONTOUR_CACHE_LOCK:
            _LOCAL_CONTOUR_CACHE[lake] = built
        return built


def _build_local_contour_index(path: Path):
    """Stream one compressed GeoJSON file into compact, spatially binned segments."""
    segments = array("f")
    buckets = {}
    for feature in _iter_contour_features(path):
        properties = feature.get("properties") or {}
        depth = finite_float(properties.get("DEPTH"))
        if depth is None or depth == 0:
            continue
        depth = abs(depth)
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if geometry.get("type") == "LineString":
            paths = (coordinates,)
        elif geometry.get("type") == "MultiLineString":
            paths = coordinates
        else:
            continue
        for line in paths:
            for start, end in zip(line, line[1:]):
                if len(start) < 2 or len(end) < 2:
                    continue
                x1, y1 = finite_float(start[0]), finite_float(start[1])
                x2, y2 = finite_float(end[0]), finite_float(end[1])
                if None in (x1, y1, x2, y2):
                    continue
                x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
                segment_id = len(segments) // 5
                segments.extend((x1, y1, x2, y2, depth))
                mean_latitude = math.radians((y1 + y2) / 2)
                length = math.hypot((x2 - x1) * 111320.0 * math.cos(mean_latitude), (y2 - y1) * 111320.0)
                samples = max(1, math.ceil(length / LOCAL_CONTOUR_INDEX_STEP_METERS))
                previous_bucket = None
                for sample in range(samples + 1):
                    fraction = sample / samples
                    bucket = (
                        math.floor((y1 + (y2 - y1) * fraction) / LOCAL_CONTOUR_BUCKET_DEGREES),
                        math.floor((x1 + (x2 - x1) * fraction) / LOCAL_CONTOUR_BUCKET_DEGREES),
                    )
                    if bucket == previous_bucket:
                        continue
                    values = buckets.get(bucket)
                    if values is None:
                        values = buckets[bucket] = array("I")
                    values.append(segment_id)
                    previous_bucket = bucket
    return segments, buckets


def _iter_contour_features(path: Path):
    """Yield top-level GeoJSON features without loading a whole lake into memory."""
    decoder = json.JSONDecoder()
    with gzip.open(path, "rt", encoding="utf-8") as source:
        buffer = ""
        while True:
            key = buffer.find('"features"')
            if key >= 0:
                start = buffer.find("[", key)
                if start >= 0:
                    buffer = buffer[start + 1:]
                    break
            chunk = source.read(_LOCAL_INDEX_CHUNK_CHARS)
            if not chunk:
                raise ValueError("GeoJSON has no features array")
            buffer += chunk
        while True:
            buffer = buffer.lstrip()
            if not buffer:
                chunk = source.read(_LOCAL_INDEX_CHUNK_CHARS)
                if not chunk:
                    raise ValueError("GeoJSON features array is incomplete")
                buffer = chunk
                continue
            if buffer[0] == "]":
                return
            if buffer[0] == ",":
                buffer = buffer[1:].lstrip()
            try:
                feature, end = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                chunk = source.read(_LOCAL_INDEX_CHUNK_CHARS)
                if not chunk:
                    raise
                buffer += chunk
                continue
            yield feature
            buffer = buffer[end:]


def lookup_depth(latitude: float, longitude: float, lake_calibrations_feet: object = None) -> dict | None:
    """Depth from local NOAA contours, Esri fallback, then the NOAA lake-model estimate."""
    local = nearest_local_contour(latitude, longitude)
    if local is not None:
        depth_m, lake = local
        depth_ft = depth_m * FEET_PER_METER
        depth_m, depth_ft = corrected_bathymetry_depths(
            depth_ft, depth_m, lake_depth_offset_feet(lake, depth_ft, depth_m, lake_calibrations_feet),
        )
        return {
            "depth_m": rounded_depth(depth_m),
            "depth_ft": rounded_depth(depth_ft),
            "lake_name": lake,
            "depth_source": LOCAL_DEPTH_SOURCE,
        }
    try:
        features = query_bathymetry_features(latitude, longitude)
        nearest = nearest_bathymetry_feature(latitude, longitude, features)
        contour_error = None
    except RuntimeError as error:
        nearest, contour_error = None, error
    if nearest is None:
        estimate = model_depth_estimate(latitude, longitude)
        if estimate is None:
            if contour_error is not None:
                raise contour_error
            return None
        depth_m = estimate["depthMeters"]
        depth_ft = depth_m * FEET_PER_METER
        depth_m, depth_ft = corrected_bathymetry_depths(
            depth_ft, depth_m, lake_depth_offset_feet(estimate["lake"], depth_ft, depth_m, lake_calibrations_feet),
        )
        return {
            "depth_m": rounded_depth(depth_m),
            "depth_ft": rounded_depth(depth_ft),
            "lake_name": estimate["lake"],
            "depth_source": MODEL_DEPTH_SOURCE,
        }
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
        "depth_m": rounded_depth(depth_m),
        "depth_ft": rounded_depth(depth_ft),
        "lake_name": attributes.get("Lake"),
        "depth_source": DEPTH_SOURCE,
    }


def model_depth_estimate(latitude: float, longitude: float) -> dict | None:
    from .great_lakes_service import model_bathymetry_depth

    try:
        return model_bathymetry_depth(latitude, longitude)
    except Exception:
        return None


def finite_float(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def rounded_depth(value: object) -> int | None:
    number = finite_float(value)
    if number is None:
        return None
    return int(math.copysign(math.floor(abs(number) + 0.5), number))


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
        with urlopen(Request(url, headers=request_headers), timeout=10, context=_SSL_CONTEXT) as response:
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




def depth_null_payload() -> dict:
    return {
        "depth_m": None,
        "depth_ft": None,
        "lake_name": None,
        "depth_source": None,
    }
