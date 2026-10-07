"""NOAA Great Lakes wave forecasts for the fishing map.

The source is the National Weather Service's Great Lakes Wave Unstructured
model (GLWU, WAVEWATCH III), the operational wave guidance behind NWS
Great Lakes marine forecasts. NCEP runs it every hour with an hourly
forecast out to 48 hours on a 2.5 km Lambert conformal grid covering all five
lakes, and publishes it on NOMADS as GRIB2 (NOMADS retired OPeNDAP in 2025).

Each cycle's ``.idx`` inventory gives the byte range of every field, so only
the three fields the map uses are downloaded for each forecast choice:
significant wave height (HTSGW), primary wave period (PERPW), and primary
wave direction (DIRPW, the direction waves come *from*, degrees true). That
is about 140 KB per hour rather than the 24 MB file. Wave height is
resampled onto each lake's temperature grid, so the layer is clipped to the
same fine NOAA shoreline as every other layer.
"""

from __future__ import annotations

import bisect
import math
import threading
import time
import urllib.error
import urllib.request
from array import array
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone

from . import grib2
from . import great_lakes_cache as cache
from . import great_lakes_service as service
from .great_lakes_render import WAVE_HEIGHT_COLOR_STOPS, ScalarGrid

GLWU_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/glwu/prod"
GLWU_PRODUCT = "grlc_2p5km_sr"
WAVE_VARIABLES = {"height": "HTSGW", "period": "PERPW", "direction": "DIRPW"}
GLWU_FINAL_HOUR = 48
CYCLE_SECONDS = 3600
# Cycles normally appear a few minutes after the hour (about 30 minutes for
# the longer 01/07/13/19 UTC runs); older cycles stay on NOMADS for two days.
CYCLE_LOOKBACK_HOURS = 6
PUBLISH_DELAY_SECONDS = 5 * 60
LONG_RUN_PUBLISH_DELAY_SECONDS = 36 * 60
LONG_RUN_CYCLES = (1, 7, 13, 19)
RUN_FILE = "waves-run.json"
RUN_MAX_AGE_SECONDS = 5 * 60
WAVE_FORMAT = 1
WAVE_RENDER_VERSION = 3
# Fixed significant-wave-height colour domain, shared by every lake and hour.
WAVE_COLOR_RANGE_METERS = (0.0, 6.0)
# Direction arrows sample every 4th model cell (about 10 km); the browser
# thins them further to fit the zoom level.
WAVE_ARROW_STRIDE = 4
MEMORY_HOURS = 6
SOURCE = "NOAA GLWU wave model"

_state: dict = {}
_state_lock = threading.Lock()
_discover_lock = threading.Lock()
_memory: OrderedDict[tuple, "WaveHour"] = OrderedDict()
_memory_lock = threading.Lock()
_fetch_locks: dict[tuple, threading.Lock] = {}
_mappings: dict[tuple, tuple[array, array]] = {}
_water_points: dict[tuple, tuple[list[float], list[float]]] = {}
_raster_cache: dict[tuple, dict] = {}


@dataclass(frozen=True)
class WaveHour:
    run_id: str
    hour: int
    grid: grib2.RegularGrid | grib2.LambertGrid
    height: array
    period: array
    direction: array


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def cycle_url(cycle_epoch: float, suffix: str = "") -> str:
    moment = datetime.fromtimestamp(cycle_epoch, timezone.utc)
    return f"{GLWU_BASE}/glwu.{moment:%Y%m%d}/glwu.{GLWU_PRODUCT}.t{moment:%H}z.grib2{suffix}"


def run_from_index(cycle_epoch: float, text: str) -> dict | None:
    """A cycle's byte ranges for the map's fields, or ``None`` until its final hour is published."""
    messages: dict[str, dict[str, list[int]]] = {name: {} for name in WAVE_VARIABLES.values()}
    for entry in grib2.parse_index(text):
        if entry["variable"] in messages and entry["level"] == "surface" and entry["end"] is not None:
            hour = grib2.forecast_hour(entry["forecast"])
            if hour is not None:
                messages[entry["variable"]][str(hour)] = [entry["offset"], entry["end"]]
    hours = set.intersection(*(set(ranges) for ranges in messages.values()))
    if str(GLWU_FINAL_HOUR) not in hours:
        return None
    moment = datetime.fromtimestamp(cycle_epoch, timezone.utc)
    return {
        "id": f"{moment:%Y%m%d}t{moment:%H}z",
        "cycleEpoch": cycle_epoch,
        "url": cycle_url(cycle_epoch),
        "hours": sorted(int(hour) for hour in hours),
        "messages": messages,
    }


