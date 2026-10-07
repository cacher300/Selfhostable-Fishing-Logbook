"""3D NOAA model volumes (every depth level for one model forecast hour).

One binary download per model-hour serves every depth on the slider, the
thermocline, and point profiles. Volumes are cached on disk (shared by
workers and restarts) and the most recent few are kept parsed in memory.
"""

from __future__ import annotations

import math
import threading
from array import array
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from . import great_lakes_cache as cache

# Temperature volumes match the densest map raster; velocity volumes match
# the interpolated flow field (about 120 × 160 cells per lake).
TEMPERATURE_TARGET_COLUMNS = 512
TEMPERATURE_MAX_ROWS = 320
VELOCITY_TARGET_ROWS = 120
VELOCITY_TARGET_COLUMNS = 160
MEMORY_VOLUMES = 8
VOLUME_FORMAT = 1

_memory: OrderedDict[tuple, "Volume"] = OrderedDict()
_memory_lock = threading.Lock()
_fetch_locks: dict[tuple, threading.Lock] = {}
_prefetching: set[tuple] = set()
_static_grids: dict[tuple, tuple[list[float], list[float], array]] = {}


@dataclass
class Volume:
    kind: str
    model: str
    run_id: str
    hour: int
    rows: int
    columns: int
    y_stride: int
    x_stride: int
    latitude_axis: list[float]
    longitude_axis: list[float]
    wet: array
    depths: list[float]
    variables: dict[str, array]

    @property
    def cells(self) -> int:
        return self.rows * self.columns

    def level(self, name: str, index: int) -> array:
        values = self.variables[name]
        return values[index * self.cells:(index + 1) * self.cells]

    def profile(self, name: str, cell: int) -> list[float]:
        values, cells = self.variables[name], self.cells
        return [values[level * cells + cell] for level in range(len(self.depths))]

    def nearest_level(self, depth: float) -> int:
        return min(range(len(self.depths)), key=lambda index: abs(self.depths[index] - depth)) if self.depths else 0


def temperature_strides(ny: int, nx: int) -> tuple[int, int]:
    target_x = TEMPERATURE_TARGET_COLUMNS
    target_y = max(64, min(round(TEMPERATURE_TARGET_COLUMNS * ny / nx), TEMPERATURE_MAX_ROWS))
    return max(1, math.ceil((ny - 1) / (target_y - 1))), max(1, math.ceil((nx - 1) / (target_x - 1)))


def velocity_strides(ny: int, nx: int) -> tuple[int, int]:
    return max(1, math.ceil((ny - 1) / (VELOCITY_TARGET_ROWS - 1))), max(1, math.ceil((nx - 1) / (VELOCITY_TARGET_COLUMNS - 1)))


def _longitude(value: float) -> float:
    return value - 360 if value > 180 else value


def _disk_path(kind: str, model: str, run_id: str, hour: int, y_stride: int, x_stride: int, level: int | None = None):
    part = "" if level is None else f"-L{level:02d}"
    return cache.path_for("models", model, run_id, f"{kind}-f{hour:03d}-{y_stride}x{x_stride}{part}-v{VOLUME_FORMAT}.bin")


def _strides(kind: str, ny: int, nx: int) -> tuple[int, int]:
    return temperature_strides(ny, nx) if kind == "temperature" else velocity_strides(ny, nx)


def _from_record(kind: str, model: str, run_id: str, hour: int, record) -> Volume | None:
    if record is None:
        return None
    header, arrays = record
    variables = {name: values for name, values in arrays.items() if name != "wet"}
    return Volume(kind, model, run_id, hour, header["rows"], header["columns"], header["yStride"], header["xStride"],
                  header["latitudeAxis"], header["longitudeAxis"], arrays["wet"], header["depths"], variables)


def _static_grid_path(model: str, ny: int, nx: int, y_stride: int, x_stride: int):
    return cache.path_for("static", model, f"grid-{ny}x{nx}-{y_stride}x{x_stride}-v{VOLUME_FORMAT}.bin")


def _static_grid(model: str, ny: int, nx: int, y_stride: int, x_stride: int) -> tuple[list[float], list[float], array] | None:
    """Row latitudes, column longitudes, and wet flags: fixed for a model grid."""
    key = (model, ny, nx, y_stride, x_stride)
    with _memory_lock:
        cached = _static_grids.get(key)
    if cached is not None:
        return cached
    record = cache.read_record(_static_grid_path(model, ny, nx, y_stride, x_stride))
    if record is None:
        return None
    header, arrays = record
    grid = (header["latitudeAxis"], header["longitudeAxis"], arrays["wet"])
    with _memory_lock:
        _static_grids[key] = grid
    return grid


def static_grid(model: str, ny: int, nx: int, y_stride: int, x_stride: int) -> tuple[list[float], list[float], array] | None:
    """A model grid's cached row latitudes, column longitudes, and wet flags, if downloaded."""
    return _static_grid(model, ny, nx, y_stride, x_stride)


