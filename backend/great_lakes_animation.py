"""Forecast animations for the fishing map: a layer stepped through the next 48 hours on one colour scale.

The frames are "Now" and every 3 hours on the UTC clock (service.animation_offsets).
Each frame is the layer drawn on a colour scale shared by every frame, so a
colour means the same temperature (or thermocline depth, current speed, wave
height) in each one and the map only changes where the water does.

Finding that scale needs every frame's own range, so preparing an animation
draws each frame twice: once as usual and once on the shared scale. The
refresher prepares the surface animations in the background; others (a
deeper temperature or current level) are prepared on request, and the API
reports progress while that runs.
"""

from __future__ import annotations

import hashlib
import math
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

from . import great_lakes_cache as cache
from . import great_lakes_refresher as refresher
from . import great_lakes_service as service
from . import great_lakes_upwelling as upwelling
from . import great_lakes_waves as waves

LAYERS = ("temperature", "thermocline", "currents", "waves", "upwelling")
DEPTH_LAYERS = {"temperature", "currents"}
MODELS = service.MODELS
# Animations always cover every lake at the map's one resolution (what the refresher draws).
RESOLUTION = refresher.MAP_RESOLUTION
LAYER_ENDPOINTS = {"temperature": "temperature-raster", "thermocline": "thermocline-raster", "currents": "currents", "waves": "waves-raster", "upwelling": "upwelling-raster"}


def layer_payload(layer: str, forecast_hour: int, depth: float = 0.0, scale: tuple[float, float] | None = None) -> dict:
    """One layer drawing for every lake. ``scale`` fixes its colour range instead of fitting this time."""
    if layer == "temperature":
        return service.great_lakes_temperature_rasters(forecast_hour, depth, RESOLUTION, MODELS, scale)
    if layer == "thermocline":
        return service.great_lakes_thermocline_rasters(forecast_hour, RESOLUTION, MODELS, scale)
    if layer == "currents":
        return service.great_lakes_payload("currents", forecast_hour, depth, MODELS, scale)
    if layer == "waves":
        return waves.wave_rasters(forecast_hour, RESOLUTION, MODELS, scale)
    if layer == "upwelling":
        return upwelling.upwelling_rasters(forecast_hour, RESOLUTION, MODELS, scale)
    raise ValueError(f"Unknown layer {layer!r}")


def nearest_forecast_hour(requested: float, choices: tuple[int, ...] | None = None) -> int:
    """The served offset nearest ``requested``: a forecast choice or an animation frame."""
    return min(choices or service.served_offsets(), key=lambda value: abs(value - requested))


def data_versions(status: dict) -> dict[str, str]:
    """The version each layer's data is published under (waves come from a separate hourly model)."""
    return {layer: status["wavesVersion"] if layer == "waves" else status["version"] for layer in LAYERS}


def layer_url(layer: str, forecast_hour: int, depth: float | None, version: str) -> str:
    """An animation frame's URL on this app's Great Lakes endpoints."""
    query = {"forecastHour": forecast_hour, **({"depth": f"{depth:g}"} if depth is not None else {}),
             "resolution": RESOLUTION, "models": ",".join(MODELS), "animation": 1, "data": version}
    return f"/api/great-lakes/{LAYER_ENDPOINTS[layer]}?{urlencode(query)}"


# Each layer's (min, max) metadata, in the units the scale is given in.
RANGE_FIELDS = {
    "temperature": ("minC", "maxC"),
    "thermocline": ("minDepthMeters", "maxDepthMeters"),
    "currents": ("minSpeedMetersPerSecond", "maxSpeedMetersPerSecond"),
    "waves": ("minHeightMeters", "maxHeightMeters"),
    "upwelling": ("minScoreF", "maxScoreF"),
}
# The shared range is widened to these steps, so the hourly "Now" frame
# rarely changes it (which would redraw every frame).
SCALE_STEPS = {"temperature": 0.5, "thermocline": 1.0, "currents": 0.02, "waves": 0.1, "upwelling": 1.0}
# Speed and wave-height shading always start at still water.
ZERO_BASED = {"currents", "waves"}
# An animation request waits this long for its frames before reporting progress instead.
INDEX_WAIT_SECONDS = 3.0
MAX_JOBS = 32
SCALE_MAX_AGE_SECONDS = 12 * 3600