def _get_text(url: str) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": cache.USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def _get_range(url: str, start: int, end: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": cache.USER_AGENT, "Range": f"bytes={start}-{end - 1}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 206:
            raise RuntimeError("NOMADS ignored the byte-range request")
        data = response.read()
    if len(data) != end - start:
        raise RuntimeError("NOMADS returned an incomplete GRIB2 message")
    return data


def discover(now: float | None = None) -> dict:
    """The newest GLWU cycle whose 48-hour forecast is complete."""
    now = time.time() if now is None else now
    newest = now - now % CYCLE_SECONDS
    for back in range(CYCLE_LOOKBACK_HOURS + 1):
        cycle_epoch = newest - back * CYCLE_SECONDS
        text = _get_text(cycle_url(cycle_epoch, ".idx"))
        run = run_from_index(cycle_epoch, text) if text else None
        if run:
            return run
    raise RuntimeError("No complete NOAA GLWU wave run was found on NOMADS")


def known_run() -> dict:
    """The run being served, from memory or the shared file, without contacting NOAA."""
    with _state_lock:
        state = dict(_state)
    disk = cache.read_json(cache.path_for(RUN_FILE))
    if isinstance(disk, dict) and disk.get("checkedAt", 0) > state.get("checkedAt", 0):
        with _state_lock:
            _state.clear()
            _state.update(disk)
        state = disk
    return state.get("run") or {"error": "NOAA wave run not discovered yet"}


def discovered_wave_run(refresh: bool = False, now: float | None = None) -> dict:
    """Newest complete wave run, checked at most every RUN_MAX_AGE_SECONDS and shared through ``waves-run.json``.

    A failed check keeps serving the last good run.
    """
    now = time.time() if now is None else now
    run = known_run()
    with _state_lock:
        checked = _state.get("checkedAt", 0)
    if not refresh and now - checked <= RUN_MAX_AGE_SECONDS:
        return run
    with _discover_lock:
        with _state_lock:
            if not refresh and now - _state.get("checkedAt", 0) <= RUN_MAX_AGE_SECONDS:
                return _state.get("run") or run
            previous = _state.get("run") or {}
        try:
            entry = {"run": discover(now), "checkedAt": now}
        except Exception as error:
            entry = {"run": previous if previous.get("id") else {"error": str(error)}, "checkedAt": now, "lastError": str(error)}
        with _state_lock:
            _state.clear()
            _state.update(entry)
        try:
            cache.write_json(cache.path_for(RUN_FILE), entry)
        except OSError:
            pass
        return entry["run"]


def select_wave_hour(run: dict, offset: int, now: float | None = None) -> int:
    """Forecast hour for an offset from now; "Now" is the frame nearest the current time."""
    hours = run["hours"]
    elapsed = math.floor(((time.time() if now is None else now) - float(run["cycleEpoch"])) / 3600 + 0.5)
    target = max(0, elapsed) + int(offset)
    return min(hours, key=lambda candidate: abs(candidate - target))


def _disk_path(run_id: str, hour: int):
    return cache.path_for("waves", run_id, f"f{hour:03d}-v{WAVE_FORMAT}.bin")


def _download(run: dict, hour: int) -> WaveHour:
    names = list(WAVE_VARIABLES.items())
    with ThreadPoolExecutor(max_workers=len(names)) as executor:
        futures = {key: executor.submit(_get_range, run["url"], *run["messages"][variable][str(hour)]) for key, variable in names}
        messages = {key: grib2.decode(future.result()) for key, future in futures.items()}
    grid = messages["height"].grid
    if any(message.grid != grid for message in messages.values()):
        raise RuntimeError("NOAA wave fields use different grids")
    arrays = {key: array("f", message.values) for key, message in messages.items()}
    cache.write_record(_disk_path(run["id"], hour), {"grid": grid.to_header()}, arrays)
    return WaveHour(run["id"], hour, grid, arrays["height"], arrays["period"], arrays["direction"])


