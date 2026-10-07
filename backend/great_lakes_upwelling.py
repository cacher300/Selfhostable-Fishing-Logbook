"""Upwelling and downwelling: where the lake's surface water is being replaced.

NOAA's lake models do not publish wind or vertical water movement, so both
are read from the temperature they do publish:

* **Upwelling**: wind pushes the warm surface water away from a shore and cold
  water from below rises in its place. The surface there is clearly colder
  than the open water around it, and often cooled quickly over the last day.
* **Downwelling**: wind piles warm surface water against a shore. The surface
  is warmer than the water around it, or warmed over the last day, and the
  thermocline is pushed deeper than in the surrounding water.

Each water cell gets a score in °F (stronger is further from zero; negative
is upwelling, positive is downwelling):

    upwelling   = colder than surroundings + half of any cooling over 24 h
    downwelling = warmer than surroundings + half of any warming over 24 h
                  + 1 °F per 10 ft the thermocline sits deeper than its
                    surroundings beyond the first 15 ft

"Surroundings" is the open water (at least 10 m deep) within about 25 km.
Shallow water (under 10 m) is left out: it warms and cools with the weather
much faster than open water, which would look like upwelling in autumn and
downwelling in summer. Whole-lake cooling (a cold front) is not upwelling:
the spot must also differ from its surroundings.

The surface 24 hours earlier comes from the same forecast hour of the model
run one day older (its file for that valid time); without it, only the
comparison with the surroundings is used.
"""

from __future__ import annotations

import math
import re
import threading
import time
from array import array
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from . import great_lakes_cache as gl_cache
from . import great_lakes_service as service
from .great_lakes_render import GridAxes, ScalarGrid

UPWELLING_RENDER_VERSION = 1
# Colours run from -SCORE_LIMIT_F (strong upwelling) to +SCORE_LIMIT_F (strong downwelling).
SCORE_LIMIT_F = 8.0
# A spot is marked from this score, and only if it differs from its surroundings by at least
# MIN_CONTRAST_F (or, for downwelling, its thermocline is at least DEEPER_THERMOCLINE_MIN_FEET deeper).
MIN_SCORE_F = 2.5
MIN_CONTRAST_F = 1.5
CHANGE_WEIGHT = 0.5
THERMOCLINE_SHIFT_FREE_FEET = 15.0
THERMOCLINE_FEET_PER_F = 10.0
DEEPER_THERMOCLINE_MIN_FEET = 25.0
SURROUNDING_RADIUS_KM = 25.0
MIN_WATER_DEPTH_METERS = 10.0
# A marked patch must cover at least this much water: smaller ones are model eddies, not a
# shore's water being replaced.
MIN_PATCH_KM2 = 20.0
# Upwelling and downwelling happen against a shore: a patch must reach within this distance of
# land (an island counts). Cold and warm eddies out in the open lake are left out.
SHORE_REACH_KM = 10.0
UPWELLING_COLOR_STOPS = (
    (0.00, (20, 54, 160)),
    (0.22, (38, 112, 222)),
    (0.38, (126, 196, 250)),
    (0.50, (236, 240, 245)),
    (0.62, (252, 178, 122)),
    (0.78, (232, 92, 54)),
    (1.00, (168, 24, 36)),
)
FEET_PER_METER = 3.28084
MAX_PAYLOAD_CACHE_ENTRIES = 16

# Scores worked out without the day before are tried again after this long.
PARTIAL_RETRY_SECONDS = 10 * 60

_payload_cache: dict[tuple, dict] = {}
_partial_scores: dict[str, tuple[float, tuple]] = {}
_lock = threading.Lock()