_scales: OrderedDict[tuple, tuple[float, float]] = OrderedDict()
_jobs: OrderedDict[tuple, "_Job"] = OrderedDict()
_lock = threading.Lock()
# Preparing draws layers, which is CPU-bound; two at a time keeps the site responsive.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="great-lakes-animation")


class _Job:
    def __init__(self, total: int) -> None:
        self.done = 0
        self.total = total
        self.result: dict | None = None
        self.error: str | None = None
        self.finished = threading.Event()


def frame_range(layer: str, metadata: dict) -> tuple[float, float] | None:
    low_field, high_field = RANGE_FIELDS[layer]
    try:
        low, high = float(metadata[low_field]), float(metadata[high_field])
    except (KeyError, TypeError, ValueError):
        return None
    return (low, high) if math.isfinite(low) and math.isfinite(high) else None


def shared_scale(layer: str, ranges: list[tuple[float, float]]) -> tuple[float, float] | None:
    """One colour range covering every frame, widened to a round step."""
    if not ranges:
        return None
    step = SCALE_STEPS[layer]
    low = 0.0 if layer in ZERO_BASED else math.floor(min(item[0] for item in ranges) / step + 1e-9) * step
    high = math.ceil(max(item[1] for item in ranges) / step - 1e-9) * step
    if layer == "thermocline":
        low = max(0.0, low)
    if high <= low:
        high = low + step
    return round(low, 4), round(high, 4)


def _depth(layer: str, depth: float) -> float | None:
    """The model level an animation is drawn at (``None`` for layers without depth)."""
    return service.snap_depth(depth, MODELS) if layer in DEPTH_LAYERS else None


def _version(layer: str) -> str:
    return data_versions(refresher.data_status(MODELS))[layer]


def _key(layer: str, depth: float | None, offsets: tuple[int, ...], version: str) -> tuple:
    return (layer, depth, offsets, version)


def _scale_path(key: tuple):
    return cache.path_for("animation", hashlib.sha1(repr(key).encode("utf-8")).hexdigest() + ".json")


def _stored_scale(key: tuple) -> tuple[float, float] | None:
    with _lock:
        scale = _scales.get(key)
    if scale is not None:
        return scale
    stored = cache.read_json(_scale_path(key))
    if isinstance(stored, dict) and isinstance(stored.get("scale"), list) and len(stored["scale"]) == 2:
        scale = (float(stored["scale"][0]), float(stored["scale"][1]))
        _remember_scale(key, scale, write=False)
        return scale
    return None


def _remember_scale(key: tuple, scale: tuple[float, float], write: bool = True) -> None:
    with _lock:
        _scales[key] = scale
        _scales.move_to_end(key)
        while len(_scales) > MAX_JOBS:
            _scales.popitem(last=False)
    if write:
        try:
            cache.write_json(_scale_path(key), {"scale": list(scale)})
        except OSError:
            pass


def _compute_scale(layer: str, depth: float | None, offsets: tuple[int, ...], progress=None) -> tuple[float, float] | None:
    ranges = []
    for forecast_hour in offsets:
        payload = layer_payload(layer, forecast_hour, depth or 0.0)
        found = frame_range(layer, payload.get("metadata", {}))
        if found:
            ranges.append(found)
        if progress:
            progress()
    return shared_scale(layer, ranges)


def scale_for(layer: str, depth: float = 0.0, offsets: tuple[int, ...] | None = None) -> tuple[float, float] | None:
    """The shared colour scale of a layer's animation now, worked out (by drawing every frame) if needed."""
    offsets = tuple(offsets or service.animation_offsets())
    level = _depth(layer, depth)
    key = _key(layer, level, offsets, _version(layer))
    scale = _stored_scale(key)
    if scale is None:
        scale = _compute_scale(layer, level, offsets)
        if scale is not None:
            _remember_scale(key, scale)
    return scale


def frame_payload(layer: str, forecast_hour: int, depth: float = 0.0) -> dict:
    """One animation frame: the layer at an animation offset, drawn on the animation's shared scale."""
    offsets = service.animation_offsets()
    forecast_hour = nearest_forecast_hour(forecast_hour, offsets)
    scale = scale_for(layer, depth, offsets)
    payload = layer_payload(layer, forecast_hour, depth, scale)
    return payload