def load_wave_hour(run: dict, hour: int) -> WaveHour:
    """One forecast hour's wave fields, downloaded once and then served from memory or disk."""
    key = (run["id"], hour)
    with _memory_lock:
        cached = _memory.get(key)
        if cached is not None:
            _memory.move_to_end(key)
            return cached
        lock = _fetch_locks.setdefault(key, threading.Lock())
    with lock:
        with _memory_lock:
            cached = _memory.get(key)
        if cached is None:
            record = cache.read_record(_disk_path(run["id"], hour))
            if record and all(name in record[1] for name in WAVE_VARIABLES):
                header, arrays = record
                cached = WaveHour(run["id"], hour, grib2.grid_from_header(header["grid"]), arrays["height"], arrays["period"], arrays["direction"])
            else:
                cached = _download(run, hour)
        with _memory_lock:
            _memory[key] = cached
            _memory.move_to_end(key)
            while len(_memory) > MEMORY_HOURS:
                _memory.popitem(last=False)
            _fetch_locks.pop(key, None)
        return cached


def _bilinear(values: array, nx: int, ny: int, i: float, j: float) -> float:
    """Interpolate from the surrounding water cells; ``nan`` when none are water."""
    i0, j0 = math.floor(i), math.floor(j)
    di, dj = i - i0, j - j0
    total = weight = 0.0
    for column, row, factor in ((i0, j0, (1 - di) * (1 - dj)), (i0 + 1, j0, di * (1 - dj)), (i0, j0 + 1, (1 - di) * dj), (i0 + 1, j0 + 1, di * dj)):
        if factor > 0 and 0 <= column < nx and 0 <= row < ny:
            value = values[row * nx + column]
            if value == value:
                total += value * factor
                weight += factor
    return total / weight if weight > 1e-9 else math.nan


def _nearest(values: array, nx: int, ny: int, i: float, j: float, radius: int = 2) -> tuple[float, int]:
    """Closest water cell within ``radius`` cells: (value, cell index), or (``nan``, -1)."""
    best, best_index, best_distance = math.nan, -1, math.inf
    center_i, center_j = round(i), round(j)
    for row in range(max(0, center_j - radius), min(ny, center_j + radius + 1)):
        for column in range(max(0, center_i - radius), min(nx, center_i + radius + 1)):
            value = values[row * nx + column]
            distance = (column - i) ** 2 + (row - j) ** 2
            if value == value and distance < best_distance:
                best, best_index, best_distance = value, row * nx + column, distance
    return best, best_index


def sample(values: array, grid, latitude: float, longitude: float) -> float:
    """Value at a point: interpolated between water cells, or the nearest one along the shore."""
    i, j = grid.index(latitude, longitude)
    value = _bilinear(values, grid.nx, grid.ny, i, j)
    return value if value == value else _nearest(values, grid.nx, grid.ny, i, j)[0]


def _model_mapping(target: dict, grid) -> tuple[array, array]:
    """Wave-grid indices for every wet cell of a lake's raster grid (fixed, so cached)."""
    key = (target["model"], target["rows"], target["columns"], tuple(sorted(grid.to_header().items())))
    cached = _mappings.get(key)
    if cached is not None:
        return cached
    latitudes, longitudes, wet = target["latitudeAxis"], target["longitudeAxis"], target["wet"]
    columns = len(longitudes)
    i_values, j_values = array("f", [math.nan]) * len(wet), array("f", [math.nan]) * len(wet)
    if isinstance(grid, grib2.LambertGrid):
        # The projection separates: radius depends only on latitude and angle
        # only on longitude, so each is computed once per row or column.
        angles = [(math.sin(theta), math.cos(theta)) for theta in map(grid.theta, longitudes)]
        for row, latitude in enumerate(latitudes):
            rho = grid.rho(latitude)
            for column, (sine, cosine) in enumerate(angles):
                cell = row * columns + column
                if wet[cell]:
                    i_values[cell], j_values[cell] = grid.index_from_xy(rho * sine, -rho * cosine)
    else:
        for row, latitude in enumerate(latitudes):
            for column, longitude in enumerate(longitudes):
                cell = row * columns + column
                if wet[cell]:
                    i_values[cell], j_values[cell] = grid.index(latitude, longitude)
    _mappings[key] = (i_values, j_values)
    return i_values, j_values