def box_mean(values: list[float], use: list[bool], rows: int, columns: int, ry: int, rx: int) -> list[float | None]:
    """Mean of the used cells within ``ry`` rows and ``rx`` columns of each cell (summed-area tables)."""
    width = columns + 1
    sums = [0.0] * ((rows + 1) * width)
    counts = [0] * ((rows + 1) * width)
    for row in range(rows):
        running_sum, running_count = 0.0, 0
        base, above = (row + 1) * width, row * width
        for column in range(columns):
            cell = row * columns + column
            if use[cell]:
                running_sum += values[cell]
                running_count += 1
            sums[base + column + 1] = sums[above + column + 1] + running_sum
            counts[base + column + 1] = counts[above + column + 1] + running_count
    result: list[float | None] = []
    for row in range(rows):
        top, bottom = max(0, row - ry), min(rows, row + ry + 1)
        for column in range(columns):
            left, right = max(0, column - rx), min(columns, column + rx + 1)
            a, b, c, d = top * width + left, top * width + right, bottom * width + left, bottom * width + right
            count = counts[d] - counts[b] - counts[c] + counts[a]
            result.append((sums[d] - sums[b] - sums[c] + sums[a]) / count if count else None)
    return result


def _radius_cells(latitude_axis: list[float], longitude_axis: list[float], radius_km: float) -> tuple[int, int]:
    middle = math.radians((latitude_axis[0] + latitude_axis[-1]) / 2)
    row_km = abs(latitude_axis[-1] - latitude_axis[0]) / max(1, len(latitude_axis) - 1) * 111.2
    column_km = abs(longitude_axis[-1] - longitude_axis[0]) / max(1, len(longitude_axis) - 1) * 111.2 * math.cos(middle)
    return max(1, round(radius_km / max(row_km, 1e-6))), max(1, round(radius_km / max(column_km, 1e-6)))


def _smooth(values: list[float | None], rows: int, columns: int) -> list[float | None]:
    """A 3 × 3 mean over cells that have a value, so single-cell model noise does not mark a spot."""
    use = [value is not None for value in values]
    means = box_mean([value or 0.0 for value in values], use, rows, columns, 1, 1)
    return [mean if ok else None for mean, ok in zip(means, use)]


def scores(surface: list[float | None], previous: list[float | None] | None, thermocline: list[float | None] | None,
           bottoms: list[float | None], rows: int, columns: int, ry: int, rx: int, min_cells: int = 1,
           near_shore: list[bool] | None = None) -> dict[str, list[float | None]]:
    """Per-cell scores (°F; negative upwelling, positive downwelling) and what they are made of.

    ``surface`` and ``previous`` (24 h earlier) are °C, ``thermocline`` tops and
    ``bottoms`` metres, ``None`` where unknown. ``ry``/``rx`` is the surroundings'
    reach in rows and columns. Marked patches smaller than ``min_cells``, or with
    no cell in ``near_shore`` (when given), are dropped.
    """
    cells = rows * columns
    open_water = [surface[cell] is not None and bottoms[cell] is not None and bottoms[cell] >= MIN_WATER_DEPTH_METERS for cell in range(cells)]
    surrounding = box_mean([value or 0.0 for value in surface], open_water, rows, columns, ry, rx)
    anomaly = _smooth([surface[cell] - surrounding[cell] if open_water[cell] and surrounding[cell] is not None else None for cell in range(cells)], rows, columns)
    change: list[float | None] = [None] * cells
    if previous is not None:
        change = _smooth([surface[cell] - previous[cell] if open_water[cell] and previous[cell] is not None else None for cell in range(cells)], rows, columns)
    shift: list[float | None] = [None] * cells
    if thermocline is not None:
        has = [open_water[cell] and thermocline[cell] is not None for cell in range(cells)]
        typical = box_mean([value or 0.0 for value in thermocline], has, rows, columns, ry, rx)
        shift = [thermocline[cell] - typical[cell] if has[cell] and typical[cell] is not None else None for cell in range(cells)]
    raw: list[float | None] = [None] * cells
    for cell in range(cells):
        if anomaly[cell] is None:
            continue
        contrast = anomaly[cell] * 1.8
        moved = change[cell] * 1.8 if change[cell] is not None else 0.0
        deeper = shift[cell] * FEET_PER_METER if shift[cell] is not None else 0.0
        up = -contrast + CHANGE_WEIGHT * max(0.0, -moved)
        down = contrast + CHANGE_WEIGHT * max(0.0, moved) + max(0.0, deeper - THERMOCLINE_SHIFT_FREE_FEET) / THERMOCLINE_FEET_PER_F
        if -contrast >= MIN_CONTRAST_F and up >= MIN_SCORE_F:
            raw[cell] = -min(up, SCORE_LIMIT_F)
        elif contrast > -0.5 and (contrast >= MIN_CONTRAST_F or deeper >= DEEPER_THERMOCLINE_MIN_FEET) and down >= MIN_SCORE_F:
            raw[cell] = min(down, SCORE_LIMIT_F)
    marked = _keep_shore_patches(raw, rows, columns, min_cells, near_shore)
    return {"score": marked, "surrounding": surrounding, "anomaly": anomaly, "change": change, "shift": shift}