def _download(kind: str, model: str, run_id: str, hour: int, base_url: str, ny: int, nx: int,
              depths: list[float], variable_names: list[str], y_stride: int, x_stride: int, level: int | None = None) -> Volume:
    rows, columns = (ny - 1) // y_stride + 1, (nx - 1) // x_stride + 1
    window = f"[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]"
    levels = f"[0][0:1:{len(depths) - 1}]" if level is None else f"[0][{level}:1:{level}]"
    kept_depths = depths if level is None else [depths[level]]
    # Coordinates and the 8-byte wet mask (often larger than one level of
    # data) never change, so they are downloaded once per model grid.
    static = _static_grid(model, ny, nx, y_stride, x_stride)
    coordinates = [] if static else [f"Latitude[0:{y_stride}:{ny - 1}][0]", f"Longitude[0][0:{x_stride}:{nx - 1}]", f"mask{window}"]
    arrays = cache.fetch_dods(base_url, ",".join(coordinates + [f"{name}{levels}{window}" for name in variable_names]))
    expected = rows * columns
    if static:
        latitude_axis, longitude_axis, wet = static
    else:
        latitudes, longitudes, mask = arrays["Latitude"][1], arrays["Longitude"][1], arrays["mask"][1]
        if len(latitudes) != rows or len(longitudes) != columns or len(mask) != expected:
            raise RuntimeError("NOAA volume coordinates were incomplete")
        latitude_axis = [float(value) for value in latitudes]
        longitude_axis = [_longitude(float(value)) for value in longitudes]
        wet = array("B", (1 if value > 0 else 0 for value in mask))
        cache.write_record(_static_grid_path(model, ny, nx, y_stride, x_stride),
                           {"latitudeAxis": latitude_axis, "longitudeAxis": longitude_axis}, {"wet": wet})
    if len(latitude_axis) != rows or len(longitude_axis) != columns or len(wet) != expected:
        raise RuntimeError("Cached NOAA grid does not match this file")
    variables = {}
    for name in variable_names:
        values = arrays[name][1]
        if len(values) != expected * len(kept_depths):
            raise RuntimeError(f"NOAA volume {name} was incomplete")
        variables[name] = values if values.typecode == "f" else array("f", values)
    volume = Volume(kind, model, run_id, hour, rows, columns, y_stride, x_stride,
                    latitude_axis, longitude_axis, wet, [float(depth) for depth in kept_depths], variables)
    cache.write_record(
        _disk_path(kind, model, run_id, hour, y_stride, x_stride, level),
        {"rows": rows, "columns": columns, "yStride": y_stride, "xStride": x_stride,
         "latitudeAxis": volume.latitude_axis, "longitudeAxis": volume.longitude_axis, "depths": volume.depths},
        {"wet": wet, **variables},
    )
    return volume


def _load(kind: str, model: str, run_id: str, hour: int, base_url: str, ny: int, nx: int,
          depths: list[float], variable_names: list[str], level: int | None, download: bool) -> Volume | None:
    y_stride, x_stride = _strides(kind, ny, nx)
    key = (kind, model, run_id, hour, y_stride, x_stride, level)
    with _memory_lock:
        volume = _memory.get(key)
        if volume is not None:
            _memory.move_to_end(key)
            return volume
        lock = _fetch_locks.setdefault(key, threading.Lock())
    with lock:
        with _memory_lock:
            volume = _memory.get(key)
        if volume is None:
            volume = _from_record(kind, model, run_id, hour, cache.read_record(_disk_path(kind, model, run_id, hour, y_stride, x_stride, level)))
        if volume is None and download:
            volume = _download(kind, model, run_id, hour, base_url, ny, nx, depths, variable_names, y_stride, x_stride, level)
        if volume is not None:
            with _memory_lock:
                _memory[key] = volume
                _memory.move_to_end(key)
                while len(_memory) > MEMORY_VOLUMES:
                    _memory.popitem(last=False)
                _fetch_locks.pop(key, None)
        return volume


def load_volume(kind: str, model: str, run_id: str, hour: int, base_url: str, ny: int, nx: int,
                depths: list[float], variable_names: list[str]) -> Volume:
    """Every depth level for one model-hour, downloaded once if neither memory nor disk has it."""
    return _load(kind, model, run_id, hour, base_url, ny, nx, depths, variable_names, None, True)  # type: ignore[return-value]


def cached_volume(kind: str, model: str, run_id: str, hour: int, ny: int, nx: int) -> Volume | None:
    """The full volume only if it is already in memory or on disk (never downloads)."""
    return _load(kind, model, run_id, hour, "", ny, nx, [], [], None, False)


def cached_volume_file(kind: str, model: str, run_id: str, hour: int, path: Path) -> Volume | None:
    """Read a saved volume file when catalog metadata is unavailable."""
    return _from_record(kind, model, run_id, hour, cache.read_record(path))


def load_level(kind: str, model: str, run_id: str, hour: int, base_url: str, ny: int, nx: int,
               depths: list[float], variable_names: list[str], level: int) -> Volume:
    """One depth level (about 1/20 of a full volume) for a quick first view."""
    return _load(kind, model, run_id, hour, base_url, ny, nx, depths, variable_names, level, True)  # type: ignore[return-value]


def prefetch_volume(kind: str, model: str, run_id: str, hour: int, base_url: str, ny: int, nx: int,
                    depths: list[float], variable_names: list[str]) -> None:
    """Download the full volume in the background so other depths and the thermocline follow quickly."""
    key = (kind, model, run_id, hour)
    with _memory_lock:
        if key in _prefetching:
            return
        _prefetching.add(key)

    def run() -> None:
        try:
            load_volume(kind, model, run_id, hour, base_url, ny, nx, depths, variable_names)
        except Exception:
            pass  # The next request retries; a failed background fetch is not an error.
        finally:
            with _memory_lock:
                _prefetching.discard(key)

    threading.Thread(target=run, name=f"great-lakes-prefetch-{model}-{kind}-f{hour}", daemon=True).start()


def clear_memory() -> None:
    with _memory_lock:
        _memory.clear()
        _static_grids.clear()