def _lake_input(model: str, waves: WaveHour, valid_time: str) -> dict:
    target = service.model_render_grid(model)
    i_values, j_values = _model_mapping(target, waves.grid)
    nx, ny, height = waves.grid.nx, waves.grid.ny, waves.height
    cells = target["rows"] * target["columns"]
    values, valid, no_data = [0.0] * cells, [False] * cells, [False] * cells
    for cell in range(cells):
        if not target["wet"][cell]:
            continue
        i, j = i_values[cell], j_values[cell]
        value = _bilinear(height, nx, ny, i, j)
        if value != value:
            value = _nearest(height, nx, ny, i, j)[0]
        if value == value:
            values[cell], valid[cell] = max(0.0, value), True
        else:
            no_data[cell] = True  # Water the wave model does not cover stays clear.
    heights = [value for value, ok in zip(values, valid) if ok]
    if not heights:
        raise RuntimeError("NOAA wave model has no values over this lake")
    return {
        "model": model,
        "validTime": valid_time,
        "grid": ScalarGrid(values, valid, target["rows"], target["columns"], target["yStride"], target["xStride"]),
        "axes": target["axes"],
        "water": target["water"],
        "noData": no_data,
        "extra": {"minHeightMeters": min(heights), "maxHeightMeters": max(heights)},
    }


