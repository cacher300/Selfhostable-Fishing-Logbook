"""NOAA Great Lakes OFS data service for the fishing map.

The CO-OPS catalog currently publishes FVCOM ``fields`` files (unstructured
nodes/faces), not the older regulargrid files. This module discovers those
files on every cache refresh and reads only decimated OPeNDAP ASCII slices.
"""

from __future__ import annotations

import base64
import bisect
import math
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO

from PIL import Image

THREDDS = "https://opendap.co-ops.nos.noaa.gov/thredds"
GREAT_LAKES_MODELS = {"superior": "LSOFS", "michigan": "LMHOFS", "huron": "LMHOFS", "erie": "LEOFS", "ontario": "LOOFS"}
MODELS = tuple(dict.fromkeys(GREAT_LAKES_MODELS.values()))
CACHE_SECONDS = 600
_catalog_cache: dict[str, object] = {"expires": 0.0, "runs": {}}
_raster_cache: dict[tuple, dict] = {}
_thermocline_raster_cache: dict[tuple, dict] = {}
TEMPERATURE_RASTER_RENDER_VERSION = 2
THERMOCLINE_RASTER_RENDER_VERSION = 13
THERMOCLINE_MIN_DEPTH_METERS = 3.048  # 10 ft below the surface
THERMOCLINE_BOTTOM_CLEARANCE_METERS = 3.048  # Never classify the final 10 ft as a thermocline.
THERMOCLINE_WINDOW_METERS = 15.0
THERMOCLINE_SPATIAL_OUTLIER_METERS = 12.0
_temperature_field_cache: dict[tuple, list[dict]] = {}
_current_payload_cache: dict[tuple, dict] = {}