def _keep_shore_patches(score: list[float | None], rows: int, columns: int, min_cells: int, near_shore: list[bool] | None) -> list[float | None]:
    """Keep connected patches (upwelling or downwelling) of at least ``min_cells`` cells that reach the shore."""
    kept: list[float | None] = [None] * len(score)
    seen = bytearray(len(score))
    for start in range(len(score)):
        if score[start] is None or seen[start]:
            continue
        upwelling = score[start] < 0
        patch, stack = [], [start]
        seen[start] = 1
        while stack:
            cell = stack.pop()
            patch.append(cell)
            row, column = divmod(cell, columns)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    y, x = row + dy, column + dx
                    if (dy or dx) and 0 <= y < rows and 0 <= x < columns:
                        other = y * columns + x
                        if not seen[other] and score[other] is not None and (score[other] < 0) == upwelling:
                            seen[other] = 1
                            stack.append(other)
        if len(patch) >= min_cells and (near_shore is None or any(near_shore[cell] for cell in patch)):
            for cell in patch:
                kept[cell] = score[cell]
    return kept


def near_shore_cells(wet, rows: int, columns: int, reach_cells: int) -> list[bool]:
    """Water cells within ``reach_cells`` steps of land (or the grid's edge)."""
    distance = [-1] * (rows * columns)
    frontier = []
    for cell in range(rows * columns):
        if not wet[cell]:
            distance[cell] = 0
            frontier.append(cell)
    step = 0
    while frontier and step < reach_cells:
        step += 1
        following = []
        for cell in frontier:
            row, column = divmod(cell, columns)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    y, x = row + dy, column + dx
                    if 0 <= y < rows and 0 <= x < columns and distance[y * columns + x] < 0:
                        distance[y * columns + x] = step
                        following.append(y * columns + x)
        frontier = following
    edge = {cell for cell in range(rows * columns) if wet[cell] and (cell < columns or cell >= (rows - 1) * columns or cell % columns in (0, columns - 1))}
    return [bool(wet[cell]) and (0 < distance[cell] <= reach_cells or cell in edge) for cell in range(rows * columns)]


def _cell_km2(latitude_axis: list[float], longitude_axis: list[float]) -> float:
    middle = math.radians((latitude_axis[0] + latitude_axis[-1]) / 2)
    row_km = abs(latitude_axis[-1] - latitude_axis[0]) / max(1, len(latitude_axis) - 1) * 111.2
    column_km = abs(longitude_axis[-1] - longitude_axis[0]) / max(1, len(longitude_axis) - 1) * 111.2 * math.cos(middle)
    return max(row_km * column_km, 1e-6)


def previous_day_path(path: str) -> str | None:
    """The file of the run one day older with the same forecast hour: the same place, 24 hours earlier."""
    match = re.search(r"/(\d{4})/(\d{2})/(\d{2})/([a-z]+)\.t(\d\d)z\.(\d{8})\.", path)
    if not match:
        return None
    day = datetime.strptime(match.group(6), "%Y%m%d").replace(tzinfo=timezone.utc)
    previous = datetime.fromtimestamp(day.timestamp() - 86400, timezone.utc)
    return (path[:match.start()]
            + f"/{previous:%Y/%m/%d}/{match.group(4)}.t{match.group(5)}z.{previous:%Y%m%d}."
            + path[match.end():])


