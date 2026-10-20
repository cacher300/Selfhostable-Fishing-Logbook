"""Small NOAA model-depth fallback for points beyond bundled contours."""

from __future__ import annotations

import bisect
import math
import re
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from array import array
from concurrent.futures import Future, ThreadPoolExecutor

from . import great_lakes_cache as cache


THREDDS = "https://opendap.co-ops.nos.noaa.gov/thredds"
GREAT_LAKES_MODELS = {
    "superior": "LSOFS",
    "michigan": "LMHOFS",
    "huron": "LMHOFS",
    "erie": "LEOFS",
    "ontario": "LOOFS",
}
MODEL_LAKE_NAMES = {"LSOFS": "Superior", "LEOFS": "Erie", "LOOFS": "Ontario"}
MICHIGAN_HURON_SPLIT_LONGITUDE = -84.75
RUNS_MAX_AGE_SECONDS = 15 * 60
MODEL_DEPTH_TIMEOUT_SECONDS = 3

_cache_lock = threading.Lock()
_bathymetry_cache: dict[str, dict] = {}
_bathymetry_downloads: dict[str, Future] = {}
_bathymetry_retry_at: dict[str, float] = {}
_bathymetry_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="great-lakes-depth")


def _get(url: str) -> str:
    return cache.http_get(url, timeout=30).decode("utf-8", "replace")


def _catalog_refs(url: str) -> list[tuple[str, str]]:
    root = ET.fromstring(_get(url))
    return [
        (node.attrib.get("{http://www.w3.org/1999/xlink}href", ""), node.attrib.get("name", ""))
        for node in root.iter()
        if node.tag.endswith("catalogRef")
    ]


def _day_catalogs(model: str, count: int = 2) -> list[str]:
    """Return the newest model-day catalogs, including a previous day if needed."""
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


def _runs_from_catalog(xml_text: str) -> list[dict]:
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
        runs.append({"kind": kind, "files": dict(sorted(files.items()))})
    return runs


def _latest_regular_grid_path(model: str) -> str | None:
    target = cache.path_for("bathymetry-runs", f"{model}.json")

    def valid(value: object) -> bool:
        return isinstance(value, dict) and isinstance(value.get("path"), str) and ".regulargrid." in value["path"]

    def build() -> dict:
        for day_url in _day_catalogs(model):
            runs = _runs_from_catalog(_get(day_url))
            run = next((item for item in runs if item["kind"] == "regulargrid" and item["files"]), None)
            if run:
                return {"path": run["files"][min(run["files"])]}
        return {}

    result = cache.get_or_create_json(target, build, valid=valid, max_age_seconds=RUNS_MAX_AGE_SECONDS)
    return result["path"] if valid(result) else None


def _great_lakes_longitude(value: float) -> float:
    if value > 180:
        return value - 360
    return -value if value > 0 else value


def _regular_grid_dimensions(path: str) -> tuple[int, int]:
    dds = _get(f"{THREDDS}/dodsC/{path}.dds")
    match = re.search(r"Latitude\[ny\s*=\s*(\d+)\]\[nx\s*=\s*(\d+)\]", dds)
    return (int(match.group(1)), int(match.group(2))) if match else (0, 0)


def _grid_value(ys: list[float], xs: list[float], columns: int, mask, values, latitude: float, longitude: float) -> float | None:
    if len(ys) < 2 or len(xs) < 2 or not (
        min(ys[0], ys[-1]) <= latitude <= max(ys[0], ys[-1])
        and min(xs[0], xs[-1]) <= longitude <= max(xs[0], xs[-1])
    ):
        return None

    def bracket(axis: list[float], value: float) -> int:
        ascending = axis[-1] > axis[0]
        ordered, target = (axis, value) if ascending else ([-item for item in axis], -value)
        return max(0, min(len(axis) - 2, bisect.bisect_right(ordered, target) - 1))

    row, column = bracket(ys, latitude), bracket(xs, longitude)
    ids = (row * columns + column, row * columns + column + 1,
           (row + 1) * columns + column, (row + 1) * columns + column + 1)
    wet = [index for index in ids if mask[index]]
    if not wet:
        return None
    fy = (latitude - ys[row]) / (ys[row + 1] - ys[row])
    fx = (longitude - xs[column]) / (xs[column + 1] - xs[column])
    weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
    total = sum(weight for index, weight in zip(ids, weights) if mask[index])
    return sum(values[index] * weight for index, weight in zip(ids, weights) if mask[index]) / total