def _get(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Fishing-Logbook-GreatLakes/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def _catalog_refs(url: str) -> list[tuple[str, str]]:
    root = ET.fromstring(_get(url))
    return [(node.attrib.get("{http://www.w3.org/1999/xlink}href", ""), node.attrib.get("name", "")) for node in root.iter() if node.tag.endswith("catalogRef")]


def _latest_day_catalog(model: str) -> str:
    root = f"{THREDDS}/catalog/NOAA/{model}/MODELS"
    year_url = urllib.parse.urljoin(f"{root}/catalog.xml", max(_catalog_refs(f"{root}/catalog.xml"), key=lambda item: item[1])[0])
    month_url = urllib.parse.urljoin(year_url, max(_catalog_refs(year_url), key=lambda item: item[1])[0])
    # The newest calendar directory can exist before files are published.
    for href, _ in sorted(_catalog_refs(month_url), key=lambda item: item[1], reverse=True):
        candidate = urllib.parse.urljoin(month_url, href)
        if re.search(r"\.(?:regulargrid|fields)\.f\d+\.nc", _get(candidate)):
            return candidate
    raise RuntimeError("Newest NOAA day directory has no forecast output yet")


def _discover_model(model: str) -> dict:
    root = ET.fromstring(_get(_latest_day_catalog(model)))
    files = []
    for node in root.iter():
        path = node.attrib.get("urlPath", "")
        match = re.search(r"\.t(\d\d)z\.(\d{8})\.(regulargrid|fields)\.f(\d+)\.nc$", path)
        if match:
            # Prefer the requested regular-grid output when the newest run
            # also retains legacy unstructured fields files.
            files.append((int(match.group(2)), int(match.group(1)), int(match.group(4)), match.group(3) == "regulargrid", path))
    if not files:
        raise RuntimeError("No forecast fields dataset found in newest NOAA catalog run")
    newest_date, newest_cycle = max((date, cycle) for date, cycle, _, _, _ in files)
    latest = [entry for entry in files if entry[:2] == (newest_date, newest_cycle)]
    regular = [entry for entry in latest if entry[3]]
    selected = regular or latest
    return {"files": {hour: path for _, _, hour, _, path in selected}, "date": newest_date, "cycle": newest_cycle}


def discovered_runs(models: tuple[str, ...] = MODELS) -> dict[str, dict]:
    cached = _catalog_cache["runs"]  # type: ignore[assignment]
    if time.monotonic() >= float(_catalog_cache["expires"]):
        cached = {}
        _catalog_cache["runs"] = cached
    missing = [model for model in models if model not in cached]
    # Each lake has an independent catalog. Discover them concurrently so a
    # cold cache is bounded by the slowest NOAA catalog rather than their sum.
    if missing:
        with ThreadPoolExecutor(max_workers=len(missing)) as executor:
            futures = {model: executor.submit(_discover_model, model) for model in missing}
            for model in missing:
                future = futures[model]
                try:
                    cached[model] = future.result()
                except Exception as error:
                    cached[model] = {"error": str(error)}
    _catalog_cache["expires"] = time.monotonic() + CACHE_SECONDS
    return {model: cached[model] for model in models}


def _ascii(path: str, expression: str) -> str:
    return _get(f"{THREDDS}/dodsC/{path}.ascii?{urllib.parse.quote(expression, safe=',')}")


def _numbers(text: str, variable: str) -> list[float]:
    match = re.search(rf"\n{re.escape(variable)}(?:\[[^\n]+\])*\n(.*?)(?=\n\w+(?:\[|$)|\Z)", text, re.S)
    if not match:
        return []
    content = re.sub(r"(?:\[\d+\])+\s*,", "", match.group(1))
    return [float(value) for value in re.findall(r"(?<!\[)\b-?(?:\d+\.\d*|\d*\.\d+|\d+)(?:[Ee][+-]?\d+)?", content)]


def _metadata(path: str) -> dict[str, str]:
    dds = _get(f"{THREDDS}/dodsC/{path}.dds")
    def available(*candidates: str) -> str:
        for candidate in candidates:
            if re.search(rf"\b{candidate}\[", dds):
                return candidate
        raise RuntimeError(f"NOAA dataset has none of: {', '.join(candidates)}")
    variables = {"temperature": available("temp", "temperature"), "u": available("u_eastward", "u"), "v": available("v_northward", "v")}
    for label, variable in variables.items():
        if not re.search(rf"\b{variable}\[", dds):
            raise RuntimeError(f"NOAA dataset has no {label} variable")
    return variables


def _layer_for_depth(depth: int) -> int:
    # FVCOM has 20 terrain-following sigma layers; physical depth varies by location.
    return {0: 19, 5: 17, 10: 15, 20: 11}.get(depth, 19)


def _great_lakes_longitude(value: float) -> float:
    # CO-OPS regular-grid files may use positive-west longitudes while FVCOM
    # fields use 0–360 east. Both conventions need Leaflet's -180–180 range.
    if value > 180:
        return value - 360
    return -value if value > 0 else value


def _regular_grid_dimensions(path: str) -> tuple[int, int, list[float]]:
    dds = _get(f"{THREDDS}/dodsC/{path}.dds")
    match = re.search(r"Latitude\[ny = (\d+)\]\[nx = (\d+)\]", dds)
    depth_match = re.search(r"Depth\[Depth = (\d+)\]", dds)
    if not match or not depth_match:
        return 0, 0, []
    depths = _numbers(_ascii(path, f"Depth[0:1:{int(depth_match.group(1)) - 1}]"), "Depth")
    return int(match.group(1)), int(match.group(2)), depths


def _field_dimensions(path: str) -> tuple[int, int]:
    dds = _get(f"{THREDDS}/dodsC/{path}.dds")
    node = re.search(r"Float32 lat\[node = (\d+)\]", dds)
    face = re.search(r"Float32 latc\[nele = (\d+)\]", dds)
    if not node or not face:
        raise RuntimeError("NOAA fields dataset has no FVCOM node/face coordinates")
    return int(node.group(1)), int(face.group(1))


def _sample_model(model: str, kind: str, forecast_hour: int, depth: int) -> tuple[list[dict], dict]:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    available_hour = min(hours, key=lambda candidate: abs(candidate - forecast_hour))
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


def great_lakes_payload(kind: str, forecast_hour: int, depth: int, models: tuple[str, ...] = MODELS) -> dict:
    cache_key = (forecast_hour, depth, models, int(time.monotonic() // CACHE_SECONDS))
    if kind == "currents" and cache_key in _current_payload_cache:
        return _current_payload_cache[cache_key]
    selected_models, data, model_metadata, fields = models, [], [], []

    def load_model(model: str) -> tuple[list[dict], dict, dict | None]:
        points, metadata = _sample_model(model, kind, forecast_hour, depth)
        field = _current_grid_field(model, forecast_hour, depth) if kind == "currents" else None
        return points, metadata, field

    with ThreadPoolExecutor(max_workers=len(selected_models)) as executor:
        futures = {model: executor.submit(load_model, model) for model in selected_models}
        for model in selected_models:
            try:
                points, metadata, field = futures[model].result()
                data.extend(points)
                model_metadata.append(metadata)
                if field:
                    fields.append(field)
            except Exception as error:  # One unavailable lake must not hide the others.
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "requestedDepthMeters": depth, "depthNote": "FVCOM sigma-layer selection; physical depth varies with local bathymetry.", "models": model_metadata}
    if kind == "currents" and data:
        speeds = [float(point["speed"]) for point in data if math.isfinite(point.get("speed", math.nan))]
        if speeds:
            metadata["minSpeedMetersPerSecond"] = min(speeds)
            metadata["maxSpeedMetersPerSecond"] = max(speeds)
    payload = {"data": data, "fields": fields if kind == "currents" else None, "metadata": metadata}
    if kind == "currents":
        _current_payload_cache[cache_key] = payload
    return payload


def _temperature_rgba(value: float, minimum: float = 0, maximum: float = 30) -> tuple[int, int, int, int]:
    stops = ((0.00, (20, 70, 210)), (0.20, (0, 105, 235)), (0.40, (0, 205, 245)), (0.55, (28, 185, 110)), (0.70, (250, 215, 40)), (0.85, (247, 130, 30)), (1.00, (220, 45, 45)))
    t = max(0.0, min(1.0, (value - minimum) / (maximum - minimum)))
    upper = next((stop for stop in stops if t <= stop[0]), stops[-1])
    lower = stops[max(0, stops.index(upper) - 1)]
    fraction = 0 if lower[0] == upper[0] else (t - lower[0]) / (upper[0] - lower[0])
    rgb = tuple(round(lower[1][index] + (upper[1][index] - lower[1][index]) * fraction) for index in range(3))
    return (*rgb, 150)


def _thermocline_rgba(depth: float, minimum: float = 0, maximum: float = 100) -> tuple[int, int, int, int]:
    stops = ((0.00, (0, 205, 245)), (0.25, (38, 190, 105)), (0.50, (250, 215, 40)), (0.75, (247, 130, 30)), (1.00, (220, 45, 45)))
    t = max(0.0, min(1.0, (depth - minimum) / (maximum - minimum)))
    upper = next((stop for stop in stops if t <= stop[0]), stops[-1])
    lower = stops[max(0, stops.index(upper) - 1)]
    fraction = 0 if lower[0] == upper[0] else (t - lower[0]) / (upper[0] - lower[0])
    rgb = tuple(round(lower[1][index] + (upper[1][index] - lower[1][index]) * fraction) for index in range(3))
    return (*rgb, 170)


def _sustained_thermocline_pair(profile: list[tuple[float, float]]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Find the strongest cooling trend that persists over a useful depth span."""
    candidates: list[tuple[tuple[float, float], tuple[float, float]]] = []
    bottom_depth = profile[-1][0]
    for index, shallow in enumerate(profile[:-1]):
        if shallow[0] < THERMOCLINE_MIN_DEPTH_METERS:
            continue
        for deep in profile[index + 1:]:
            if deep[0] - shallow[0] < THERMOCLINE_WINDOW_METERS:
                continue
            if deep[0] <= bottom_depth - THERMOCLINE_BOTTOM_CLEARANCE_METERS:
                candidates.append((shallow, deep))
            break
    if not candidates:
        return None
    return max(candidates, key=lambda pair: abs(pair[1][1] - pair[0][1]) / (pair[1][0] - pair[0][0]))


def _continuous_thermocline_depth(profile: list[tuple[float, float]], pair: tuple[tuple[float, float], tuple[float, float]]) -> float:
    """Locate the cooling transition within the selected sustained window."""
    shallow_depth, deep_depth = pair[0][0], pair[1][0]
    segments = [
        ((upper[0] + lower[0]) / 2, abs(lower[1] - upper[1]))
        for upper, lower in zip(profile, profile[1:])
        if upper[0] >= shallow_depth and lower[0] <= deep_depth and lower[0] > upper[0]
    ]
    total_cooling = sum(cooling for _, cooling in segments)
    if total_cooling <= 0:
        return (shallow_depth + deep_depth) / 2
    return sum(midpoint * cooling for midpoint, cooling in segments) / total_cooling


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float] | None:
    """Solve a small dense system with partial pivoting."""
    size = len(vector)
    augmented = [row[:] + [value] for row, value in zip(matrix, vector)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-10:
            return None
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [value - factor * reference for value, reference in zip(augmented[row], augmented[column])]
    return [augmented[row][-1] for row in range(size)]


def _polynomial_thermocline_fit(profile: list[tuple[float, float]], pair: tuple[tuple[float, float], tuple[float, float]]) -> dict | None:
    """Fit the selected transition and return its normalized cubic details."""
    shallow_depth, deep_depth = pair[0][0], pair[1][0]
    span = deep_depth - shallow_depth
    points = [(depth, temperature) for depth, temperature in profile if shallow_depth <= depth <= deep_depth]
    degree = min(3, len(points) - 1)
    if degree < 2 or span <= 0:
        return None
    normalized = [((depth - shallow_depth) / span, temperature) for depth, temperature in points]
    powers = range(degree + 1)
    matrix = [[sum(x ** (row + column) for x, _ in normalized) for column in powers] for row in powers]
    vector = [sum(temperature * x ** row for x, temperature in normalized) for row in powers]
    coefficients = _solve_linear_system(matrix, vector)
    if not coefficients:
        return None
    # Evaluate only the interior of the window so the fitted derivative cannot
    # simply choose either discrete model-layer endpoint.
    candidates = [0.1 + index * 0.8 / 160 for index in range(161)]
    derivative = lambda x: sum(order * coefficients[order] * x ** (order - 1) for order in range(1, len(coefficients))) / span
    best = max(candidates, key=lambda x: -derivative(x))
    return {"depthMeters": shallow_depth + best * span, "shallowDepthMeters": shallow_depth, "deepDepthMeters": deep_depth, "coefficients": coefficients}


def _polynomial_thermocline_depth(profile: list[tuple[float, float]], pair: tuple[tuple[float, float], tuple[float, float]]) -> float:
    """Use the steepest interior derivative of a cubic fitted to the transition."""
    fit = _polynomial_thermocline_fit(profile, pair)
    return float(fit["depthMeters"]) if fit else _continuous_thermocline_depth(profile, pair)


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


def _regular_temperature_raster(model: str, forecast_hour: int, depth: int, resolution: int) -> tuple[dict, dict, dict]:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    available_hour = min(hours, key=lambda candidate: abs(candidate - forecast_hour))
    path = hours[available_hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx:
        raise RuntimeError("Newest model run has no NOAA regular-grid temperature output")
    variables = _metadata(path)
    layer = min(range(len(depths)), key=lambda index: abs(depths[index] - depth)) if depths else 0
    # Regular-grid metadata confirms a rectilinear output. Request a dense,
    # bounded source grid (not every NetCDF cell) then bilinearly resample it.
    target_x, target_y = max(96, min(resolution, 512)), max(64, min(round(resolution * ny / nx), 320))
    x_stride, y_stride = max(1, math.ceil((nx - 1) / (target_x - 1))), max(1, math.ceil((ny - 1) / (target_y - 1)))
    query = f"Latitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],Longitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],mask[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],{variables['temperature']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]"
    raw = _ascii(path, query)
    lat, lon, mask, values = _numbers(raw, "Latitude"), _numbers(raw, "Longitude"), _numbers(raw, "mask"), _numbers(raw, variables["temperature"])
    cols = (nx - 1) // x_stride + 1
    rows = (ny - 1) // y_stride + 1
    if not (len(lat) == len(lon) == len(mask) == len(values) == rows * cols):
        raise RuntimeError("NOAA regular-grid subset dimensions were incomplete")
    longitudes = [_great_lakes_longitude(value) for value in lon]
    valid = [wet > 0 and math.isfinite(temp) and -5 <= temp <= 45 for wet, temp in zip(mask, values)]
    water = [index for index, item in enumerate(valid) if item]
    if not water:
        raise RuntimeError("NOAA model returned no valid water cells")
    # The image still includes land pixels (as transparent). Its geographic
    # bounds must therefore use the entire NOAA grid, not just wet cells;
    # otherwise Leaflet compresses the raster into the lake centre.
    south, north = min(lat), max(lat)
    west, east = min(longitudes), max(longitudes)
    # Supersample the raster so the NOAA water-mask edge is not exposed as
    # one large step per model cell at close map zooms.
    shoreline_scale = 3
    out_width, out_height = (cols - 1) * shoreline_scale + 1, (rows - 1) * shoreline_scale + 1
    image = Image.new("RGBA", (out_width, out_height), (0, 0, 0, 0))
    pixels = image.load()
    for out_y in range(out_height):
        source_y, row = out_y / shoreline_scale, min(rows - 2, out_y // shoreline_scale)
        fy = source_y - row
        for out_x in range(out_width):
            source_x, column = out_x / shoreline_scale, min(cols - 2, out_x // shoreline_scale)
            fx = source_x - column
            indices = (row * cols + column, row * cols + column + 1, (row + 1) * cols + column, (row + 1) * cols + column + 1)
            weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
            water_corners = [position for position, index in enumerate(indices) if valid[index]]
            # Permit shoreline coverage whenever NOAA supplies at least one
            # water corner. Fully land cells remain transparent, while valid
            # water-corner weights are renormalized below.
            if not water_corners:
                continue
            total_weight = sum(weights[position] for position in water_corners)
            temperature = (
                sum(values[indices[position]] * weights[position] for position in water_corners) / total_weight
                if total_weight > 0 else values[indices[water_corners[0]]]
            )
            red, green, blue, alpha = _temperature_rgba(temperature)
            pixels[out_x, out_height - 1 - out_y] = (red, green, blue, round(alpha * total_weight))
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    valid_time = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
    metadata = {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": datetime.fromtimestamp(valid_time, timezone.utc).isoformat().replace("+00:00", "Z"), "available": True, "variables": variables, "selectedForecastHour": available_hour, "selectedDepthMeters": depths[layer] if depths else depth}
    water_temperatures = [float(values[index]) for index in water]
    raster = {"imageUrl": f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}", "bounds": [[south, west], [north, east]], "minC": min(water_temperatures), "maxC": max(water_temperatures), "validTime": metadata["validTime"], "model": model}
    field = {"model": model, "rows": rows, "columns": cols, "latitudeAxis": [lat[row * cols] for row in range(rows)], "longitudeAxis": [longitudes[column] for column in range(cols)], "mask": valid, "temperatureC": values, "depthMeters": metadata["selectedDepthMeters"]}
    return raster, metadata, field


def great_lakes_temperature_rasters(forecast_hour: int, depth: int, resolution: int, models: tuple[str, ...] = MODELS) -> dict:
    cache_key = (TEMPERATURE_RASTER_RENDER_VERSION, forecast_hour, depth, resolution, models, int(time.monotonic() // CACHE_SECONDS))
    # The click lookup reuses the dense field generated with the raster. A
    # raster-only cache entry cannot answer those point lookups, so rebuild it.
    if cache_key in _raster_cache and cache_key in _temperature_field_cache:
        return _raster_cache[cache_key]
    selected_models, rasters, model_metadata, fields = models, [], [], []
    # NOAA serves one independent grid per lake. Fetch and rasterize those
    # grids in parallel so first paint does not wait four times in sequence.
    with ThreadPoolExecutor(max_workers=len(selected_models)) as executor:
        futures = {model: executor.submit(_regular_temperature_raster, model, forecast_hour, depth, resolution) for model in selected_models}
        for model in selected_models:
            future = futures[model]
            try:
                raster, metadata, field = future.result()
                rasters.append(raster)
                model_metadata.append(metadata)
                fields.append(field)
            except Exception as error:
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "requestedDepthMeters": depth, "models": model_metadata}
    if rasters:
        metadata["minC"] = min(float(raster["minC"]) for raster in rasters)
        metadata["maxC"] = max(float(raster["maxC"]) for raster in rasters)
    payload = {"rasters": rasters, "metadata": metadata}
    _raster_cache[cache_key] = payload
    _temperature_field_cache[cache_key] = fields
    return payload


def _regular_thermocline_raster(model: str, forecast_hour: int, resolution: int) -> tuple[dict, dict]:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    available_hour = min(hours, key=lambda candidate: abs(candidate - forecast_hour))
    path = hours[available_hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx or len(depths) < 2:
        raise RuntimeError("Newest model run has no NOAA regular-grid temperature profile output")
    variables = _metadata(path)
    target_x, target_y = max(96, min(resolution, 512)), max(64, min(round(resolution * ny / nx), 320))
    x_stride, y_stride = max(1, math.ceil((nx - 1) / (target_x - 1))), max(1, math.ceil((ny - 1) / (target_y - 1)))
    query = f"Latitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],Longitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],mask[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],{variables['temperature']}[0][0:1:{len(depths) - 1}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]"
    raw = _ascii(path, query)
    lat, lon, mask, temperatures = _numbers(raw, "Latitude"), _numbers(raw, "Longitude"), _numbers(raw, "mask"), _numbers(raw, variables["temperature"])
    cols, rows = (nx - 1) // x_stride + 1, (ny - 1) // y_stride + 1
    cells = rows * cols
    if not (len(lat) == len(lon) == len(mask) == cells and len(temperatures) == len(depths) * cells):
        raise RuntimeError("NOAA thermocline profile subset dimensions were incomplete")
    thermoclines: list[float | None] = []
    for cell in range(cells):
        if mask[cell] <= 0:
            thermoclines.append(None)
            continue
        profile = [(depth, temperatures[layer * cells + cell]) for layer, depth in enumerate(depths) if math.isfinite(temperatures[layer * cells + cell]) and -5 <= temperatures[layer * cells + cell] <= 45]
        pair = _sustained_thermocline_pair(profile)
        if not pair:
            thermoclines.append(None)
            continue
        thermoclines.append(_polynomial_thermocline_depth(profile, pair))
    thermoclines = _filter_spatial_thermocline_outliers(thermoclines, rows, cols)
    valid = [value is not None for value in thermoclines]
    if not any(valid):
        raise RuntimeError("NOAA model returned no thermocline cells")
    thermocline_depths = [float(value) for value in thermoclines if value is not None]
    color_minimum, color_maximum = min(thermocline_depths), max(thermocline_depths)
    if math.isclose(color_minimum, color_maximum):
        color_minimum, color_maximum = color_minimum - 0.5, color_maximum + 0.5
    longitudes = [_great_lakes_longitude(value) for value in lon]
    south, north, west, east = min(lat), max(lat), min(longitudes), max(longitudes)
    shoreline_scale = 3
    out_width, out_height = (cols - 1) * shoreline_scale + 1, (rows - 1) * shoreline_scale + 1
    image = Image.new("RGBA", (out_width, out_height), (0, 0, 0, 0))
    pixels = image.load()
    for out_y in range(out_height):
        source_y, row = out_y / shoreline_scale, min(rows - 2, out_y // shoreline_scale)
        fy = source_y - row
        for out_x in range(out_width):
            source_x, column = out_x / shoreline_scale, min(cols - 2, out_x // shoreline_scale)
            fx = source_x - column
            indices = (row * cols + column, row * cols + column + 1, (row + 1) * cols + column, (row + 1) * cols + column + 1)
            weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
            corners = [position for position, index in enumerate(indices) if valid[index]]
            if not corners:
                continue
            total = sum(weights[position] for position in corners)
            value = sum(thermoclines[indices[position]] * weights[position] for position in corners) / total if total else thermoclines[indices[corners[0]]]
            red, green, blue, alpha = _thermocline_rgba(float(value), color_minimum, color_maximum)
            # The bilinear wet-corner weight is an anti-aliased shoreline
            # mask. Fully land pixels remain transparent and no temperature
            # values are ever interpolated from land cells.
            pixels[out_x, out_height - 1 - out_y] = (red, green, blue, round(alpha * total))
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    valid_time = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
    metadata = {"model": model, "datasetUrl": f"{THREDDS}/dodsC/{path}", "validTime": datetime.fromtimestamp(valid_time, timezone.utc).isoformat().replace("+00:00", "Z"), "available": True, "selectedForecastHour": available_hour}
    raster = {"imageUrl": f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}", "bounds": [[south, west], [north, east]], "minDepthMeters": min(thermocline_depths), "maxDepthMeters": max(thermocline_depths), "validTime": metadata["validTime"], "model": model}
    return raster, metadata


def great_lakes_thermocline_rasters(forecast_hour: int, resolution: int, models: tuple[str, ...] = MODELS) -> dict:
    cache_key = (THERMOCLINE_RASTER_RENDER_VERSION, forecast_hour, resolution, models, int(time.monotonic() // CACHE_SECONDS))
    if cache_key in _thermocline_raster_cache:
        return _thermocline_raster_cache[cache_key]
    rasters, model_metadata = [], []
    with ThreadPoolExecutor(max_workers=len(models)) as executor:
        futures = {model: executor.submit(_regular_thermocline_raster, model, forecast_hour, resolution) for model in models}
        for model in models:
            try:
                raster, metadata = futures[model].result()
                rasters.append(raster)
                model_metadata.append(metadata)
            except Exception as error:
                model_metadata.append({"model": model, "datasetUrl": "", "validTime": None, "available": False, "error": str(error)})
    metadata = {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "forecastHour": forecast_hour, "models": model_metadata}
    if rasters:
        metadata["minDepthMeters"] = min(float(raster["minDepthMeters"]) for raster in rasters)
        metadata["maxDepthMeters"] = max(float(raster["maxDepthMeters"]) for raster in rasters)
    payload = {"rasters": rasters, "metadata": metadata}
    _thermocline_raster_cache[cache_key] = payload
    return payload


def _temperature_at(field: dict, latitude: float, longitude: float) -> float | None:
    ys, xs = field["latitudeAxis"], field["longitudeAxis"]
    if not (min(ys[0], ys[-1]) <= latitude <= max(ys[0], ys[-1]) and min(xs[0], xs[-1]) <= longitude <= max(xs[0], xs[-1])):
        return None
    def bracket(axis: list[float], value: float) -> int:
        ascending = axis[-1] > axis[0]
        values, target = (axis, value) if ascending else ([-item for item in axis], -value)
        return max(0, min(len(axis) - 2, bisect.bisect_right(values, target) - 1))
    row, column = bracket(ys, latitude), bracket(xs, longitude)
    cols, mask, values = field["columns"], field["mask"], field["temperatureC"]
    ids = (row * cols + column, row * cols + column + 1, (row + 1) * cols + column, (row + 1) * cols + column + 1)
    wet = [index for index in ids if mask[index]]
    if not wet:
        return None
    fy, fx = (latitude - ys[row]) / (ys[row + 1] - ys[row]), (longitude - xs[column]) / (xs[column + 1] - xs[column])
    weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
    total = sum(weight for index, weight in zip(ids, weights) if mask[index])
    return sum(values[index] * weight for index, weight in zip(ids, weights) if mask[index]) / total


def great_lakes_temperature_value(forecast_hour: int, depth: int, resolution: int, latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict:
    cache_key = (TEMPERATURE_RASTER_RENDER_VERSION, forecast_hour, depth, resolution, models, int(time.monotonic() // CACHE_SECONDS))
    if cache_key not in _temperature_field_cache:
        great_lakes_temperature_rasters(forecast_hour, depth, resolution, models)
    for field in _temperature_field_cache.get(cache_key, []):
        value = _temperature_at(field, latitude, longitude)
        if value is not None:
            return {"available": True, "temperatureC": value, "depthMeters": field["depthMeters"], "model": field["model"]}
    return {"available": False}


def great_lakes_temperature_profile(forecast_hour: int, latitude: float, longitude: float, models: tuple[str, ...] = MODELS) -> dict:
    for model in models:
        run = discovered_runs((model,))[model]
        if "error" in run:
            continue
        hours = run["files"]  # type: ignore[assignment]
        available_hour = min(hours, key=lambda candidate: abs(candidate - forecast_hour))
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
        values.sort(key=lambda value: value["depthMeters"])
        profile_values = [(value["depthMeters"], value["temperatureC"]) for value in values]
        pair = _sustained_thermocline_pair(profile_values)
        fit = _polynomial_thermocline_fit(profile_values, pair) if pair else None
        thermocline = None if not pair else {
            "depthMeters": float(fit["depthMeters"]) if fit else _continuous_thermocline_depth(profile_values, pair),
            "gradientCPerMeter": abs(pair[1][1] - pair[0][1]) / (pair[1][0] - pair[0][0]),
            "shallowerDepthMeters": pair[0][0], "deeperDepthMeters": pair[1][0],
            "temperatureAboveC": pair[0][1], "temperatureBelowC": pair[1][1],
            "fit": fit
        }
        valid_time = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + available_hour * 3600
        return {"available": True, "model": model, "validTime": datetime.fromtimestamp(valid_time, timezone.utc).isoformat().replace("+00:00", "Z"), "requested": {"latitude": latitude, "longitude": longitude}, "modelLocation": {"latitude": latitudes[row], "longitude": longitudes[column]}, "values": values, "thermocline": thermocline}
    return {"available": False}


def _current_grid_field(model: str, forecast_hour: int, depth: int) -> dict:
    run = discovered_runs((model,))[model]
    if "error" in run:
        raise RuntimeError(str(run["error"]))
    hours = run["files"]  # type: ignore[assignment]
    hour = min(hours, key=lambda candidate: abs(candidate - forecast_hour))
    path = hours[hour]
    ny, nx, depths = _regular_grid_dimensions(path)
    if not ny or not nx:
        raise RuntimeError("Current run has no regular-grid velocity output")
    variables = _metadata(path)
    layer = min(range(len(depths)), key=lambda index: abs(depths[index] - depth)) if depths else 0
    y_stride, x_stride = max(1, math.ceil((ny - 1) / 119)), max(1, math.ceil((nx - 1) / 159))
    query = f"Latitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],Longitude[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],mask[0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],{variables['u']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}],{variables['v']}[0][{layer}][0:{y_stride}:{ny - 1}][0:{x_stride}:{nx - 1}]"
    raw = _ascii(path, query)
    lat, lon, mask = _numbers(raw, "Latitude"), _numbers(raw, "Longitude"), _numbers(raw, "mask")
    east, north = _numbers(raw, variables["u"]), _numbers(raw, variables["v"])
    cols, rows = (nx - 1) // x_stride + 1, (ny - 1) // y_stride + 1
    if not (len(lat) == len(lon) == len(mask) == len(east) == len(north) == rows * cols):
        raise RuntimeError("NOAA velocity-grid subset dimensions were incomplete")
    valid = [wet > 0 and all(math.isfinite(value) and abs(value) <= 10 for value in (u, v)) for wet, u, v in zip(mask, east, north)]
    valid_indices = [index for index, item in enumerate(valid) if item]
    if not valid_indices:
        raise RuntimeError("NOAA model returned no valid current cells")
    valid_time = datetime.strptime(f"{run['date']}{run['cycle']:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp() + hour * 3600
    return {"model": model, "rows": rows, "columns": cols, "latitudeAxis": [lat[row * cols] for row in range(rows)], "longitudeAxis": [_great_lakes_longitude(lon[column]) for column in range(cols)], "mask": [1 if item else 0 for item in valid], "u": east, "v": north, "depthMeters": depths[layer] if depths else depth, "validTime": datetime.fromtimestamp(valid_time, timezone.utc).isoformat().replace("+00:00", "Z")}