def _previous_surface(model: str, run: dict, hour: int, path: str, volume, temperature_name: str) -> list[float | None] | None:
    """The surface 24 hours before this model-hour, from the run one day older (``None`` if NOAA no longer has it)."""
    disk_path = gl_cache.path_for("models", model, run["id"], f"daybefore-f{hour:03d}-{volume.y_stride}x{volume.x_stride}-v1.bin")
    record = gl_cache.read_record(disk_path)
    if record is None:
        older = previous_day_path(path)
        if older is None:
            return None
        ny = (volume.rows - 1) * volume.y_stride + 1
        nx = (volume.columns - 1) * volume.x_stride + 1
        window = f"[0:{volume.y_stride}:{ny - 1}][0:{volume.x_stride}:{nx - 1}]"
        try:
            values = gl_cache.fetch_dods(f"{service.THREDDS}/dodsC/{older}", f"{temperature_name}[0][0:1:0]{window}")[temperature_name][1]
        except Exception:
            return None
        if len(values) != volume.cells:
            return None
        gl_cache.write_record(disk_path, {"model": model, "source": older}, {"surface": array("f", values)})
        record = ({}, {"surface": array("f", values)})
    surface = record[1].get("surface")
    if surface is None or len(surface) != volume.cells:
        return None
    return [float(value) if math.isfinite(value) and -5 <= value <= 45 else None for value in surface]


def _bottoms(model: str, volume, temperature: array) -> list[float | None]:
    """Water depth per cell: the model bathymetry, or failing that the deepest level with water."""
    bottoms = service._volume_bottom_depths(model, volume)
    if bottoms is not None:
        return [value if volume.wet[cell] else None for cell, value in enumerate(bottoms)]
    cells, result = volume.cells, []
    for cell in range(cells):
        deepest = None
        if volume.wet[cell]:
            for level, depth in enumerate(volume.depths):
                value = temperature[level * cells + cell]
                if math.isfinite(value) and -5 <= value <= 45:
                    deepest = depth
        result.append(deepest)
    return result


def model_scores(model: str, forecast_hour: int) -> dict:
    """Scores for one lake's model-hour, worked out once and kept on disk with the run.

    Without the day-before surface (NOAA briefly unreachable), the scores are
    kept in memory only and worked out again after a few minutes.
    """
    run, hour, path, variables, volume = service._model_volume("temperature", model, forecast_hour)
    name = variables["temperature"]
    disk_path = gl_cache.path_for("models", model, run["id"], f"upwelling-f{hour:03d}-{volume.y_stride}x{volume.x_stride}-v{UPWELLING_RENDER_VERSION}.bin")
    fields = ("score", "surface", "surrounding", "anomaly", "change", "shift")
    with _lock:
        remembered = _partial_scores.get(str(disk_path))
    record = remembered[1] if remembered and time.time() < remembered[0] else gl_cache.read_record(disk_path)
    if record is None or any(len(record[1].get(field, ())) != volume.cells for field in fields):
        temperature = volume.variables[name]
        surface = [float(value) if volume.wet[cell] and math.isfinite(value) and -5 <= value <= 45 else None for cell, value in enumerate(volume.level(name, 0))]
        previous = _previous_surface(model, run, hour, path, volume, name)
        thermocline = service._thermocline_depths(model, run, hour, variables, volume)
        ry, rx = _radius_cells(volume.latitude_axis, volume.longitude_axis, SURROUNDING_RADIUS_KM)
        cell_km2 = _cell_km2(volume.latitude_axis, volume.longitude_axis)
        min_cells = max(1, math.ceil(MIN_PATCH_KM2 / cell_km2))
        near_shore = near_shore_cells(volume.wet, volume.rows, volume.columns, max(1, round(SHORE_REACH_KM / math.sqrt(cell_km2))))
        result = scores(surface, previous, thermocline, _bottoms(model, volume, temperature), volume.rows, volume.columns, ry, rx, min_cells, near_shore)
        result["surface"] = surface
        packed = {field: array("f", (math.nan if value is None else value for value in result[field])) for field in fields}
        record = ({"hasChange": previous is not None}, packed)
        if previous is not None:
            gl_cache.write_record(disk_path, {"model": model, "hasChange": True}, packed)
        else:
            with _lock:
                _partial_scores[str(disk_path)] = (time.time() + PARTIAL_RETRY_SECONDS, record)
                while len(_partial_scores) > 64:
                    del _partial_scores[next(iter(_partial_scores))]
    header, arrays = record
    return {
        "run": run, "hour": hour, "path": path, "volume": volume, "hasChange": bool(header.get("hasChange")),
        **{field: [None if math.isnan(value) else float(value) for value in arrays[field]] for field in fields},
    }


