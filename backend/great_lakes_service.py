"""NOAA Great Lakes OFS data service for the fishing map.

The CO-OPS catalog currently publishes FVCOM ``fields`` files (unstructured
nodes/faces), not the older regulargrid files. This module discovers those
files on every cache refresh and reads only decimated OPeNDAP ASCII slices.
"""

from __future__ import annotations

import bisect
import hashlib
import math
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from array import array
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from . import great_lakes_cache as gl_cache
from . import great_lakes_volumes as volumes
from .great_lakes_render import (
    CURRENT_SPEED_COLOR_STOPS,
    TEMPERATURE_COLOR_STOPS,
    THERMOCLINE_COLOR_STOPS,
    GridAxes,
    ScalarGrid,
    WaterMask,
    fill_invalid,
    limit_water_to_depth,
    render_overlay,
    robust_range,
)

THREDDS = "https://opendap.co-ops.nos.noaa.gov/thredds"
GREAT_LAKES_MODELS = {"superior": "LSOFS", "michigan": "LMHOFS", "huron": "LMHOFS", "erie": "LEOFS", "ontario": "LOOFS"}
MODELS = tuple(dict.fromkeys(GREAT_LAKES_MODELS.values()))
# Every GLOFS cycle (00, 06, 12, 18 UTC) forecasts 120 hours ahead.
RUN_FINAL_FORECAST_HOUR = 120
# Forecast choices on the map, in hours from now ("Now" first).
FORECAST_OFFSETS = (0, 6, 12, 24, 48)
# The forecast animation: "Now", then every 3 hours on the UTC clock (00, 03,
# 06 … UTC) out to 48 hours. Frames on fixed clock times are the same NOAA
# files all through a run, so they are downloaded and drawn once per run
# rather than again every hour as "Now" moves on.
ANIMATION_STEP_HOURS = 3
ANIMATION_SPAN_HOURS = 48
RUNS_FILE = "runs.json"
RUNS_MAX_AGE_SECONDS = 15 * 60
RUNS_DISK_POLL_SECONDS = 30
_runs_state: dict[str, dict] = {}
_runs_disk_checked = [0.0]
_runs_lock = threading.Lock()
_raster_cache: dict[tuple, dict] = {}
_thermocline_raster_cache: dict[tuple, dict] = {}
TEMPERATURE_RASTER_RENDER_VERSION = 5
THERMOCLINE_RASTER_RENDER_VERSION = 28
CURRENT_RENDER_VERSION = 4
# A requested depth this far below a lake's deepest model level has no water there.
DEEPEST_LEVEL_TOLERANCE_METERS = 0.5
# Never stretch the palette across less than this, or model noise in a
# uniformly mixed lake would read as dramatic temperature fronts.
TEMPERATURE_MIN_COLOR_SPAN_C = 3.0
THERMOCLINE_MIN_COLOR_SPAN_METERS = 2.0
CURRENT_MIN_COLOR_MAX_METERS_PER_SECOND = 0.08
CURRENT_RASTER_RESOLUTION = 512
# The regular grids are ~0.5–1 km; this keeps the static water mask near
# native resolution (Superior is halved) while bounding its one-time download.
WATER_MASK_MAX_COLUMNS = 1000
_water_mask_cache: dict[tuple, WaterMask] = {}
THERMOCLINE_MIN_DEPTH_METERS = 3.048  # 10 ft below the surface
THERMOCLINE_BOTTOM_CLEARANCE_METERS = 3.048  # Never classify the final 10 ft as a thermocline.
# The band's layers cool at least this fast (about 0.1 °F per 10 ft): gentle thermoclines under a
# perfectly flat warm layer are real; the contrast with the warm layer is what rules out noise.
THERMOCLINE_MIN_GRADIENT_C_PER_METER = 0.02
# A thermocline is where the slope changes: a warm top layer at least 10 ft thick (below 10 ft)
# over a band that cools at least THERMOCLINE_MIN_CONTRAST times faster, by at least 0.5 °F: the
# water-column chart draws a column that varies less than that as one straight line.
THERMOCLINE_MIN_WARM_LAYER_METERS = 3.048
THERMOCLINE_MIN_CONTRAST = 3.0
THERMOCLINE_MIN_BAND_DROP_C = 0.5 / 1.8
# The top is the deepest depth where the warm layer above still cools at most a fifth as fast as
# the band below (it reads as flat on the chart); a warm layer cooling slower than
# THERMOCLINE_FLAT_RATE_C_PER_METER counts as perfectly flat when comparing.
THERMOCLINE_FLAT_RATIO = 5.0
THERMOCLINE_FLAT_RATE_C_PER_METER = 0.005
# Of those levels, prefer the deepest where the layer just below cools at least this many times
# faster than the layer just above: where the curve bends, not partway down the band.
THERMOCLINE_LOCAL_BEND_RATIO = 1.5
# The top is the last level of the straight part above the band: the shallowest bend from which
# every layer down to the strongest cooling cools at least this share of that strongest rate, so
# a slower lead-in at the top of the band belongs to the band. The first layer below the top must
# cool by at least THERMOCLINE_MIN_LEAD_DROP_C (a level with water as warm or warmer below it is
# never the top).
THERMOCLINE_LEAD_SHARE = 0.2
THERMOCLINE_MIN_LEAD_DROP_C = 0.15 / 1.8
# Below a straight (nearly vertical) part, where the layer below cools at least this many times
# faster than the layer above, a gentler lead-in still counts down to this share.
THERMOCLINE_SHARP_BEND_RATIO = 3.0
THERMOCLINE_SHARP_LEAD_SHARE = 0.1
# Readings show at most this much of the band (15 ft): the top is what anglers fish, and a
# band can taper on for 50 ft or more below it. Detection still uses the whole band.
THERMOCLINE_MAX_SHOWN_THICKNESS_METERS = 15 / 3.28084
# The band ends where the cooling eases to this share of its strongest rate (or to the minimum above).
THERMOCLINE_BAND_PEAK_SHARE = 0.5
THERMOCLINE_SPATIAL_OUTLIER_METERS = 12.0
_temperature_field_cache: dict[tuple, list[dict]] = {}
_current_payload_cache: dict[tuple, dict] = {}
_current_profile_cache: dict[tuple, dict] = {}
# Cache keys end with an hourly bucket and include client-selected
# depth/resolution values, so both age and entry count must be bounded.
MAX_PAYLOAD_CACHE_ENTRIES = 16
MAX_FIELD_CACHE_ENTRIES = 8
MAX_PROFILE_CACHE_ENTRIES = 64
# Drawn layers are keyed by run and hour, so older files are never reused.
RENDERED_MAX_AGE_SECONDS = 3 * 3600
_build_locks: dict[tuple, threading.Lock] = {}
_cache_lock = threading.Lock()
MAX_DATASET_INFO_ENTRIES = 256
_dds_cache: dict[str, str] = {}
_dimensions_cache: dict[str, tuple[int, int, list[float]]] = {}
# FVCOM computes temperature at triangle-mesh nodes and velocity at triangle
# centres. The mesh is fixed per model, so it is downloaded once and kept on disk.
MODEL_POINT_KINDS = {"temperature": ("lat", "lon", "node"), "currents": ("latc", "lonc", "nele")}
MODEL_POINTS_LIMIT = 6000
_mesh_cache: dict[tuple[str, str], tuple[array, array]] = {}
_mesh_locks: dict[tuple[str, str], threading.Lock] = {}
MODEL_LAKE_NAMES = {"LSOFS": "Superior", "LEOFS": "Erie", "LOOFS": "Ontario"}
MICHIGAN_HURON_SPLIT_LONGITUDE = -84.75
_bathymetry_cache: dict[str, dict] = {}