def _cached_bathymetry_grid(model: str) -> dict | None:
    with _cache_lock:
        cached = _bathymetry_cache.get(model)
    if cached is not None:
        return cached
    directory = cache.path_for("static", model)
    for path in sorted(directory.glob("bathymetry-*.bin"), key=lambda item: item.stat().st_mtime, reverse=True):
        record = cache.read_record(path)
        if record is None:
            continue
        header, arrays = record
        ys, xs = header.get("latitudeAxis", []), header.get("longitudeAxis", [])
        wet, depth = arrays.get("wet", ()), arrays.get("depth", ())
        if len(ys) < 2 or len(xs) < 2 or len(wet) != len(ys) * len(xs) or len(depth) != len(wet):
            continue
        grid = {"latitudeAxis": ys, "longitudeAxis": xs, "columns": len(xs), "wet": wet, "depth": depth}
        with _cache_lock:
            _bathymetry_cache[model] = grid
        return grid
    return None


def _bathymetry_grid(model: str) -> dict | None:
    with _cache_lock:
        cached = _bathymetry_cache.get(model)
    if cached is not None:
        return cached
    with cache.resource_lock("bathymetry", model):
        return _load_bathymetry_grid(model)


def _load_bathymetry_grid(model: str) -> dict | None:
    cached = _cached_bathymetry_grid(model)
    if cached is not None:
        return cached
    source_path = _latest_regular_grid_path(model)
    if not source_path:
        return None
    rows, columns = _regular_grid_dimensions(source_path)
    if not rows or not columns:
        return None
    disk_path = cache.path_for("static", model, f"bathymetry-{rows}x{columns}.bin")
    record = cache.read_record(disk_path)
    if record and len(record[1].get("depth", ())) == rows * columns:
        header, arrays = record
        grid = {"latitudeAxis": header["latitudeAxis"], "longitudeAxis": header["longitudeAxis"],
                "columns": columns, "wet": arrays["wet"], "depth": arrays["depth"]}
    else:
        arrays = cache.fetch_dods(
            f"{THREDDS}/dodsC/{source_path}",
            f"Latitude[0:1:{rows - 1}][0],Longitude[0][0:1:{columns - 1}],mask[0:1:{rows - 1}][0:1:{columns - 1}],h[0:1:{rows - 1}][0:1:{columns - 1}]",
        )
        latitude_axis = [float(value) for value in arrays["Latitude"][1]]
        longitude_axis = [_great_lakes_longitude(float(value)) for value in arrays["Longitude"][1]]
        wet = array("B", (1 if value > 0 else 0 for value in arrays["mask"][1]))
        depth = array("f", (float(value) for value in arrays["h"][1]))
        if len(latitude_axis) != rows or len(longitude_axis) != columns or len(wet) != rows * columns or len(depth) != rows * columns:
            raise RuntimeError("NOAA model bathymetry was incomplete")
        cache.write_record(disk_path, {"latitudeAxis": latitude_axis, "longitudeAxis": longitude_axis},
                           {"wet": wet, "depth": depth})
        grid = {"latitudeAxis": latitude_axis, "longitudeAxis": longitude_axis, "columns": columns,
                "wet": wet, "depth": depth}
    with _cache_lock:
        _bathymetry_cache[model] = grid
    return grid


def lake_name_for_model(model: str, longitude: float) -> str:
    if model == "LMHOFS":
        return "Michigan" if longitude < MICHIGAN_HURON_SPLIT_LONGITUDE else "Huron"
    return MODEL_LAKE_NAMES.get(model, "")


def model_bathymetry_depth(latitude: float, longitude: float, models: tuple[str, ...], *, timeout: float | None = None) -> dict | None:
    deadline = time.monotonic() + timeout if timeout is not None else None
    unavailable = False
    for model in models:
        try:
            if deadline is None:
                grid = _bathymetry_grid(model)
            else:
                grid = _cached_bathymetry_grid(model)
                if grid is None:
                    with _cache_lock:
                        future = _bathymetry_downloads.get(model)
                        if future is not None and future.done():
                            _bathymetry_downloads.pop(model)
                            _bathymetry_retry_at[model] = time.monotonic() + 60
                            future = None
                        if future is None and time.monotonic() >= _bathymetry_retry_at.get(model, 0):
                            future = _bathymetry_executor.submit(_bathymetry_grid, model)
                            _bathymetry_downloads[model] = future
                    if future is None:
                        unavailable = True
                        continue
                    grid = future.result(timeout=max(0, deadline - time.monotonic()))
        except Exception:
            unavailable = True
            continue
        if grid is None:
            unavailable = True
            continue
        depth = _grid_value(grid["latitudeAxis"], grid["longitudeAxis"], grid["columns"], grid["wet"],
                            grid["depth"], latitude, longitude)
        if depth is not None and math.isfinite(depth) and depth > 0:
            return {"depthMeters": depth, "model": model, "lake": lake_name_for_model(model, longitude)}
    if deadline is not None and unavailable:
        raise RuntimeError("NOAA model depth is still loading or unavailable")
    return None


def clear_memory() -> None:
    with _cache_lock:
        _bathymetry_cache.clear()
        _bathymetry_downloads.clear()
        _bathymetry_retry_at.clear()