def _render_input(model: str, forecast_hour: int) -> tuple[dict, dict]:
    found = model_scores(model, forecast_hour)
    volume, run, hour, path = found["volume"], found["run"], found["hour"], found["path"]
    score = found["score"]
    valid = [value is not None for value in score]
    wet = [bool(value) for value in volume.wet]
    ny, nx, _ = service._regular_grid_dimensions(path)
    marked = [value for value in score if value is not None]
    metadata = {
        "model": model, "datasetUrl": f"{service.THREDDS}/dodsC/{path}", "validTime": service._valid_time_text(run, hour), "available": True,
        "run": run["id"], "selectedForecastHour": hour, "comparedWithDayBefore": found["hasChange"],
        "upwellingCells": sum(value < 0 for value in marked), "downwellingCells": sum(value > 0 for value in marked),
    }
    render_input = {
        "model": model,
        "validTime": metadata["validTime"],
        "grid": ScalarGrid([value if value is not None else 0.0 for value in score], valid, volume.rows, volume.columns, volume.y_stride, volume.x_stride),
        "axes": GridAxes.from_axes(volume.latitude_axis, volume.longitude_axis, volume.y_stride, volume.x_stride),
        "water": service._water_mask_or_none(model, path, ny, nx) or service._coarse_water_mask(wet, volume.rows, volume.columns, volume.y_stride, volume.x_stride),
        # Everything not marked is left clear.
        "noData": [is_wet and not ok for is_wet, ok in zip(wet, valid)],
    }
    return render_input, metadata


def upwelling_rasters(forecast_hour: int, resolution: int, models: tuple[str, ...] = service.MODELS, scale: tuple[float, float] | None = None) -> dict:
    """Upwelling (blue) and downwelling (red) for every lake; clear where neither. ``scale`` is ignored: the colours are fixed."""
    cache_key = ("upwelling", UPWELLING_RENDER_VERSION, service.THERMOCLINE_RASTER_RENDER_VERSION, service._data_key(models, forecast_hour), resolution, models, service._cache_bucket())
    return service._shared_payload(_payload_cache, cache_key, lambda: _build(forecast_hour, resolution, models), MAX_PAYLOAD_CACHE_ENTRIES)


def _build(forecast_hour: int, resolution: int, models: tuple[str, ...]) -> dict:
    inputs, model_metadata = [], []
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        futures = {model: executor.submit(_render_input, model, forecast_hour) for model in models}
        for model in models:
            try:
                render_input, metadata = futures[model].result()
                inputs.append(render_input)
                model_metadata.append(metadata)
            except Exception as error:
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "models": model_metadata,
        "minScoreF": -SCORE_LIMIT_F, "maxScoreF": SCORE_LIMIT_F, "thresholdF": MIN_SCORE_F,
    }
    rasters = []
    drawable = [item for item in inputs if any(item["grid"].valid)]
    if drawable:
        rasters = service._render_rasters(drawable, UPWELLING_COLOR_STOPS, -SCORE_LIMIT_F, SCORE_LIMIT_F, resolution)
    return {"rasters": rasters, "metadata": metadata}


def upwelling_value(forecast_hour: int, latitude: float, longitude: float, models: tuple[str, ...] = service.MODELS) -> dict:
    """Upwelling or downwelling at a point, with what it is based on."""
    for model in models:
        try:
            found = model_scores(model, forecast_hour)
        except Exception:
            continue
        volume = found["volume"]
        cell = service._nearest_wet_cell(volume, latitude, longitude)
        if cell is None:
            continue
        score = found["score"][cell]
        return {
            "available": True, "model": model, "validTime": service._valid_time_text(found["run"], found["hour"]),
            "kind": None if score is None else ("upwelling" if score < 0 else "downwelling"),
            "strengthF": None if score is None else abs(score),
            "surfaceC": found["surface"][cell], "surroundingC": found["surrounding"][cell],
            "change24hC": found["change"][cell], "thermoclineShiftMeters": found["shift"][cell],
            "openWater": found["anomaly"][cell] is not None, "comparedWithDayBefore": found["hasChange"],
        }
    return {"available": False}


def clear_memory() -> None:
    with _lock:
        _payload_cache.clear()
        _partial_scores.clear()