def _cache_bucket() -> int:
    # Served data only changes when a run is published or "Now" moves to the
    # next hour; run ids and file hours are part of every key (``_data_key``).
    # "Now" is the hour nearest the current time, so it moves at half past; a
    # bucket on the clock hour made every drawn layer expire at :00 and be
    # rebuilt on request until the refresher redrew them at :30.
    return int((time.time() + 1800) // 3600)


def animation_offsets(now: float | None = None) -> tuple[int, ...]:
    """Hours from now of each forecast animation frame ("Now" first)."""
    # "Now" is the hour nearest the current time (see select_forecast_hour).
    now_hour = math.floor((time.time() if now is None else now) / 3600 + 0.5)
    return (0, *(offset for offset in range(1, ANIMATION_SPAN_HOURS + 1) if (now_hour + offset) % ANIMATION_STEP_HOURS == 0))


def served_offsets(now: float | None = None) -> tuple[int, ...]:
    """Every forecast offset the map can show now: the forecast choices and the animation frames."""
    return tuple(sorted({*FORECAST_OFFSETS, *animation_offsets(now)}))


def _data_key(models: tuple[str, ...], forecast_hour: int) -> tuple:
    runs = discovered_runs(models)
    return tuple((model, runs[model].get("id"), select_forecast_hour(runs[model], forecast_hour) if runs[model].get("files") else None) for model in models)


def _cache_store(cache: dict, key: tuple, value: object, max_entries: int) -> None:
    """Store ``value`` after dropping expired buckets and the oldest overflow entries."""
    with _cache_lock:
        bucket = key[-1]
        for expired in [existing for existing in cache if existing[-1] < bucket]:
            del cache[expired]
        cache.pop(key, None)
        cache[key] = value
        while len(cache) > max_entries:
            del cache[next(iter(cache))]


def _rendered_path(key: tuple):
    # The trailing hourly bucket only bounds the memory caches. The rest of the
    # key names the exact NOAA files and drawing, so a layer drawn in an
    # earlier hour (an animation frame, say) is reused from disk.
    return gl_cache.path_for("rendered", hashlib.sha1(repr(key[:-1]).encode("utf-8")).hexdigest() + ".json")


def _touch(path, payload: dict) -> None:
    """Mark a drawn layer as in use, so the age-based pruning keeps it (its images are inline)."""
    try:
        os.utime(path)
    except OSError:
        pass


# A layer drawn while a lake could not be read (NOAA briefly unreachable) is
# kept in memory only this long, then drawn again on the next request, rather
# than until the hour changes.
INCOMPLETE_RETRY_SECONDS = 120
_incomplete_until: dict[tuple, float] = {}


def _complete(payload: dict) -> bool:
    return all(item.get("available", True) for item in payload.get("metadata", {}).get("models", []))


def _from_memory(memory: dict, key: tuple) -> dict | None:
    cached = memory.get(key)
    if cached is None:
        return None
    retry_at = _incomplete_until.get(key)
    return None if retry_at is not None and time.time() >= retry_at else cached


def _remember_completeness(key: tuple, payload: dict) -> None:
    now = time.time()
    with _cache_lock:
        if _complete(payload):
            _incomplete_until.pop(key, None)
        else:
            _incomplete_until[key] = now + INCOMPLETE_RETRY_SECONDS
        for stale in [item for item, retry_at in _incomplete_until.items() if retry_at < now - 3600]:
            del _incomplete_until[stale]


def _shared_payload(memory: dict, key: tuple, build, max_entries: int) -> dict:
    """A drawn layer from memory, then the shared disk cache, then built.

    Drawing is the slow part of a cached layer (up to a few seconds for all
    lakes), so finished layers are stored on disk for every worker. Payloads
    with an unavailable lake are not stored on disk and are kept in memory
    only briefly, so a later request retries.
    """
    cached = _from_memory(memory, key)
    if cached is not None:
        return cached
    with _cache_lock:
        lock = _build_locks.setdefault(key, threading.Lock())
    try:
        with lock:
            cached = _from_memory(memory, key)
            if cached is not None:
                return cached
            shared = gl_cache.read_json(_rendered_path(key))
            if isinstance(shared, dict):
                _touch(_rendered_path(key), shared)
                _cache_store(memory, key, shared, max_entries)
                _remember_completeness(key, shared)
                return shared
            payload = build()
            if _complete(payload):
                try:
                    gl_cache.write_json(_rendered_path(key), payload)
                except OSError:
                    pass
            _cache_store(memory, key, payload, max_entries)
            _remember_completeness(key, payload)
            return payload
    finally:
        with _cache_lock:
            _build_locks.pop(key, None)


def prune_model_hours(model: str, run: dict, keep_hours: set[int]) -> None:
    """Delete a run's cached hours the map no longer shows (forecast choices move forward hourly)."""
    directory = gl_cache.path_for("models", model, run["id"])
    try:
        files = list(directory.iterdir())
    except OSError:
        return
    for item in files:
        match = re.match(r"[a-z]+-f(\d{3})-", item.name)
        if match and int(match.group(1)) not in keep_hours:
            item.unlink(missing_ok=True)


def prune_rendered(max_age_seconds: float = RENDERED_MAX_AGE_SECONDS) -> None:
    directory = gl_cache.path_for("rendered")
    cutoff = time.time() - max_age_seconds
    try:
        stale = [item for item in directory.iterdir() if item.stat().st_mtime < cutoff]
    except OSError:
        return
    for item in stale:
        item.unlink(missing_ok=True)


def _get(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Fishing-Logbook-GreatLakes/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def _catalog_refs(url: str) -> list[tuple[str, str]]:
    root = ET.fromstring(_get(url))
    return [(node.attrib.get("{http://www.w3.org/1999/xlink}href", ""), node.attrib.get("name", "")) for node in root.iter() if node.tag.endswith("catalogRef")]


def _day_catalogs(model: str, count: int = 2) -> list[str]:
    """Newest ``count`` day-directory catalog URLs, crossing month and year boundaries."""
    root = f"{THREDDS}/catalog/NOAA/{model}/MODELS/catalog.xml"
    days: list[str] = []
    for year_href, _ in sorted(_catalog_refs(root), key=lambda item: item[1], reverse=True):
        year_url = urllib.parse.urljoin(root, year_href)
        for month_href, _ in sorted(_catalog_refs(year_url), key=lambda item: item[1], reverse=True):
            month_url = urllib.parse.urljoin(year_url, month_href)
            for day_href, _ in sorted(_catalog_refs(month_url), key=lambda item: item[1], reverse=True):
                days.append(urllib.parse.urljoin(month_url, day_href))
                if len(days) >= count:
                    return days
    return days


def _latest_day_catalog(model: str) -> str:
    # The newest calendar directory can exist before files are published.
    for candidate in _day_catalogs(model, 2):
        if re.search(r"\.(?:regulargrid|fields)\.f\d+\.nc", _get(candidate)):
            return candidate
    raise RuntimeError("Newest NOAA day directory has no forecast output yet")


def _cycle_epoch(date: int, cycle: int) -> float:
    return datetime.strptime(f"{date}{cycle:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp()


def runs_from_catalog(xml_text: str) -> list[dict]:
    """Model runs in one day catalog, newest first, preferring regular-grid output."""
    grouped: dict[tuple[int, int], dict[str, dict[int, str]]] = {}
    for node in ET.fromstring(xml_text).iter():
        path = node.attrib.get("urlPath", "")
        match = re.search(r"\.t(\d\d)z\.(\d{8})\.(regulargrid|fields)\.f(\d+)\.nc$", path)
        if match:
            files = grouped.setdefault((int(match.group(2)), int(match.group(1))), {}).setdefault(match.group(3), {})
            files[int(match.group(4))] = path
    runs = []
    for (date, cycle), kinds in sorted(grouped.items(), reverse=True):
        kind = "regulargrid" if "regulargrid" in kinds else "fields"
        files = kinds[kind]
        runs.append({
            "id": f"{date}t{cycle:02d}z", "date": date, "cycle": cycle, "cycleEpoch": _cycle_epoch(date, cycle),
            "kind": kind, "files": dict(sorted(files.items())),
            # NOAA publishes a run's hourly files over several minutes; a run
            # is only used once its final forecast hour exists.
            "complete": max(files) >= RUN_FINAL_FORECAST_HOUR,
        })
    return runs


def _discover_model(model: str) -> dict:
    """Newest run whose regular-grid files (what the map uses) are complete.

    NOAA publishes a run's raw ``fields`` files before its regular-grid files,
    so a run with only complete fields output must not replace the previous
    run yet. Fields-only runs are a fallback for when no complete regular-grid
    run exists at all.
    """
    runs = [run for day_url in _day_catalogs(model, 2) for run in runs_from_catalog(_get(day_url))]
    for run in runs:
        if run["complete"] and run["kind"] == "regulargrid":
            return run
    for run in runs:
        if run["complete"]:
            return run
    if runs:
        return runs[0]
    raise RuntimeError("No forecast dataset found in the newest NOAA catalogs")


def _normalize_run(run: dict) -> dict:
    if "files" in run:
        run = {**run, "files": {int(hour): path for hour, path in run["files"].items()}}
    return run


def discovered_runs(models: tuple[str, ...] = MODELS, refresh: bool = False) -> dict[str, dict]:
    """Newest complete run per model.

    Runs are checked at most every RUNS_MAX_AGE_SECONDS (the background
    refresher checks more often around publication times) and shared with
    other workers through ``runs.json``. A failed check keeps the last good run.
    """
    now = time.time()
    with _runs_lock:
        if now - _runs_disk_checked[0] > RUNS_DISK_POLL_SECONDS:
            _runs_disk_checked[0] = now
            disk = gl_cache.read_json(gl_cache.path_for(RUNS_FILE))
            if isinstance(disk, dict):
                for model, entry in disk.items():
                    if isinstance(entry, dict) and entry.get("checkedAt", 0) > _runs_state.get(model, {}).get("checkedAt", 0):
                        _runs_state[model] = {**entry, "run": _normalize_run(entry.get("run", {}))}
        stale = [model for model in models if refresh or now - _runs_state.get(model, {}).get("checkedAt", 0) > RUNS_MAX_AGE_SECONDS]
    if stale:
        # Each lake has an independent catalog; discover them concurrently.
        with ThreadPoolExecutor(max_workers=len(stale)) as executor:
            futures = {model: executor.submit(_discover_model, model) for model in stale}
            results = {}
            for model in stale:
                try:
                    results[model] = {"run": futures[model].result(), "checkedAt": now}
                except Exception as error:
                    results[model] = {"run": {"error": str(error)}, "checkedAt": now}
        with _runs_lock:
            for model, entry in results.items():
                previous = _runs_state.get(model, {}).get("run", {})
                if "error" in entry["run"] and "files" in previous:
                    entry = {"run": previous, "checkedAt": now, "lastError": entry["run"]["error"]}
                _runs_state[model] = entry
            snapshot = {model: {**entry, "run": {**entry["run"], "files": {str(hour): path for hour, path in entry["run"].get("files", {}).items()}}} for model, entry in _runs_state.items()}
        try:
            gl_cache.write_json(gl_cache.path_for(RUNS_FILE), snapshot)
        except OSError:
            pass
    with _runs_lock:
        return {model: _runs_state.get(model, {}).get("run", {"error": "NOAA run not discovered"}) for model in models}


def select_forecast_hour(run: dict, forecast_hour: int, now: float | None = None) -> int:
    """File hour for an offset from *now*: "Now" is the hour nearest the current time, not the run start."""
    hours = run["files"]
    elapsed = math.floor(((time.time() if now is None else now) - float(run.get("cycleEpoch", 0))) / 3600 + 0.5)
    target = max(0, elapsed) + int(forecast_hour)
    return min(hours, key=lambda candidate: abs(candidate - target))


def _ascii(path: str, expression: str) -> str:
    return _get(f"{THREDDS}/dodsC/{path}.ascii?{urllib.parse.quote(expression, safe=',')}")


def _numbers(text: str, variable: str) -> list[float]:
    match = re.search(rf"\n{re.escape(variable)}(?:\[[^\n]+\])*\n(.*?)(?=\n\w+(?:\[|$)|\Z)", text, re.S)
    if not match:
        return []
    content = re.sub(r"(?:\[\d+\])+\s*,", "", match.group(1))
    # The lookbehind keeps a leading minus sign: "\b-?" never matched a "-"
    # after ", ", so every negative value (west/south currents, sub-zero
    # water) used to be read as positive.
    return [float(value) for value in re.findall(r"(?<![\w.\]])-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:[Ee][+-]?\d+)?", content)]


def _run_key(path: str) -> str:
    """Every hourly file of one run shares its structure and depth levels."""
    return re.sub(r"\.[fn]\d+\.nc$", "", path)


def _dds(path: str) -> str:
    """Dataset structure, fetched once per model run rather than once per hourly file."""
    key = _run_key(path)
    with _cache_lock:
        cached = _dds_cache.get(key)
    if cached is not None:
        return cached
    text = _get(f"{THREDDS}/dodsC/{path}.dds")
    with _cache_lock:
        _dds_cache[key] = text
        while len(_dds_cache) > MAX_DATASET_INFO_ENTRIES:
            del _dds_cache[next(iter(_dds_cache))]
    return text


def _metadata(path: str) -> dict[str, str]:
    dds = _dds(path)
    def available(*candidates: str) -> str:
        for candidate in candidates:
            if re.search(rf"\b{candidate}\[", dds):
                return candidate
        raise RuntimeError(f"NOAA dataset has none of: {', '.join(candidates)}")
    return {"temperature": available("temp", "temperature"), "u": available("u_eastward", "u"), "v": available("v_northward", "v")}


def _layer_for_depth(depth: int) -> int:
    # FVCOM has 20 terrain-following sigma layers; physical depth varies by location.
    return {0: 19, 5: 17, 10: 15, 20: 11}.get(depth, 19)


def _great_lakes_longitude(value: float) -> float:
    # FVCOM fields use 0–360 east; regular grids use -180–180. The Great Lakes
    # are entirely west of Greenwich, so a positive value below 180 can only be
    # a positive-west convention.
    if value > 180:
        return value - 360
    return -value if value > 0 else value


def _regular_grid_dimensions(path: str) -> tuple[int, int, list[float]]:
    key = _run_key(path)
    with _cache_lock:
        cached = _dimensions_cache.get(key)
    if cached is not None:
        return cached
    dds = _dds(path)
    match = re.search(r"Latitude\[ny = (\d+)\]\[nx = (\d+)\]", dds)
    depth_match = re.search(r"Depth\[Depth = (\d+)\]", dds)
    if not match or not depth_match:
        result: tuple[int, int, list[float]] = (0, 0, [])
    else:
        depths = gl_cache.fetch_dods(f"{THREDDS}/dodsC/{path}", f"Depth[0:1:{int(depth_match.group(1)) - 1}]")["Depth"][1]
        result = (int(match.group(1)), int(match.group(2)), [float(depth) for depth in depths])
    with _cache_lock:
        _dimensions_cache[key] = result
        while len(_dimensions_cache) > MAX_DATASET_INFO_ENTRIES:
            del _dimensions_cache[next(iter(_dimensions_cache))]
    return result


def _field_dimensions(path: str) -> tuple[int, int]:
    dds = _dds(path)
    node = re.search(r"Float32 lat\[node = (\d+)\]", dds)
    face = re.search(r"Float32 latc\[nele = (\d+)\]", dds)
    if not node or not face:
        raise RuntimeError("NOAA fields dataset has no FVCOM node/face coordinates")
    return int(node.group(1)), int(face.group(1))


def _valid_time_text(run: dict, hour: int) -> str:
    return datetime.fromtimestamp(float(run["cycleEpoch"]) + hour * 3600, timezone.utc).isoformat().replace("+00:00", "Z")


class LakeTooShallow(Exception):
    """The requested depth is below a lake's deepest model level: no water there to show."""

    def __init__(self, model: str, max_depth_meters: float):
        super().__init__(f"{model} is no deeper than {max_depth_meters:g} m")
        self.model = model
        self.max_depth_meters = max_depth_meters

    def metadata(self) -> dict:
        return {"model": self.model, "available": True, "tooShallow": True, "maxDepthMeters": self.max_depth_meters, "validTime": None}


def _model_volume(kind: str, model: str, forecast_hour: int) -> tuple[dict, int, str, dict[str, str], volumes.Volume]:
    """The cached 3D volume for one model's selected forecast hour."""
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hour = select_forecast_hour(run, forecast_hour)
    path = run["files"][hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx or not depths:
        raise RuntimeError("Newest model run has no NOAA regular-grid output")
    variables = _metadata(path)
    names = [variables["temperature"]] if kind == "temperature" else [variables["u"], variables["v"]]
    volume = volumes.load_volume(kind, model, run["id"], hour, f"{THREDDS}/dodsC/{path}", ny, nx, depths, names)
    return run, hour, path, variables, volume


def _model_depth(kind: str, model: str, forecast_hour: int, depth: float) -> tuple[dict, int, str, dict[str, str], volumes.Volume, int]:
    """One depth level for a map layer, as fast as possible.

    Uses the full cached volume when there is one ("Now" is kept warm in the
    background). Otherwise downloads only the requested level for a quick first
    view and fetches the full volume in the background, so changing depth or
    switching to the thermocline is fast afterwards.
    """
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hour = select_forecast_hour(run, forecast_hour)
    path = run["files"][hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx or not depths:
        raise RuntimeError("Newest model run has no NOAA regular-grid output")
    if depth > max(depths) + DEEPEST_LEVEL_TOLERANCE_METERS:
        raise LakeTooShallow(model, max(depths))
    variables = _metadata(path)
    full = volumes.cached_volume(kind, model, run["id"], hour, ny, nx)
    if full is not None:
        return run, hour, path, variables, full, full.nearest_level(depth)
    names = [variables["temperature"]] if kind == "temperature" else [variables["u"], variables["v"]]
    base_url = f"{THREDDS}/dodsC/{path}"
    level = min(range(len(depths)), key=lambda index: abs(depths[index] - depth))
    sliced = volumes.load_level(kind, model, run["id"], hour, base_url, ny, nx, depths, names, level)
    volumes.prefetch_volume(kind, model, run["id"], hour, base_url, ny, nx, depths, names)
    return run, hour, path, variables, sliced, 0


def warm_model_hour(model: str, forecast_hour: int = 0) -> None:
    """Download (if needed) and precompute everything the map needs for one model-hour."""
    run, hour, path, variables, volume = _model_volume("temperature", model, forecast_hour)
    ny, nx, _ = _regular_grid_dimensions(path)
    _water_mask(model, path, ny, nx)
    _thermocline_depths(model, run, hour, variables, volume)
    _model_volume("velocity", model, forecast_hour)


def _sample_model(model: str, kind: str, forecast_hour: int, depth: int) -> tuple[list[dict], dict]:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    available_hour = select_forecast_hour(run, forecast_hour)
    path = hours[available_hour]
    variables, layer = _metadata(path), _layer_for_depth(depth)
    ny, nx, depths = _regular_grid_dimensions(path)
    if ny and nx:
        layer = min(range(len(depths)), key=lambda index: abs(depths[index] - depth)) if depths else 0
        y_stride, x_stride = max(1, ny // 65), max(1, nx // 120)
        coordinates = f"Latitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],Longitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],mask[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]"
        if kind == "temperature":
            raw = _ascii(path, f"{coordinates},{variables['temperature']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]")
            lat, lon, mask, values = _numbers(raw, "Latitude"), _numbers(raw, "Longitude"), _numbers(raw, "mask"), _numbers(raw, variables["temperature"])
            data = [{"latitude": a, "longitude": _great_lakes_longitude(b), "temperatureC": value, "model": model} for a, b, wet, value in zip(lat, lon, mask, values) if wet > 0 and math.isfinite(value) and -5 <= value <= 45]
        else:
            raw = _ascii(path, f"{coordinates},{variables['u']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],{variables['v']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]")
            lat, lon, mask, east, north = _numbers(raw, "Latitude"), _numbers(raw, "Longitude"), _numbers(raw, "mask"), _numbers(raw, variables["u"]), _numbers(raw, variables["v"])
            data = [{"latitude": a, "longitude": _great_lakes_longitude(b), "u": u, "v": v, "speed": math.hypot(u, v), "direction": (math.degrees(math.atan2(u, v)) + 360) % 360, "depthMeters": depths[layer] if depths else depth, "model": model} for a, b, wet, u, v in zip(lat, lon, mask, east, north) if wet > 0 and all(math.isfinite(value) for value in (a, b, u, v)) and abs(u) <= 10 and abs(v) <= 10]
        valid = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
        return data, {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": datetime.fromtimestamp(valid, timezone.utc).isoformat().replace("+00:00", "Z"), "available": True, "variables": variables, "selectedForecastHour": available_hour, "selectedDepthMeters": depths[layer] if depths else depth}
    if kind == "temperature":
        nodes, _ = _field_dimensions(path)
        raw = _ascii(path, f"lat[0:90:{nodes - 1}],lon[0:90:{nodes - 1}],{variables['temperature']}[0][{layer}][0:90:{nodes - 1}]")
        lat, lon, values = _numbers(raw, "lat"), _numbers(raw, "lon"), _numbers(raw, variables["temperature"])
        data = [{"latitude": a, "longitude": _great_lakes_longitude(b), "temperatureC": value, "model": model} for a, b, value in zip(lat, lon, values) if math.isfinite(value) and -5 <= value <= 45]
    else:
        _, faces = _field_dimensions(path)
        raw = _ascii(path, f"latc[0:180:{faces - 1}],lonc[0:180:{faces - 1}],{variables['u']}[0][{layer}][0:180:{faces - 1}],{variables['v']}[0][{layer}][0:180:{faces - 1}]")
        lat, lon, east, north = _numbers(raw, "latc"), _numbers(raw, "lonc"), _numbers(raw, variables["u"]), _numbers(raw, variables["v"])
        data = [{"latitude": a, "longitude": _great_lakes_longitude(b), "u": u, "v": v, "speed": math.hypot(u, v), "direction": (math.degrees(math.atan2(u, v)) + 360) % 360, "depthMeters": depth, "model": model} for a, b, u, v in zip(lat, lon, east, north) if all(math.isfinite(value) for value in (a, b, u, v)) and abs(u) <= 10 and abs(v) <= 10]
    valid = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
    return data, {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": datetime.fromtimestamp(valid, timezone.utc).isoformat().replace("+00:00", "Z"), "available": True, "variables": variables, "selectedForecastHour": available_hour, "selectedSigmaLayer": layer}


def great_lakes_payload(kind: str, forecast_hour: int, depth: int, models: tuple[str, ...] = MODELS, scale: tuple[float, float] | None = None) -> dict:
    """Currents (or sampled points) for every lake. ``scale`` fixes the speed shading's (min, max) m/s."""
    depth = snap_depth(depth, models)
    if kind == "currents":
        cache_key = (CURRENT_RENDER_VERSION, _data_key(models, forecast_hour), depth, models, scale, _cache_bucket())
        return _shared_payload(_current_payload_cache, cache_key, lambda: _build_payload(kind, forecast_hour, depth, models, scale), MAX_PAYLOAD_CACHE_ENTRIES)
    return _build_payload(kind, forecast_hour, depth, models)


def _build_payload(kind: str, forecast_hour: int, depth: int, models: tuple[str, ...], scale: tuple[float, float] | None = None) -> dict:
    selected_models, data, model_metadata, fields, render_inputs = models, [], [], [], []

    def load_model(model: str) -> tuple[list[dict], dict, dict | None]:
        if kind != "currents":
            points, metadata = _sample_model(model, kind, forecast_hour, depth)
            return points, metadata, None
        try:
            field = _current_grid_field(model, forecast_hour, depth)
        except LakeTooShallow as shallow:
            return [], shallow.metadata(), None
        except Exception:
            # FVCOM fields can provide sampled velocities without a regular grid.
            # Keep those samples for static arrows and point inspection.
            field = None
        if field is not None:
            points, metadata = field.pop("_samples"), field.pop("_metadata")
        else:
            points, metadata = _sample_model(model, kind, forecast_hour, depth)
        for point in points:
            point["validTime"] = metadata.get("validTime")
        metadata["gridAvailable"] = field is not None
        return points, metadata, field

    with ThreadPoolExecutor(max_workers=len(selected_models)) as executor:
        futures = {model: executor.submit(load_model, model) for model in selected_models}
        for model in selected_models:
            try:
                points, metadata, field = futures[model].result()
                data.extend(points)
                model_metadata.append(metadata)
                if field:
                    render_input = field.pop("_render", None)
                    if render_input:
                        render_inputs.append(render_input)
                    fields.append(field)
            except Exception as error:  # One unavailable lake must not hide the others.
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "requestedDepthMeters": depth, "depthNote": "FVCOM sigma-layer selection; physical depth varies with local bathymetry.", "models": model_metadata}
    if kind == "currents" and data:
        speeds = [float(point["speed"]) for point in data if math.isfinite(point.get("speed", math.nan))]
        if speeds:
            metadata["minSpeedMetersPerSecond"] = min(speeds)
            metadata["maxSpeedMetersPerSecond"] = max(speeds)
    rasters = []
    if render_inputs:
        if scale:
            maximum = scale[1]
        else:
            # Speed shading starts at still water; the top trims rare jets so
            # ordinary lake currents use most of the palette.
            _, maximum = robust_range(
                [value for item in render_inputs for value, ok in zip(item["grid"].values, item["grid"].valid) if ok],
                0.0, 0.98, 0.0,
            )
            maximum = max(maximum, CURRENT_MIN_COLOR_MAX_METERS_PER_SECOND)
        rasters = _render_rasters(render_inputs, CURRENT_SPEED_COLOR_STOPS, 0.0, maximum, CURRENT_RASTER_RESOLUTION)
        metadata["minSpeedMetersPerSecond"], metadata["maxSpeedMetersPerSecond"] = 0.0, maximum
    payload = {"data": data, "fields": fields if kind == "currents" else None, "metadata": metadata}
    if kind == "currents":
        payload["rasters"] = rasters
    return payload


def _water_mask(model: str, path: str, ny: int, nx: int) -> WaterMask:
    """NOAA's near-native wet/dry mask; static per model grid, so cached on disk."""
    key = (model, ny, nx)
    cached = _water_mask_cache.get(key)
    if cached is not None:
        return cached
    stride = max(1, math.ceil(nx / WATER_MASK_MAX_COLUMNS))
    rows, cols = (ny - 1) // stride + 1, (nx - 1) // stride + 1
    disk_path = gl_cache.path_for("static", model, f"water-mask-{ny}x{nx}-s{stride}.bin")
    record = gl_cache.read_record(disk_path)
    if record and len(record[1].get("wet", ())) == rows * cols:
        wet = bytes(record[1]["wet"])
    else:
        values = gl_cache.fetch_dods(f"{THREDDS}/dodsC/{path}", f"mask[0:{stride}:{ny - 1}][0:{stride}:{nx - 1}]")["mask"][1]
        if len(values) != rows * cols:
            raise RuntimeError("NOAA water mask dimensions were incomplete")
        wet = bytes(255 if value > 0 else 0 for value in values)
        gl_cache.write_record(disk_path, {"rows": rows, "columns": cols}, {"wet": array("B", wet)})
    mask = WaterMask(rows, cols, stride, stride, wet)
    with _cache_lock:
        _water_mask_cache[key] = mask
    return mask


def _water_mask_or_none(model: str, path: str, ny: int, nx: int) -> WaterMask | None:
    try:
        return _water_mask(model, path, ny, nx)
    except Exception:
        return None


def _coarse_water_mask(wet: list[bool], rows: int, cols: int, y_stride: int, x_stride: int) -> WaterMask:
    return WaterMask(rows, cols, y_stride, x_stride, bytes(255 if item else 0 for item in wet))


def model_render_grid(model: str) -> dict:
    """The raster grid a lake's temperature layer uses: axes, wet cells, and fine water mask.

    Other sources (the wave model) are resampled onto this grid so every
    layer has the same shoreline. It is static per model grid, so it comes
    from the disk cache once any forecast hour has been downloaded.
    """
    run = discovered_runs((model,))[model]
    if "error" in run or not run.get("files"):
        raise RuntimeError(str(run.get("error") or "NOAA run not discovered"))
    path = run["files"][min(run["files"])]
    ny, nx, _ = _regular_grid_dimensions(path)
    if not ny or not nx:
        raise RuntimeError("Newest model run has no NOAA regular-grid output")
    y_stride, x_stride = volumes.temperature_strides(ny, nx)
    static = volumes.static_grid(model, ny, nx, y_stride, x_stride)
    if static is None:
        volume = _model_volume("temperature", model, 0)[4]
        static = (volume.latitude_axis, volume.longitude_axis, volume.wet)
    latitude_axis, longitude_axis, wet_cells = static
    rows, columns = len(latitude_axis), len(longitude_axis)
    wet = [bool(value) for value in wet_cells]
    return {
        "model": model,
        "rows": rows,
        "columns": columns,
        "yStride": y_stride,
        "xStride": x_stride,
        "latitudeAxis": latitude_axis,
        "longitudeAxis": longitude_axis,
        "wet": wet,
        "axes": GridAxes.from_axes(latitude_axis, longitude_axis, y_stride, x_stride),
        "water": _water_mask_or_none(model, path, ny, nx) or _coarse_water_mask(wet, rows, columns, y_stride, x_stride),
    }


def _render_rasters(inputs: list[dict], stops: tuple, minimum: float, maximum: float, resolution: int) -> list[dict]:
    """Render each lake with one shared colour range so adjoining lakes compare directly."""
    def render(item: dict) -> dict:
        image = render_overlay(item["grid"], item["axes"], item["water"], stops, minimum, maximum, resolution, item.get("noData"), item.get("noDataColor"))
        return {**image, "model": item["model"], "validTime": item["validTime"], **item.get("extra", {})}

    if not inputs:
        return []
    with ThreadPoolExecutor(max_workers=len(inputs)) as executor:
        return list(executor.map(render, inputs))


def _temperature_at_depth(ordered: list[tuple[float, float]], depth: float) -> float:
    """Temperature at a depth, straight-line between the model's levels (``ordered`` shallow to deep)."""
    if depth <= ordered[0][0]:
        return ordered[0][1]
    for (d0, t0), (d1, t1) in zip(ordered, ordered[1:]):
        if depth <= d1:
            return t0 + (t1 - t0) * (depth - d0) / (d1 - d0) if d1 > d0 else t1
    return ordered[-1][1]


def _thermocline_band(profile: list[tuple[float, float]], bottom_depth: float | None = None) -> dict | None:
    """The thermocline band (see _thermocline_analysis), or ``None`` without one."""
    return _thermocline_analysis(profile, bottom_depth)[0]


def _thermocline_analysis(profile: list[tuple[float, float]], bottom_depth: float | None = None) -> tuple[dict | None, str]:
    """The thermocline as a band, or why there is none: ``(band, "found" | "mixed" | "gradual")``.

    A thermocline is where the slope of the temperature curve changes: a warm
    top layer that cools slowly (or not at all) over a band that cools clearly
    faster. Everything is measured from 10 ft down, so a sun-warmed skin on a
    calm afternoon does not count.

    **Bottom**: from the strongest cooling below the warm layer, the band ends
    where the cooling rate eases to half of that strongest rate (never less
    than THERMOCLINE_MIN_GRADIENT_C_PER_METER), interpolated between the
    levels' midpoints.

    **Is it a thermocline?** For each model level from 20 ft down to the
    strongest cooling, compare the band's average cooling below it with the
    warm layer's average cooling above it (from 10 ft). The best ratio must be
    at least THERMOCLINE_MIN_CONTRAST, and the band must cool by at least
    0.5 °F. The ratio, not the size of the drop, is what tells a thermocline
    from water that cools steadily from the surface: a flat warm layer over a
    gentle 0.3 °F-per-10-ft drop is one; 1.8 °F per 10 ft from the surface
    turning into 3 °F per 10 ft below is not.

    **Top**: the last level of the straight part above the band, where the
    curve bends into a run of cooling that continues down to the strongest
    cooling (``_band_lead_in``); a gentler lead-in at the top of the band is
    part of the band. The water right below the top is always cooler. Without
    such a bend: the deepest level where the warm layer above still cools at
    most a fifth as fast as the band below (THERMOCLINE_FLAT_RATIO), where the
    chart stops reading as straight down. Of those, the deepest where the curve
    bends there (the layer below cools THERMOCLINE_LOCAL_BEND_RATIO times
    faster than the layer above), so a slow lead-in stays in the band. When
    the warm layer itself slopes (it never gets that flat), the level with the
    best ratio: the sharpest bend.

    No thermocline: water that barely changes, or is colder at the top than
    below (winter), is "mixed"; water that cools without a warm layer over a
    clearly faster drop is "gradual". The strongest cooling and the top must
    sit above the last 10 ft over the lake bed (cooling right at the bed is
    not a thermocline). ``bottom_depth`` is the true water depth when known;
    NOAA's deepest wet level can sit well above the lake bed.
    """
    ordered = []
    for depth, temperature in sorted(profile, key=lambda point: point[0]):
        if not ordered or depth > ordered[-1][0]:
            ordered.append((float(depth), float(temperature)))
    reference_depth = THERMOCLINE_MIN_DEPTH_METERS
    if len(ordered) < 2 or ordered[-1][0] <= reference_depth:
        return None, "mixed"
    bed = max(ordered[-1][0], bottom_depth or 0.0)
    deepest_top = bed - THERMOCLINE_BOTTOM_CLEARANCE_METERS
    reference = _temperature_at_depth(ordered, reference_depth)
    # Cooling somewhere below 10 ft, but no thermocline, is "gradual".
    no_band = "gradual" if reference - min(temperature for depth, temperature in ordered if depth >= reference_depth) >= THERMOCLINE_MIN_BAND_DROP_C else "mixed"
    warm_top = reference_depth + THERMOCLINE_MIN_WARM_LAYER_METERS
    layers = [(d0, d1, (t0 - t1) / (d1 - d0)) for (d0, t0), (d1, t1) in zip(ordered, ordered[1:])]
    strong = [index for index, (d0, d1, rate) in enumerate(layers) if rate >= THERMOCLINE_MIN_GRADIENT_C_PER_METER and d1 > warm_top and (d0 + d1) / 2 <= deepest_top]
    if not strong:
        return None, no_band
    peak = max(strong, key=lambda index: layers[index][2])
    cutoff = max(THERMOCLINE_MIN_GRADIENT_C_PER_METER, layers[peak][2] * THERMOCLINE_BAND_PEAK_SHARE)
    end = peak
    while end + 1 < len(layers) and layers[end + 1][2] >= cutoff:
        end += 1
    if end + 1 < len(layers):
        middle, next_middle = (layers[end][0] + layers[end][1]) / 2, (layers[end + 1][0] + layers[end + 1][1]) / 2
        rate, next_rate = layers[end][2], layers[end + 1][2]
        bottom = middle + (next_middle - middle) * (rate - cutoff) / (rate - next_rate)
    else:
        bottom = layers[end][1]
    bottom = min(max(bottom, layers[peak][1]), bed)
    bottom_temperature = _temperature_at_depth(ordered, bottom)
    # Each candidate top: (depth, how much faster the band cools than the warm layer, warm layer reads as flat).
    candidates = []
    for depth, temperature in ordered:
        if depth < warm_top - 1e-6 or depth > min(layers[peak][0], deepest_top) or depth >= bottom:
            continue
        warm_rate = max(0.0, (reference - temperature) / (depth - reference_depth))
        band_rate = (temperature - bottom_temperature) / (bottom - depth)
        candidates.append((depth, band_rate / max(THERMOCLINE_FLAT_RATE_C_PER_METER, warm_rate), band_rate >= THERMOCLINE_FLAT_RATIO * warm_rate))
    if not candidates or max(contrast for _, contrast, _ in candidates) < THERMOCLINE_MIN_CONTRAST:
        return None, no_band
    flat = [depth for depth, _, is_flat in candidates if is_flat]
    # Prefer a flat level where the curve visibly bends: the layer just below cools clearly faster
    # than the one just above (a slow lead-in at the top of the band is part of the band).
    above = {d1: max(0.0, rate) for d0, d1, rate in layers}
    below = {d0: rate for d0, d1, rate in layers}
    bends = [depth for depth in flat if below.get(depth, 0.0) >= THERMOCLINE_LOCAL_BEND_RATIO * max(THERMOCLINE_FLAT_RATE_C_PER_METER, above.get(depth, 0.0))]
    top = max(bends or flat) if flat else max(candidates, key=lambda candidate: candidate[1])[0]
    lead = _band_lead_in(layers, peak, warm_top, deepest_top)
    if lead is not None:
        top = lead
    elif below.get(top, 0.0) <= 0:
        # Never a top with water as warm or warmer right below it.
        return None, no_band
    top_temperature = _temperature_at_depth(ordered, top)
    thickness, drop = bottom - top, top_temperature - bottom_temperature
    if thickness <= 0 or drop < THERMOCLINE_MIN_BAND_DROP_C:
        return None, no_band
    return {
        "top": top,
        "bottom": bottom,
        "thickness": thickness,
        "topTemperature": top_temperature,
        "bottomTemperature": bottom_temperature,
        "gradient": drop / thickness,
    }, "found"


def _band_lead_in(layers: list[tuple[float, float, float]], peak: int, warm_top: float, deepest_top: float) -> float | None:
    """The last level of the straight part above the band, or ``None``.

    The shallowest level (from 20 ft down to the strongest cooling) where the
    curve bends (the layer below cools THERMOCLINE_LOCAL_BEND_RATIO times
    faster than the layer above), the layer below cools by at least
    THERMOCLINE_MIN_LEAD_DROP_C, and every layer from there down to the
    strongest cooling keeps cooling at THERMOCLINE_LEAD_SHARE of its rate
    (THERMOCLINE_SHARP_LEAD_SHARE below a sharp bend out of a straight part).
    """
    strongest = layers[peak][2]
    for index in range(peak + 1):
        d0, d1, rate = layers[index]
        if d0 < warm_top - 1e-6 or d0 > deepest_top or rate * (d1 - d0) < THERMOCLINE_MIN_LEAD_DROP_C:
            continue
        above = max(THERMOCLINE_FLAT_RATE_C_PER_METER, layers[index - 1][2] if index else 0.0)
        if rate < THERMOCLINE_LOCAL_BEND_RATIO * above:
            continue
        share = THERMOCLINE_SHARP_LEAD_SHARE if rate >= THERMOCLINE_SHARP_BEND_RATIO * above else THERMOCLINE_LEAD_SHARE
        if all(layers[step][2] >= share * strongest for step in range(index, peak + 1)):
            return d0
    return None


def _smooth_thermocline(values: list[float | None], rows: int, cols: int) -> list[float | None]:
    """A light 3 × 3 average among cells that have a thermocline (the centre counts double).

    Removes cell-to-cell jitter from the model's discrete levels without
    spreading values into mixed water.
    """
    smoothed = values.copy()
    for row in range(rows):
        for column in range(cols):
            index = row * cols + column
            value = values[index]
            if value is None:
                continue
            total, weight = 2 * value, 2
            for neighbor_row in range(max(0, row - 1), min(rows, row + 2)):
                for neighbor_column in range(max(0, column - 1), min(cols, column + 2)):
                    neighbor = values[neighbor_row * cols + neighbor_column]
                    if neighbor is not None and (neighbor_row, neighbor_column) != (row, column):
                        total += neighbor
                        weight += 1
            smoothed[index] = total / weight
    return smoothed


def _filter_spatial_thermocline_outliers(values: list[float | None], rows: int, cols: int) -> list[float | None]:
    filtered = values.copy()
    neighborhood_radius = 2  # 5×5 cells; catches small multi-cell spikes.
    for row in range(rows):
        for column in range(cols):
            index = row * cols + column
            value = values[index]
            if value is None:
                continue
            neighbors = [
                values[neighbor_row * cols + neighbor_column]
                for neighbor_row in range(max(0, row - neighborhood_radius), min(rows, row + neighborhood_radius + 1))
                for neighbor_column in range(max(0, column - neighborhood_radius), min(cols, column + neighborhood_radius + 1))
                if (neighbor_row, neighbor_column) != (row, column)
                and values[neighbor_row * cols + neighbor_column] is not None
            ]
            if len(neighbors) < 8:
                continue
            neighbors.sort()
            local_median = float(neighbors[len(neighbors) // 2])
            if value - local_median > THERMOCLINE_SPATIAL_OUTLIER_METERS:
                filtered[index] = local_median
    return filtered


def _regular_temperature_grid(model: str, forecast_hour: int, depth: int, resolution: int) -> tuple[dict, dict, dict]:
    run, hour, path, variables, volume, layer = _model_depth("temperature", model, forecast_hour, depth)
    values = volume.level(variables["temperature"], layer)
    valid = [bool(wet) and math.isfinite(temp) and -5 <= temp <= 45 for wet, temp in zip(volume.wet, values)]
    if not any(valid):
        raise RuntimeError("NOAA model returned no valid water cells")
    rows, cols = volume.rows, volume.columns
    ny, nx, _ = _regular_grid_dimensions(path)
    metadata = {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": _valid_time_text(run, hour), "available": True, "variables": variables, "run": run["id"], "selectedForecastHour": hour, "selectedDepthMeters": volume.depths[layer]}
    water_temperatures = [float(value) for value, ok in zip(values, valid) if ok]
    values_list = values.tolist()
    surface_water = _water_mask_or_none(model, path, ny, nx) or _coarse_water_mask([bool(wet) for wet in volume.wet], rows, cols, volume.y_stride, volume.x_stride)
    render_input = {
        "model": model,
        "validTime": metadata["validTime"],
        "grid": ScalarGrid(values_list, valid, rows, cols, volume.y_stride, volume.x_stride),
        "axes": GridAxes.from_axes(volume.latitude_axis, volume.longitude_axis, volume.y_stride, volume.x_stride),
        # Water shallower than this level has no value; leave it uncoloured.
        "water": limit_water_to_depth(surface_water, [bool(wet) for wet in volume.wet], valid, rows, cols, volume.y_stride, volume.x_stride),
        "extra": {"minC": min(water_temperatures), "maxC": max(water_temperatures)},
    }
    field = {"model": model, "rows": rows, "columns": cols, "latitudeAxis": volume.latitude_axis, "longitudeAxis": volume.longitude_axis, "mask": valid, "temperatureC": values_list, "depthMeters": metadata["selectedDepthMeters"]}
    return render_input, metadata, field


def depth_levels(models: tuple[str, ...] = MODELS) -> list[float]:
    """Every depth level the selected models store (they share their upper levels)."""
    runs = discovered_runs(models)
    levels: set[float] = set()
    for model in models:
        run = runs.get(model, {})
        if run.get("files"):
            try:
                levels.update(_regular_grid_dimensions(run["files"][min(run["files"])])[2])
            except Exception:
                continue
    return sorted(levels)


def snap_depth(depth: float, models: tuple[str, ...] = MODELS) -> float:
    """The model level that will be shown for a requested depth.

    The slider sends any whole number of metres, but NOAA stores fixed levels;
    caching by level means 3 m and 4 m share one drawing instead of two.
    """
    levels = depth_levels(models)
    return min(levels, key=lambda level: abs(level - depth)) if levels else depth


def great_lakes_temperature_rasters(forecast_hour: int, depth: int, resolution: int, models: tuple[str, ...] = MODELS, scale: tuple[float, float] | None = None) -> dict:
    """Water temperature for every lake. ``scale`` fixes the palette's (min, max) °C instead of fitting this frame."""
    depth = snap_depth(depth, models)
    cache_key = (TEMPERATURE_RASTER_RENDER_VERSION, _data_key(models, forecast_hour), depth, resolution, models, scale, _cache_bucket())
    return _shared_payload(_raster_cache, cache_key, lambda: _build_temperature_rasters(_temperature_fields_key(forecast_hour, depth, resolution, models), forecast_hour, depth, resolution, models, scale), MAX_FIELD_CACHE_ENTRIES)


def _temperature_fields_key(forecast_hour: int, depth: float, resolution: int, models: tuple[str, ...]) -> tuple:
    """Key for the regridded temperatures behind a drawing (shared by every colour scale and by point readings)."""
    return (TEMPERATURE_RASTER_RENDER_VERSION, _data_key(models, forecast_hour), depth, resolution, models, _cache_bucket())


def _temperature_inputs(forecast_hour: int, depth: int, resolution: int, models: tuple[str, ...]) -> tuple[list[dict], list[dict], list[dict]]:
    selected_models, inputs, model_metadata, fields = models, [], [], []
    # NOAA serves one independent grid per lake. Fetch those grids in
    # parallel so first paint does not wait four times in sequence.
    with ThreadPoolExecutor(max_workers=len(selected_models)) as executor:
        futures = {model: executor.submit(_regular_temperature_grid, model, forecast_hour, depth, resolution) for model in selected_models}
        for model in selected_models:
            future = futures[model]
            try:
                render_input, metadata, field = future.result()
                inputs.append(render_input)
                model_metadata.append(metadata)
                fields.append(field)
            except LakeTooShallow as shallow:
                model_metadata.append(shallow.metadata())
            except Exception as error:
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    return inputs, model_metadata, fields


def _build_temperature_rasters(fields_key: tuple, forecast_hour: int, depth: int, resolution: int, models: tuple[str, ...], scale: tuple[float, float] | None = None) -> dict:
    inputs, model_metadata, fields = _temperature_inputs(forecast_hour, depth, resolution, models)
    _cache_store(_temperature_field_cache, fields_key, fields, MAX_FIELD_CACHE_ENTRIES)
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "requestedDepthMeters": depth, "models": model_metadata}
    rasters = []
    if inputs:
        # Spread the palette over the temperatures actually on screen; a fixed
        # 0–30 °C scale left a typical lake in one washed-out band of colour.
        minimum, maximum = scale or robust_range(
            [value for item in inputs for value, ok in zip(item["grid"].values, item["grid"].valid) if ok],
            0.005, 0.995, TEMPERATURE_MIN_COLOR_SPAN_C,
        )
        rasters = _render_rasters(inputs, TEMPERATURE_COLOR_STOPS, minimum, maximum, resolution)
        metadata["minC"], metadata["maxC"] = minimum, maximum
    return {"rasters": rasters, "metadata": metadata}


def _volume_bottom_depths(model: str, volume: volumes.Volume) -> list[float] | None:
    """The model's true water depth at each volume cell, or None if the bathymetry is unavailable."""
    try:
        grid = _bathymetry_grid(model)
    except Exception:
        return None
    if grid is None:
        return None
    columns, depth = grid["columns"], grid["depth"]
    if (volume.rows - 1) * volume.y_stride * columns + (volume.columns - 1) * volume.x_stride >= len(depth):
        return None
    return [float(depth[(row * volume.y_stride) * columns + column * volume.x_stride]) for row in range(volume.rows) for column in range(volume.columns)]


def _thermocline_depths(model: str, run: dict, hour: int, variables: dict[str, str], volume: volumes.Volume) -> list[float | None]:
    """Per-cell thermocline tops (see _thermocline_band), computed once per model-hour and kept on disk."""
    disk_path = gl_cache.path_for("models", model, run["id"], f"thermocline-f{hour:03d}-{volume.y_stride}x{volume.x_stride}-v{THERMOCLINE_RASTER_RENDER_VERSION}.bin")
    record = gl_cache.read_record(disk_path)
    if record and len(record[1].get("depths", ())) == volume.cells:
        return [None if math.isnan(value) else value for value in record[1]["depths"]]
    depths, cells = volume.depths, volume.cells
    if len(depths) < 2:
        raise RuntimeError("Newest model run has no NOAA regular-grid temperature profile output")
    temperatures = volume.variables[variables["temperature"]]
    bottoms = _volume_bottom_depths(model, volume)
    thermoclines: list[float | None] = []
    for cell in range(cells):
        if not volume.wet[cell]:
            thermoclines.append(None)
            continue
        profile = [(depth, temperatures[layer * cells + cell]) for layer, depth in enumerate(depths) if math.isfinite(temperatures[layer * cells + cell]) and -5 <= temperatures[layer * cells + cell] <= 45]
        band = _thermocline_band(profile, bottoms[cell] if bottoms else None)
        thermoclines.append(band["top"] if band else None)
    thermoclines = _smooth_thermocline(_filter_spatial_thermocline_outliers(thermoclines, volume.rows, volume.columns), volume.rows, volume.columns)
    gl_cache.write_record(disk_path, {"model": model}, {"depths": array("f", (math.nan if value is None else value for value in thermoclines))})
    return thermoclines


def _regular_thermocline_grid(model: str, forecast_hour: int, resolution: int) -> tuple[dict, dict]:
    run, hour, path, variables, volume = _model_volume("temperature", model, forecast_hour)
    thermoclines = _thermocline_depths(model, run, hour, variables, volume)
    rows, cols = volume.rows, volume.columns
    valid = [value is not None for value in thermoclines]
    if not any(valid):
        raise RuntimeError("NOAA model returned no thermocline cells")
    thermocline_depths = [float(value) for value in thermoclines if value is not None]
    wet = [bool(value) for value in volume.wet]
    ny, nx, _ = _regular_grid_dimensions(path)
    metadata = {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": _valid_time_text(run, hour), "available": True, "run": run["id"], "selectedForecastHour": hour}
    render_input = {
        "model": model,
        "validTime": metadata["validTime"],
        "grid": ScalarGrid([value if value is not None else 0.0 for value in thermoclines], valid, rows, cols, volume.y_stride, volume.x_stride),
        "axes": GridAxes.from_axes(volume.latitude_axis, volume.longitude_axis, volume.y_stride, volume.x_stride),
        "water": _water_mask_or_none(model, path, ny, nx) or _coarse_water_mask(wet, rows, cols, volume.y_stride, volume.x_stride),
        # Water without a thermocline is left transparent (the map shows through)
        # rather than borrowing a neighbouring depth.
        "noData": [is_wet and not ok for is_wet, ok in zip(wet, valid)],
        "extra": {"minDepthMeters": min(thermocline_depths), "maxDepthMeters": max(thermocline_depths)},
    }
    return render_input, metadata


def great_lakes_thermocline_rasters(forecast_hour: int, resolution: int, models: tuple[str, ...] = MODELS, scale: tuple[float, float] | None = None) -> dict:
    """Thermocline depth for every lake. ``scale`` fixes the palette's (min, max) metres instead of fitting this frame."""
    cache_key = (THERMOCLINE_RASTER_RENDER_VERSION, _data_key(models, forecast_hour), resolution, models, scale, _cache_bucket())
    return _shared_payload(_thermocline_raster_cache, cache_key, lambda: _build_thermocline_rasters(forecast_hour, resolution, models, scale), MAX_PAYLOAD_CACHE_ENTRIES)


def _build_thermocline_rasters(forecast_hour: int, resolution: int, models: tuple[str, ...], scale: tuple[float, float] | None = None) -> dict:
    inputs, model_metadata = [], []
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        futures = {model: executor.submit(_regular_thermocline_grid, model, forecast_hour, resolution) for model in models}
        for model in models:
            try:
                render_input, metadata = futures[model].result()
                inputs.append(render_input)
                model_metadata.append(metadata)
            except Exception as error:
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "models": model_metadata}
    rasters = []
    if inputs:
        # The middle 96 % of depths sets the colours, so a few deep outliers
        # do not squeeze ordinary thermoclines into one shade.
        minimum, maximum = scale or robust_range(
            [value for item in inputs for value, ok in zip(item["grid"].values, item["grid"].valid) if ok],
            0.02, 0.98, THERMOCLINE_MIN_COLOR_SPAN_METERS,
        )
        minimum = max(0.0, minimum)
        rasters = _render_rasters(inputs, THERMOCLINE_COLOR_STOPS, minimum, maximum, resolution)
        metadata["minDepthMeters"], metadata["maxDepthMeters"] = minimum, maximum
    return {"rasters": rasters, "metadata": metadata}


def _grid_value(ys: list[float], xs: list[float], columns: int, mask, values, latitude: float, longitude: float) -> float | None:
    """Bilinear value at a point from the surrounding water cells of a rectilinear grid."""
    if not (min(ys[0], ys[-1]) <= latitude <= max(ys[0], ys[-1]) and min(xs[0], xs[-1]) <= longitude <= max(xs[0], xs[-1])):
        return None
    def bracket(axis: list[float], value: float) -> int:
        ascending = axis[-1] > axis[0]
        values, target = (axis, value) if ascending else ([-item for item in axis], -value)
        return max(0, min(len(axis) - 2, bisect.bisect_right(values, target) - 1))
    row, column = bracket(ys, latitude), bracket(xs, longitude)
    ids = (row * columns + column, row * columns + column + 1, (row + 1) * columns + column, (row + 1) * columns + column + 1)
    wet = [index for index in ids if mask[index]]
    if not wet:
        return None
    fy, fx = (latitude - ys[row]) / (ys[row + 1] - ys[row]), (longitude - xs[column]) / (xs[column + 1] - xs[column])
    weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
    total = sum(weight for index, weight in zip(ids, weights) if mask[index])
    return sum(values[index] * weight for index, weight in zip(ids, weights) if mask[index]) / total


def _temperature_at(field: dict, latitude: float, longitude: float) -> float | None:
    return _grid_value(field["latitudeAxis"], field["longitudeAxis"], field["columns"], field["mask"], field["temperatureC"], latitude, longitude)


def _bathymetry_grid(model: str) -> dict | None:
    """NOAA's model water depth (``h``) at native grid resolution; static, so cached on disk."""
    with _cache_lock:
        cached = _bathymetry_cache.get(model)
    if cached is not None:
        return cached
    run = discovered_runs((model,))[model]
    if not run.get("files"):
        return None
    path = run["files"][min(run["files"])]
    ny, nx, _ = _regular_grid_dimensions(path)
    if not ny or not nx:
        return None
    disk_path = gl_cache.path_for("static", model, f"bathymetry-{ny}x{nx}.bin")
    record = gl_cache.read_record(disk_path)
    if record and len(record[1].get("depth", ())) == ny * nx:
        header, arrays = record
        grid = {"latitudeAxis": header["latitudeAxis"], "longitudeAxis": header["longitudeAxis"], "columns": nx, "wet": arrays["wet"], "depth": arrays["depth"]}
    else:
        arrays = gl_cache.fetch_dods(f"{THREDDS}/dodsC/{path}", f"Latitude[0:1:{ny - 1}][0],Longitude[0][0:1:{nx - 1}],mask[0:1:{ny - 1}][0:1:{nx - 1}],h[0:1:{ny - 1}][0:1:{nx - 1}]")
        latitude_axis = [float(value) for value in arrays["Latitude"][1]]
        longitude_axis = [_great_lakes_longitude(float(value)) for value in arrays["Longitude"][1]]
        wet = array("B", (1 if value > 0 else 0 for value in arrays["mask"][1]))
        depth = array("f", (float(value) for value in arrays["h"][1]))
        if len(latitude_axis) != ny or len(longitude_axis) != nx or len(wet) != ny * nx or len(depth) != ny * nx:
            raise RuntimeError("NOAA model bathymetry was incomplete")
        gl_cache.write_record(disk_path, {"latitudeAxis": latitude_axis, "longitudeAxis": longitude_axis}, {"wet": wet, "depth": depth})
        grid = {"latitudeAxis": latitude_axis, "longitudeAxis": longitude_axis, "columns": nx, "wet": wet, "depth": depth}
    with _cache_lock:
        _bathymetry_cache[model] = grid
    return grid


def lake_name_for_model(model: str, longitude: float) -> str:
    if model == "LMHOFS":
        # One model covers Michigan and Huron; they meet at the Straits of Mackinac.
        return "Michigan" if longitude < MICHIGAN_HURON_SPLIT_LONGITUDE else "Huron"
    return MODEL_LAKE_NAMES.get(model, "")


def model_bathymetry_depth(latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict | None:
    """Water depth anywhere a NOAA lake model has water (about 0.5–1 km cells)."""
    for model in models:
        try:
            grid = _bathymetry_grid(model)
        except Exception:
            continue  # One lake's unavailable grid must not hide another lake.
        if grid is None:
            continue
        depth = _grid_value(grid["latitudeAxis"], grid["longitudeAxis"], grid["columns"], grid["wet"], grid["depth"], latitude, longitude)
        if depth is not None and math.isfinite(depth) and depth > 0:
            return {"depthMeters": depth, "model": model, "lake": lake_name_for_model(model, longitude)}
    return None


def great_lakes_temperature_value(forecast_hour: int, depth: int, resolution: int, latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict:
    depth = snap_depth(depth, models)
    cache_key = _temperature_fields_key(forecast_hour, depth, resolution, models)
    fields = _temperature_field_cache.get(cache_key)
    if fields is None:
        # Point lookups only need the values, not a drawn layer.
        _, _, fields = _temperature_inputs(forecast_hour, depth, resolution, models)
        _cache_store(_temperature_field_cache, cache_key, fields, MAX_FIELD_CACHE_ENTRIES)
    for field in fields:
        value = _temperature_at(field, latitude, longitude)
        if value is not None:
            return {"available": True, "temperatureC": value, "depthMeters": field["depthMeters"], "model": field["model"]}
    return {"available": False}


def great_lakes_temperature_profile(forecast_hour: int, latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict:
    for model in models:
        # The refresher keeps whole model-hours on disk; reading those is instant.
        try:
            cached = _cached_temperature_profile(model, forecast_hour, latitude, longitude)
        except Exception:
            cached = None
        if cached is not None:
            if cached.get("available"):
                return cached
            continue
        run = discovered_runs((model,))[model]
        if "error" in run:
            continue
        hours = run["files"]  # type: ignore[assignment]
        available_hour = select_forecast_hour(run, forecast_hour)
        path = hours[available_hour]
        ny, nx, depths = _regular_grid_dimensions(path)
        if not ny or not nx or not depths:
            continue
        variables = _metadata(path)
        raw_axes = _ascii(path, f"Latitude[0:1:{ny - 1}][0],Longitude[0][0:1:{nx - 1}]")
        latitudes = _numbers(raw_axes, "Latitude")
        longitudes = [_great_lakes_longitude(item) for item in _numbers(raw_axes, "Longitude")]
        if len(latitudes) != ny or len(longitudes) != nx:
            continue
        # Do not let a nearest-edge cell from the first model answer a click
        # in a different Great Lake. Each model is queried only when the
        # requested point is inside its regular-grid extent.
        if not (min(latitudes) <= latitude <= max(latitudes) and min(longitudes) <= longitude <= max(longitudes)):
            continue
        row = min(range(ny), key=lambda index: abs(latitudes[index] - latitude))
        column = min(range(nx), key=lambda index: abs(longitudes[index] - longitude))
        raw = _ascii(path, f"mask[{row}][{column}],{variables['temperature']}[0][0:1:{len(depths) - 1}][{row}][{column}]")
        wet = _numbers(raw, "mask")
        temperatures = _numbers(raw, variables["temperature"])
        if not wet or wet[0] <= 0 or len(temperatures) != len(depths):
            continue
        values = [{"depthMeters": depth, "temperatureC": temp} for depth, temp in zip(depths, temperatures) if math.isfinite(temp) and -5 <= temp <= 45]
        if not values:
            continue
        return _temperature_profile_result(model, run, available_hour, latitude, longitude, latitudes[row], longitudes[column], values)
    return {"available": False}


def _distance_km(latitude: float, longitude: float, other_latitude: float, other_longitude: float) -> float:
    first, second = math.radians(latitude), math.radians(other_latitude)
    delta_latitude = second - first
    delta_longitude = math.radians(other_longitude - longitude)
    value = math.sin(delta_latitude / 2) ** 2 + math.cos(first) * math.cos(second) * math.sin(delta_longitude / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(value)))


def _cached_volume_for_point(kind: str, model: str, forecast_hour: int) -> tuple[dict, int, dict[str, str], volumes.Volume] | None:
    """A model-hour volume the refresher already saved, without downloading anything."""
    run = discovered_runs((model,))[model]
    if "error" in run:
        return None
    hour = select_forecast_hour(run, forecast_hour)
    path = run["files"][hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx or not depths:
        return None
    volume = volumes.cached_volume(kind, model, run["id"], hour, ny, nx)
    return None if volume is None else (run, hour, _metadata(path), volume)


def _nearest_wet_cell(volume: volumes.Volume, latitude: float, longitude: float, radius: int = 2) -> int | None:
    """The wet volume cell closest to a point, looking a couple of cells around the nearest one."""
    lat_axis, lon_axis = volume.latitude_axis, volume.longitude_axis
    if not lat_axis or not lon_axis:
        return None
    if not (min(lat_axis) <= latitude <= max(lat_axis) and min(lon_axis) <= longitude <= max(lon_axis)):
        return None
    row = min(range(volume.rows), key=lambda index: abs(lat_axis[index] - latitude))
    column = min(range(volume.columns), key=lambda index: abs(lon_axis[index] - longitude))
    best, best_distance = None, math.inf
    for r in range(max(0, row - radius), min(volume.rows, row + radius + 1)):
        for c in range(max(0, column - radius), min(volume.columns, column + radius + 1)):
            cell = r * volume.columns + c
            if not volume.wet[cell]:
                continue
            distance = _distance_km(latitude, longitude, lat_axis[r], lon_axis[c])
            if distance < best_distance:
                best, best_distance = cell, distance
    return best


def _cached_temperature_profile(model: str, forecast_hour: int, latitude: float, longitude: float) -> dict | None:
    cached = _cached_volume_for_point("temperature", model, forecast_hour)
    if cached is None:
        return None
    run, hour, variables, volume = cached
    cell = _nearest_wet_cell(volume, latitude, longitude)
    if cell is None:
        return {"available": False}
    temperatures = volume.profile(variables["temperature"], cell)
    values = [{"depthMeters": depth, "temperatureC": temp} for depth, temp in zip(volume.depths, temperatures) if math.isfinite(temp) and -5 <= temp <= 45]
    if not values:
        return {"available": False}
    return _temperature_profile_result(model, run, hour, latitude, longitude, volume.latitude_axis[cell // volume.columns], volume.longitude_axis[cell % volume.columns], values)


def _temperature_profile_result(model: str, run: dict, hour: int, latitude: float, longitude: float, model_latitude: float, model_longitude: float, values: list[dict]) -> dict:
    values.sort(key=lambda value: value["depthMeters"])
    profile_values = [(value["depthMeters"], value["temperatureC"]) for value in values]
    # The same true-bottom rule as the map, so a click agrees with the colour under it.
    try:
        bottom = model_bathymetry_depth(model_latitude, model_longitude, (model,))
    except Exception:
        bottom = None
    band, finding = _thermocline_analysis(profile_values, bottom["depthMeters"] if bottom else None)
    thermocline = None if not band else _shown_thermocline(profile_values, band)
    result = {"available": True, "model": model, "validTime": _valid_time_text(run, hour), "requested": {"latitude": latitude, "longitude": longitude}, "modelLocation": {"latitude": model_latitude, "longitude": model_longitude}, "values": values, "thermocline": thermocline}
    if band is None:
        # Why there is none: "mixed" (about the same temperature throughout, or colder at the top) or "gradual" (cools gradually with depth, no warm layer over a sharper drop).
        result["noThermocline"] = finding
    return result


def _shown_thermocline(profile: list[tuple[float, float]], band: dict) -> dict:
    """A band as readings show it: at most THERMOCLINE_MAX_SHOWN_THICKNESS_METERS from its top."""
    ordered = sorted(profile)
    bottom = min(band["bottom"], band["top"] + THERMOCLINE_MAX_SHOWN_THICKNESS_METERS)
    thickness = bottom - band["top"]
    bottom_temperature = _temperature_at_depth(ordered, bottom) if bottom < band["bottom"] else band["bottomTemperature"]
    return {
        # depthMeters is the top: where the map colour comes from.
        "depthMeters": band["top"],
        "topDepthMeters": band["top"], "bottomDepthMeters": bottom, "thicknessMeters": thickness,
        "temperatureAboveC": band["topTemperature"], "temperatureBelowC": bottom_temperature,
        "gradientCPerMeter": (band["topTemperature"] - bottom_temperature) / thickness if thickness > 0.01 else band["gradient"],
        # The whole band continues this far down (the cooling eases below it).
        "fullBottomDepthMeters": band["bottom"],
        "method": "coolingOnset",
    }


def _cached_current_profile(model: str, forecast_hour: int, latitude: float, longitude: float) -> dict | None:
    cached = _cached_volume_for_point("velocity", model, forecast_hour)
    if cached is None:
        return None
    run, hour, variables, volume = cached
    cell = _nearest_wet_cell(volume, latitude, longitude)
    if cell is None:
        return {"available": False}
    values = _current_profile_values(list(volume.depths), volume.profile(variables["u"], cell), volume.profile(variables["v"], cell))
    if not values:
        return {"available": False}
    model_latitude, model_longitude = volume.latitude_axis[cell // volume.columns], volume.longitude_axis[cell % volume.columns]
    return {"available": True, "model": model, "validTime": _valid_time_text(run, hour), "requested": {"latitude": latitude, "longitude": longitude}, "modelLocation": {"latitude": model_latitude, "longitude": model_longitude}, "sampleDistanceKm": _distance_km(latitude, longitude, model_latitude, model_longitude), "depthApproximate": False, "values": values}


def _current_profile_values(depths: list[float], east: list[float], north: list[float]) -> list[dict]:
    if not (len(depths) == len(east) == len(north)):
        return []
    values = []
    for depth, u, v in zip(depths, east, north):
        if not all(math.isfinite(item) for item in (depth, u, v)) or depth < 0 or abs(u) > 10 or abs(v) > 10:
            continue
        values.append({"depthMeters": depth, "u": u, "v": v, "speedMetersPerSecond": math.hypot(u, v), "directionDegrees": (math.degrees(math.atan2(u, v)) + 360) % 360})
    return sorted(values, key=lambda value: value["depthMeters"])


def _current_profile_for_model(model: str, forecast_hour: int, latitude: float, longitude: float) -> dict:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    available_hour = select_forecast_hour(run, forecast_hour)
    path = hours[available_hour]
    variables = _metadata(path)
    ny, nx, depths = _regular_grid_dimensions(path)
    approximate_depth = not (ny and nx and depths)
    if not approximate_depth:
        raw_axes = _ascii(path, f"Latitude[0:1:{ny - 1}][0],Longitude[0][0:1:{nx - 1}]")
        latitudes = _numbers(raw_axes, "Latitude")
        longitudes = [_great_lakes_longitude(item) for item in _numbers(raw_axes, "Longitude")]
        if len(latitudes) != ny or len(longitudes) != nx or not (min(latitudes) <= latitude <= max(latitudes) and min(longitudes) <= longitude <= max(longitudes)):
            return {"available": False}
        row = min(range(ny), key=lambda index: abs(latitudes[index] - latitude))
        column = min(range(nx), key=lambda index: abs(longitudes[index] - longitude))
        raw = _ascii(path, f"mask[{row}][{column}],{variables['u']}[0][0:1:{len(depths) - 1}][{row}][{column}],{variables['v']}[0][0:1:{len(depths) - 1}][{row}][{column}]")
        if not _numbers(raw, "mask") or _numbers(raw, "mask")[0] <= 0:
            return {"available": False}
        east, north = _numbers(raw, variables["u"]), _numbers(raw, variables["v"])
        model_latitude, model_longitude = latitudes[row], longitudes[column]
    else:
        nodes, faces = _field_dimensions(path)
        dds = _get(f"{THREDDS}/dodsC/{path}.dds")
        layer_match = re.search(rf"\b{re.escape(variables['u'])}\[time = \d+\]\[siglay = (\d+)\]\[nele = \d+\]", dds)
        if not layer_match:
            raise RuntimeError("NOAA current file has no sigma-layer velocities")
        layers = int(layer_match.group(1))
        stride = max(1, math.ceil(faces / 3000))
        raw_axes = _ascii(path, f"latc[0:{stride}:{faces - 1}],lonc[0:{stride}:{faces - 1}]")
        latitudes = _numbers(raw_axes, "latc")
        longitudes = [_great_lakes_longitude(item) for item in _numbers(raw_axes, "lonc")]
        face_indices = list(range(0, faces, stride))
        if len(latitudes) != len(longitudes) or len(latitudes) != len(face_indices):
            raise RuntimeError("NOAA current face coordinates were incomplete")
        nearby = min(range(len(face_indices)), key=lambda index: _distance_km(latitude, longitude, latitudes[index], longitudes[index]))
        model_latitude, model_longitude = latitudes[nearby], longitudes[nearby]
        if _distance_km(latitude, longitude, model_latitude, model_longitude) > 25:
            return {"available": False}
        face = face_indices[nearby]
        raw = _ascii(path, f"nv[0:2][{face}],{variables['u']}[0][0:1:{layers - 1}][{face}],{variables['v']}[0][0:1:{layers - 1}][{face}]")
        face_nodes = _numbers(raw, "nv")
        if len(face_nodes) != 3:
            raise RuntimeError("NOAA current face has no node references")
        node = int(face_nodes[0]) - 1  # FVCOM face connectivity is one-based.
        if not 0 <= node < nodes:
            raise RuntimeError("NOAA current face node is invalid")
        depth_raw = _ascii(path, f"h[{node}],siglay[0:1:{layers - 1}][{node}]")
        bathymetry = _numbers(depth_raw, "h")
        sigma = _numbers(depth_raw, "siglay")
        if len(bathymetry) != 1 or not math.isfinite(bathymetry[0]) or bathymetry[0] <= 0 or len(sigma) != layers:
            raise RuntimeError("NOAA current sigma depths were incomplete")
        depths = [abs(layer) * bathymetry[0] for layer in sigma]
        east, north = _numbers(raw, variables["u"]), _numbers(raw, variables["v"])
    values = _current_profile_values(depths, east, north)
    if not values:
        return {"available": False}
    valid_time = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
    return {"available": True, "model": model, "validTime": datetime.fromtimestamp(valid_time, timezone.utc).isoformat().replace("+00:00", "Z"), "requested": {"latitude": latitude, "longitude": longitude}, "modelLocation": {"latitude": model_latitude, "longitude": model_longitude}, "sampleDistanceKm": _distance_km(latitude, longitude, model_latitude, model_longitude), "depthApproximate": approximate_depth, "values": values}


def great_lakes_current_profile(forecast_hour: int, latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict:
    cache_key = (_data_key(models, forecast_hour), round(latitude, 3), round(longitude, 3), models, _cache_bucket())
    cached = _current_profile_cache.get(cache_key)
    if cached is not None:
        return cached
    for model in models:
        try:
            profile = _cached_current_profile(model, forecast_hour, latitude, longitude)
            if profile is None:
                profile = _current_profile_for_model(model, forecast_hour, latitude, longitude)
        except Exception:
            continue  # One lake's missing run must not hide another lake.
        if profile.get("available"):
            _cache_store(_current_profile_cache, cache_key, profile, MAX_PROFILE_CACHE_ENTRIES)
            return profile
    return {"available": False}


def _current_grid_field(model: str, forecast_hour: int, depth: int) -> dict:
    run, hour, path, variables, volume, layer = _model_depth("velocity", model, forecast_hour, depth)
    east, north = volume.level(variables["u"], layer), volume.level(variables["v"], layer)
    rows, cols = volume.rows, volume.columns
    valid = [bool(wet) and all(math.isfinite(value) and abs(value) <= 10 for value in (u, v)) for wet, u, v in zip(volume.wet, east, north)]
    if not any(valid):
        raise RuntimeError("NOAA model returned no valid current cells")
    axes = GridAxes.from_axes(volume.latitude_axis, volume.longitude_axis, volume.y_stride, volume.x_stride)
    ny, nx, _ = _regular_grid_dimensions(path)
    wet = [bool(cell) for cell in volume.wet]
    surface_water = _water_mask_or_none(model, path, ny, nx) or _coarse_water_mask(wet, rows, cols, volume.y_stride, volume.x_stride)
    # Particles and speed shading stay out of water shallower than this level.
    water = limit_water_to_depth(surface_water, wet, valid, rows, cols, volume.y_stride, volume.x_stride)
    valid_time_text = _valid_time_text(run, hour)
    east_list, north_list = east.tolist(), north.tolist()
    # Shoreline cells the coarse grid calls land borrow nearby velocities, so
    # particles can follow the fine water mask right up to the shore.
    filled_east = fill_invalid(east_list, valid, rows, cols, fallback=0.0)
    filled_north = fill_invalid(north_list, valid, rows, cols, fallback=0.0)
    speeds = [math.hypot(u, v) if ok else 0.0 for u, v, ok in zip(east_list, north_list, valid)]
    return {
        "model": model,
        "rows": rows,
        "columns": cols,
        "latitudeAxis": volume.latitude_axis,
        "longitudeAxis": volume.longitude_axis,
        "mask": [1 if item else 0 for item in valid],
        "u": [round(value, 4) for value in filled_east],
        "v": [round(value, 4) for value in filled_north],
        "waterMask": water.payload(axes),
        "depthMeters": volume.depths[layer],
        "validTime": valid_time_text,
        "_samples": [
            {"latitude": volume.latitude_axis[index // cols], "longitude": volume.longitude_axis[index % cols], "u": east_list[index], "v": north_list[index],
             "speed": speeds[index], "direction": (math.degrees(math.atan2(east_list[index], north_list[index])) + 360) % 360,
             "depthMeters": volume.depths[layer], "model": model}
            for index in range(rows * cols) if valid[index] and (index // cols) % 2 == 0 and (index % cols) % 2 == 0
        ],
        "_metadata": {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": valid_time_text, "available": True, "variables": variables, "run": run["id"], "selectedForecastHour": hour, "selectedDepthMeters": volume.depths[layer]},
        "_render": {"model": model, "validTime": valid_time_text, "grid": ScalarGrid(speeds, valid, rows, cols, volume.y_stride, volume.x_stride), "axes": axes, "water": water},
    }


def _fields_dataset_path(model: str) -> str:
    """Any FVCOM ``fields`` file from the newest catalog day; only its static mesh is read."""
    paths = re.findall(r'urlPath="([^"]+\.fields\.[fn]\d+\.nc)"', _get(_latest_day_catalog(model)))
    if not paths:
        raise RuntimeError("Newest NOAA catalog has no FVCOM fields file")
    return sorted(paths)[-1]


def _model_mesh(model: str, kind: str) -> tuple[array, array]:
    """Latitudes (ascending) and matching longitudes of one model's calculation points."""
    key = (model, kind)
    cached = _mesh_cache.get(key)
    if cached is not None:
        return cached
    with _cache_lock:
        lock = _mesh_locks.setdefault(key, threading.Lock())
    with lock:
        cached = _mesh_cache.get(key)
        if cached is not None:
            return cached
        latitude_name, longitude_name, dimension = MODEL_POINT_KINDS[kind]
        disk_path = gl_cache.path_for("static", model, f"mesh-{kind}.bin")
        record = gl_cache.read_record(disk_path)
        if record and len(record[1].get("latitudes", ())) == len(record[1].get("longitudes", ())) > 0:
            mesh = (array("d", record[1]["latitudes"]), array("d", record[1]["longitudes"]))
            _mesh_cache[key] = mesh
            return mesh
        path = _fields_dataset_path(model)
        count = int(re.search(rf"Float32 {latitude_name}\[{dimension} = (\d+)\]", _dds(path)).group(1))
        arrays = gl_cache.fetch_dods(f"{THREDDS}/dodsC/{path}", f"{latitude_name}[0:1:{count - 1}],{longitude_name}[0:1:{count - 1}]")
        latitudes, longitudes = arrays[latitude_name][1], arrays[longitude_name][1]
        if len(latitudes) != count or len(longitudes) != count:
            raise RuntimeError("NOAA mesh coordinates were incomplete")
        ordered = sorted(zip(latitudes, (_great_lakes_longitude(value) for value in longitudes)))
        mesh = (array("d", (point[0] for point in ordered)), array("d", (point[1] for point in ordered)))
        gl_cache.write_record(disk_path, {"model": model, "kind": kind}, {"latitudes": mesh[0], "longitudes": mesh[1]})
        _mesh_cache[key] = mesh
        return mesh


def great_lakes_model_points(kind: str, bounds: tuple[float, float, float, float], models: tuple[str, ...] = MODELS, limit: int = MODEL_POINTS_LIMIT) -> dict:
    """Model calculation points inside ``bounds`` (south, west, north, east).

    Points are never thinned: when the view holds more than ``limit`` the
    response reports the count so the map can ask the user to zoom in.
    """
    south, west, north, east = bounds
    selected, model_metadata = [], []
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        futures = {model: executor.submit(_model_mesh, model, kind) for model in models}
        for model in models:
            try:
                latitudes, longitudes = futures[model].result()
            except Exception as error:
                model_metadata.append({"model": model, "available": False, "error": str(error)})
                continue
            start, end = bisect.bisect_left(latitudes, south), bisect.bisect_right(latitudes, north)
            points = [(latitudes[index], longitudes[index]) for index in range(start, end) if west <= longitudes[index] <= east]
            selected.extend(points)
            model_metadata.append({"model": model, "available": True, "totalPoints": len(latitudes), "pointsInView": len(points)})
    payload = {"kind": kind, "count": len(selected), "limit": limit, "tooMany": len(selected) > limit, "models": model_metadata, "points": []}
    if not payload["tooMany"]:
        payload["points"] = [coordinate for point in selected for coordinate in (round(point[0], 5), round(point[1], 5))]
    return payload