def wave_arrows(waves: WaveHour, stride: int = WAVE_ARROW_STRIDE) -> list[dict]:
    grid, arrows = waves.grid, []
    for row in range(stride // 2, grid.ny, stride):
        for column in range(stride // 2, grid.nx, stride):
            cell = row * grid.nx + column
            height, direction, period = waves.height[cell], waves.direction[cell], waves.period[cell]
            if height != height or direction != direction:
                continue
            latitude, longitude = grid.coordinates(column, row)
            arrows.append({
                "latitude": round(latitude, 4),
                "longitude": round(longitude, 4),
                "heightMeters": round(max(0.0, height), 2),
                "periodSeconds": round(period, 1) if period == period else None,
                "directionDegrees": round(direction) % 360,
            })
    return arrows


def wave_rasters(forecast_hour: int, resolution: int, models: tuple[str, ...] = service.MODELS, scale: tuple[float, float] | None = None) -> dict:
    """Wave height for every lake, drawn like the other layers, plus direction arrows.

    ``scale`` fixes the palette's (min, max) metres instead of fitting this frame.
    """
    run = discovered_wave_run()
    if not run.get("id"):
        return _unavailable(forecast_hour, models, str(run.get("error") or "NOAA wave data is unavailable"))
    hour = select_wave_hour(run, forecast_hour)
    key = (WAVE_RENDER_VERSION, run["id"], hour, resolution, models, scale, service._cache_bucket())
    return service._shared_payload(_raster_cache, key, lambda: _build_rasters(run, hour, forecast_hour, resolution, models, scale), service.MAX_PAYLOAD_CACHE_ENTRIES)


def _unavailable(forecast_hour: int, models: tuple[str, ...], error: str) -> dict:
    return {"rasters": [], "arrows": [], "metadata": {
        "generatedAt": _iso(time.time()), "forecastHour": forecast_hour, "source": SOURCE,
        "models": [{"model": model, "validTime": None, "available": False, "error": error} for model in models],
    }}


def _build_rasters(run: dict, hour: int, forecast_hour: int, resolution: int, models: tuple[str, ...], scale: tuple[float, float] | None = None) -> dict:
    try:
        waves = load_wave_hour(run, hour)
    except Exception as error:
        return _unavailable(forecast_hour, models, str(error))
    valid_time = _iso(float(run["cycleEpoch"]) + hour * 3600)
    inputs, model_metadata = [], []
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        futures = {model: executor.submit(_lake_input, model, waves, valid_time) for model in models}
        for model in models:
            try:
                inputs.append(futures[model].result())
                model_metadata.append({"model": model, "validTime": valid_time, "available": True, "run": run["id"], "selectedForecastHour": hour})
            except Exception as error:
                model_metadata.append({"model": model, "validTime": None, "available": False, "error": str(error)})
    metadata = {
        "generatedAt": _iso(time.time()), "forecastHour": forecast_hour, "source": SOURCE, "run": run["id"],
        "selectedForecastHour": hour, "validTime": valid_time, "models": model_metadata,
    }
    rasters = []
    if inputs:
        minimum, maximum = WAVE_COLOR_RANGE_METERS
        rasters = service._render_rasters(inputs, WAVE_HEIGHT_COLOR_STOPS, minimum, maximum, resolution)
        metadata["minHeightMeters"], metadata["maxHeightMeters"] = minimum, maximum
    return {"rasters": rasters, "arrows": wave_arrows(waves), "metadata": metadata}


def wave_value(forecast_hour: int, latitude: float, longitude: float) -> dict:
    """Wave height, period, and direction at a map point."""
    run = discovered_wave_run()
    if not run.get("id"):
        return {"available": False}
    hour = select_wave_hour(run, forecast_hour)
    waves = load_wave_hour(run, hour)
    height = sample(waves.height, waves.grid, latitude, longitude)
    if height != height:
        return {"available": False}
    period = sample(waves.period, waves.grid, latitude, longitude)
    # Directions are not averaged (350° and 10° would give 180°): use the nearest cell.
    i, j = waves.grid.index(latitude, longitude)
    direction = _nearest(waves.direction, waves.grid.nx, waves.grid.ny, i, j)[0]
    return {
        "available": True,
        "heightMeters": round(max(0.0, height), 2),
        "periodSeconds": round(period, 1) if period == period else None,
        "directionDegrees": round(direction) % 360 if direction == direction else None,
        "validTime": _iso(float(run["cycleEpoch"]) + hour * 3600),
        "run": run["id"],
        "source": SOURCE,
    }


def wave_model_points(bounds: tuple[float, float, float, float], limit: int = service.MODEL_POINTS_LIMIT) -> dict:
    """The wave model's water cells inside ``bounds`` (south, west, north, east), never thinned."""
    south, west, north, east = bounds
    payload = {"kind": "waves", "count": 0, "limit": limit, "tooMany": False, "models": [], "points": []}
    run = discovered_wave_run()
    if not run.get("id"):
        payload["models"] = [{"model": "GLWU", "available": False, "error": run.get("error")}]
        return payload
    waves = load_wave_hour(run, select_wave_hour(run, 0))
    key = tuple(sorted(waves.grid.to_header().items()))
    points = _water_points.get(key)
    if points is None:
        grid = waves.grid
        cells = sorted(grid.coordinates(cell % grid.nx, cell // grid.nx) for cell, value in enumerate(waves.height) if value == value)
        points = ([latitude for latitude, _ in cells], [longitude for _, longitude in cells])
        _water_points[key] = points
    latitudes, longitudes = points
    start, end = bisect.bisect_left(latitudes, south), bisect.bisect_right(latitudes, north)
    selected = [(latitudes[index], longitudes[index]) for index in range(start, end) if west <= longitudes[index] <= east]
    payload.update(count=len(selected), tooMany=len(selected) > limit,
                   models=[{"model": "GLWU", "available": True, "totalPoints": len(latitudes), "pointsInView": len(selected)}])
    if not payload["tooMany"]:
        payload["points"] = [coordinate for point in selected for coordinate in (round(point[0], 5), round(point[1], 5))]
    return payload


def wave_status(now: float | None = None) -> dict:
    now = time.time() if now is None else now
    run = known_run()
    if not run.get("id"):
        return {"available": False, "error": run.get("error"), "version": "waves:none"}
    hour = select_wave_hour(run, 0, now)
    next_cycle = float(run["cycleEpoch"]) + CYCLE_SECONDS
    delay = LONG_RUN_PUBLISH_DELAY_SECONDS if datetime.fromtimestamp(next_cycle, timezone.utc).hour in LONG_RUN_CYCLES else PUBLISH_DELAY_SECONDS
    return {
        "available": True,
        "run": run["id"],
        "runTime": _iso(float(run["cycleEpoch"])),
        "nowForecastHour": hour,
        "nowValidTime": _iso(float(run["cycleEpoch"]) + hour * 3600),
        "nextRunExpectedAt": _iso(next_cycle + delay),
        "version": f"waves:{run['id']}:{hour}",
    }


def warm_wave_hours(offsets: tuple[int, ...] = service.FORECAST_OFFSETS, now: float | None = None) -> dict:
    """Download every forecast choice of the newest run and drop older runs and hours."""
    run = discovered_wave_run(now=now)
    if not run.get("id"):
        raise RuntimeError(str(run.get("error") or "NOAA wave run not discovered"))
    keep = {select_wave_hour(run, offset, now) for offset in offsets}
    for hour in sorted(keep):
        load_wave_hour(run, hour)
    cache.prune(cache.path_for("waves"), {run["id"]})
    try:
        for item in cache.path_for("waves", run["id"]).iterdir():
            if item.name[:1] == "f" and item.name[1:4].isdigit() and int(item.name[1:4]) not in keep:
                item.unlink(missing_ok=True)
    except OSError:
        pass
    return run


def clear_memory() -> None:
    with _state_lock:
        _state.clear()
    with _memory_lock:
        _memory.clear()
    _mappings.clear()
    _water_points.clear()
    _raster_cache.clear()