def _valid_time(payload: dict) -> str | None:
    metadata = payload.get("metadata", {})
    return metadata.get("validTime") or next((item.get("validTime") for item in metadata.get("models", []) if item.get("validTime")), None)


def _available(payload: dict) -> bool:
    models = payload.get("metadata", {}).get("models", [])
    return bool(models) and all(item.get("available", True) for item in models)


def _prepare(layer: str, depth: float | None, offsets: tuple[int, ...], version: str, job: _Job) -> dict:
    key = _key(layer, depth, offsets, version)

    def step() -> None:
        job.done += 1

    scale = _stored_scale(key)
    if scale is None:
        scale = _compute_scale(layer, depth, offsets, step)
        if scale is None:
            raise RuntimeError("NOAA data for this animation is unavailable")
        _remember_scale(key, scale)
    else:
        job.done += len(offsets)
    frames = []
    for forecast_hour in offsets:
        payload = layer_payload(layer, forecast_hour, depth or 0.0, scale)
        frames.append({
            "forecastHour": forecast_hour,
            "validTime": _valid_time(payload),
            "available": _available(payload),
            "url": layer_url(layer, forecast_hour, depth, version),
        })
        step()
    return {"scale": {"min": scale[0], "max": scale[1]}, "frames": frames}


def _run(job: _Job, layer: str, depth: float | None, offsets: tuple[int, ...], version: str) -> None:
    try:
        job.result = _prepare(layer, depth, offsets, version, job)
    except Exception as error:  # Reported to the client, which can try again.
        job.error = str(error) or error.__class__.__name__
    finally:
        job.finished.set()


def _job(layer: str, depth: float | None, offsets: tuple[int, ...], version: str) -> _Job:
    key = _key(layer, depth, offsets, version)
    with _lock:
        job = _jobs.get(key)
        # A failed preparation is tried again by the next request.
        if job is not None and not (job.finished.is_set() and job.error):
            _jobs.move_to_end(key)
            return job
        job = _Job(len(offsets) * 2)
        _jobs[key] = job
        while len(_jobs) > MAX_JOBS:
            _jobs.popitem(last=False)
    _executor.submit(_run, job, layer, depth, offsets, version)
    return job


def index(layer: str, depth: float = 0.0, wait_seconds: float = INDEX_WAIT_SECONDS) -> dict:
    """A layer's animation now: its frames and shared scale, or progress while it is prepared."""
    offsets = service.animation_offsets()
    level = _depth(layer, depth)
    version = _version(layer)
    job = _job(layer, level, offsets, version)
    job.finished.wait(wait_seconds)
    result = {
        "layer": layer,
        "depthMeters": level,
        "stepHours": service.ANIMATION_STEP_HOURS,
        "spanHours": service.ANIMATION_SPAN_HOURS,
        "version": version,
        "ready": job.result is not None,
        "progress": {"done": min(job.done, job.total), "total": job.total},
    }
    if job.result is not None:
        result.update(job.result)
    elif job.error:
        result["error"] = job.error
    return result


def prepare(layer: str, depth: float = 0.0) -> dict:
    """Prepare an animation in the calling thread (the refresher) and return it."""
    offsets = service.animation_offsets()
    level = _depth(layer, depth)
    version = _version(layer)
    job = _Job(len(offsets) * 2)
    result = _prepare(layer, level, offsets, version, job)
    key = _key(layer, level, offsets, version)
    job.result = result
    job.finished.set()
    with _lock:
        _jobs[key] = job
        while len(_jobs) > MAX_JOBS:
            _jobs.popitem(last=False)
    return result


def prune(max_age_seconds: float = SCALE_MAX_AGE_SECONDS) -> None:
    directory = cache.path_for("animation")
    cutoff = time.time() - max_age_seconds
    try:
        stale = [item for item in directory.iterdir() if item.stat().st_mtime < cutoff]
    except OSError:
        return
    for item in stale:
        item.unlink(missing_ok=True)


def clear_memory() -> None:
    with _lock:
        _scales.clear()
        _jobs.clear()
