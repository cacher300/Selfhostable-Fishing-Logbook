"""Environmental proxies: weather, marine, astronomy, bathymetry, Great Lakes."""

from __future__ import annotations

import gzip
import math
from pathlib import Path

from flask import Blueprint, Response, abort, current_app, jsonify, request

from .. import great_lakes_animation as animation
from .. import great_lakes_history_client as saved_history
from .. import great_lakes_upwelling as upwelling
from ..bathymetry_service import apply_depth_result, lookup_depth, valid_coordinates
from ..great_lakes_observations import great_lakes_observations
from ..great_lakes_refresher import data_status
from ..great_lakes_waves import wave_model_points, wave_rasters, wave_value
from ..great_lakes_service import (
    MODEL_POINT_KINDS,
    MODELS,
    great_lakes_current_profile,
    great_lakes_model_points,
    great_lakes_payload,
    great_lakes_temperature_profile,
    great_lakes_temperature_rasters,
    great_lakes_temperature_value,
    great_lakes_thermocline_rasters,
    served_offsets,
)
from ..weather_service import (
    astronomy_payload,
    marine_weather_payload,
    weather_archive_payload,
    weather_forecast_payload,
)
from . import read_document


blueprint = Blueprint("environment", __name__)

LAYER_CACHE_CONTROL = "private, max-age=600"
STATIONS_CACHE_CONTROL = "private, max-age=300"
# Endpoints whose successful responses may be cached privately by the browser.
CACHEABLE_ENDPOINTS = {
    "environment.great_lakes",
    "environment.great_lakes_temperature_raster",
    "environment.great_lakes_thermocline_raster",
    "environment.great_lakes_wave_raster",
    "environment.great_lakes_upwelling_raster",
    "environment.great_lakes_model_calculation_points",
    "environment.great_lakes_history_layer",
    "environment.great_lakes_history_image",
}


def _forecast_hour() -> int:
    # The forecast choices and the forecast animation's frames.
    requested = int(request.args.get("forecastHour", 0))
    return min(served_offsets(), key=lambda value: abs(value - requested))


def _animation_frame(layer: str) -> Response | None:
    """With ``animation=1``: the frame of the layer's forecast animation, on the colour scale every frame shares."""
    if request.args.get("animation") != "1":
        return None
    try:
        requested = float(request.args.get("forecastHour", 0))
        depth = float(request.args.get("depth", 0)) if layer in animation.DEPTH_LAYERS else 0.0
    except ValueError:
        abort(400, "forecastHour and depth must be numeric")
    if not (math.isfinite(requested) and math.isfinite(depth)):
        abort(400, "forecastHour and depth must be numeric")
    return _cached(animation.frame_payload(layer, requested, max(0.0, min(500.0, depth))))


def _depth() -> int:
    return max(0, min(500, int(request.args.get("depth", 0))))


def _resolution() -> int:
    return max(128, min(512, int(request.args.get("resolution", 320))))


def _point() -> tuple[float, float]:
    return float(request.args["latitude"]), float(request.args["longitude"])


def _models() -> tuple[str, ...]:
    return tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS


def _cached(payload: dict) -> Response:
    response = jsonify(payload)
    # A layer missing a lake (NOAA briefly unreachable) is retried on the server within minutes;
    # the browser must not keep it for the full ten minutes under the same URL.
    metadata = payload.get("metadata") or {}
    complete = all(item.get("available", True) for item in metadata.get("models", []))
    complete = complete and (metadata.get("availability") or {}).get("state") not in {"fallback", "waiting", "error"}
    response.headers["Cache-Control"] = LAYER_CACHE_CONTROL if complete else "no-store"
    return response


@blueprint.get("/api/weather/archive")
def weather_archive() -> tuple[Response, int]:
    payload, status = weather_archive_payload(request.args)
    return jsonify(payload), status


@blueprint.get("/api/weather/forecast")
def weather_forecast() -> tuple[Response, int]:
    payload, status = weather_forecast_payload(request.args)
    return jsonify(payload), status


@blueprint.get("/api/weather/marine")
def marine_weather() -> tuple[Response, int]:
    payload, status = marine_weather_payload(request.args)
    return jsonify(payload), status


@blueprint.get("/api/astronomy")
def astronomy() -> tuple[Response, int]:
    payload, status = astronomy_payload(request.args)
    return jsonify(payload), status


@blueprint.get("/api/bathymetry/depth")
def catch_depth() -> tuple[Response, int] | Response:
    coordinates = valid_coordinates({
        "latitude": request.args.get("latitude"),
        "longitude": request.args.get("longitude"),
    })
    if coordinates is None:
        return jsonify({"error": "Catch coordinates are invalid."}), 400
    latitude, longitude = coordinates
    try:
        settings = read_document().get("settings", {})
        result = lookup_depth(latitude, longitude, settings.get("bathymetryLakeCalibrationsFeet"))
    except Exception:
        current_app.logger.exception("Depth lookup failed for catch coordinates.")
        return jsonify({"error": "Depth lookup unavailable."}), 503
    catch: dict = {}
    apply_depth_result(catch, result)
    return jsonify(catch)



@blueprint.get("/api/bathymetry/contours/<lake>")
def bathymetry_contours(lake: str) -> Response:
    """Stream one bundled NOAA contour collection as GeoJSON."""
    if lake not in {"erie", "huron", "michigan", "ontario", "superior"}:
        abort(404)
    path = Path(__file__).resolve().parents[2] / "static" / "data" / f"lake-{lake}-contours.geojson.gz"
    if not path.is_file():
        abort(404)
    response = Response(_decompressed_bathymetry_contours(path), mimetype="application/geo+json")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


def _decompressed_bathymetry_contours(path: Path):
    with gzip.open(path, "rb") as source:
        while chunk := source.read(64 * 1024):
            yield chunk


@blueprint.get("/api/great-lakes/temperature-value")
def great_lakes_temperature_value_at_point() -> Response:
    try:
        forecast_hour, depth, resolution = _forecast_hour(), _depth(), _resolution()
        latitude, longitude = _point()
    except (KeyError, ValueError):
        abort(400, "forecastHour, depth, resolution, latitude, and longitude must be numeric")
    return jsonify(great_lakes_temperature_value(forecast_hour, depth, resolution, latitude, longitude, _models()))


@blueprint.get("/api/great-lakes/profile")
def great_lakes_profile() -> Response:
    try:
        forecast_hour = _forecast_hour()
        latitude, longitude = _point()
    except (KeyError, ValueError):
        abort(400, "forecastHour, latitude, and longitude must be numeric")
    return jsonify(great_lakes_temperature_profile(forecast_hour, latitude, longitude, _models()))


@blueprint.get("/api/great-lakes/current-profile")
def great_lakes_current_profile_at_point() -> Response:
    try:
        forecast_hour = _forecast_hour()
    except ValueError:
        abort(400, "forecastHour must be numeric")
    coordinates = valid_coordinates({"latitude": request.args.get("latitude"), "longitude": request.args.get("longitude")})
    if coordinates is None:
        abort(400, "latitude and longitude must be valid coordinates")
    return jsonify(great_lakes_current_profile(forecast_hour, *coordinates, _models()))


@blueprint.get("/api/great-lakes/temperature-raster")
def great_lakes_temperature_raster() -> Response:
    frame = _animation_frame("temperature")
    if frame is not None:
        return frame
    try:
        forecast_hour, depth, resolution = _forecast_hour(), _depth(), _resolution()
    except ValueError:
        abort(400, "forecastHour, depth, and resolution must be numeric")
    return _cached(great_lakes_temperature_rasters(forecast_hour, depth, resolution, _models()))


@blueprint.get("/api/great-lakes/thermocline-raster")
def great_lakes_thermocline_raster() -> Response:
    frame = _animation_frame("thermocline")
    if frame is not None:
        return frame
    try:
        forecast_hour, resolution = _forecast_hour(), _resolution()
    except ValueError:
        abort(400, "forecastHour and resolution must be numeric")
    return _cached(great_lakes_thermocline_rasters(forecast_hour, resolution, _models()))


@blueprint.get("/api/great-lakes/waves-raster")
def great_lakes_wave_raster() -> Response:
    frame = _animation_frame("waves")
    if frame is not None:
        return frame
    try:
        forecast_hour, resolution = _forecast_hour(), _resolution()
    except ValueError:
        abort(400, "forecastHour and resolution must be numeric")
    return _cached(wave_rasters(forecast_hour, resolution, _models()))


@blueprint.get("/api/great-lakes/upwelling-raster")
def great_lakes_upwelling_raster() -> Response:
    frame = _animation_frame("upwelling")
    if frame is not None:
        return frame
    try:
        forecast_hour, resolution = _forecast_hour(), _resolution()
    except ValueError:
        abort(400, "forecastHour and resolution must be numeric")
    return _cached(upwelling.upwelling_rasters(forecast_hour, resolution, _models()))


@blueprint.get("/api/great-lakes/upwelling-value")
def great_lakes_upwelling_value_at_point() -> Response:
    try:
        forecast_hour = _forecast_hour()
    except ValueError:
        abort(400, "forecastHour must be numeric")
    coordinates = valid_coordinates({"latitude": request.args.get("latitude"), "longitude": request.args.get("longitude")})
    if coordinates is None:
        abort(400, "latitude and longitude must be valid coordinates")
    try:
        return jsonify(upwelling.upwelling_value(forecast_hour, *coordinates, _models()))
    except Exception:
        current_app.logger.exception("NOAA upwelling lookup failed.")
        return jsonify({"available": False})


@blueprint.get("/api/great-lakes/wave-value")
def great_lakes_wave_value_at_point() -> Response:
    try:
        forecast_hour = _forecast_hour()
    except ValueError:
        abort(400, "forecastHour must be numeric")
    coordinates = valid_coordinates({"latitude": request.args.get("latitude"), "longitude": request.args.get("longitude")})
    if coordinates is None:
        abort(400, "latitude and longitude must be valid coordinates")
    try:
        return jsonify(wave_value(forecast_hour, *coordinates))
    except Exception:
        current_app.logger.exception("NOAA wave lookup failed.")
        return jsonify({"available": False})


@blueprint.get("/api/great-lakes/animation/<layer>")
def great_lakes_animation(layer: str) -> tuple[Response, int] | Response:
    """A layer's forecast animation: frame URLs and their shared colour scale, or progress while it is drawn."""
    if layer not in animation.LAYERS:
        abort(404)
    try:
        depth = float(request.args.get("depth", 0)) if layer in animation.DEPTH_LAYERS else 0.0
    except ValueError:
        abort(400, "depth must be numeric")
    if not math.isfinite(depth):
        abort(400, "depth must be numeric")
    payload = animation.index(layer, max(0.0, min(500.0, depth)))
    if payload["ready"]:
        return jsonify(payload)
    return jsonify(payload), 503 if payload.get("error") else 202


@blueprint.get("/api/great-lakes/status")
def great_lakes_data_status() -> Response:
    return jsonify(data_status(_models()))


@blueprint.get("/api/great-lakes/observations")
def great_lakes_observation_stations() -> Response | tuple[Response, int]:
    try:
        response = jsonify(great_lakes_observations())
        response.headers["Cache-Control"] = STATIONS_CACHE_CONTROL
        return response
    except Exception:
        current_app.logger.exception("NOAA buoy observations are unavailable.")
        return jsonify({"stations": [], "error": "NOAA buoy observations are unavailable."}), 503


@blueprint.get("/api/great-lakes/model-points")
def great_lakes_model_calculation_points() -> Response:
    kind = request.args.get("kind", "temperature")
    if kind not in MODEL_POINT_KINDS and kind != "waves":
        abort(400, "kind must be temperature, currents, or waves")
    try:
        bounds = tuple(float(request.args[name]) for name in ("south", "west", "north", "east"))
    except (KeyError, ValueError):
        abort(400, "south, west, north, and east must be numeric")
    south, west, north, east = bounds
    if not all(math.isfinite(value) for value in bounds) or not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        abort(400, "bounds must describe a valid area")
    if kind == "waves":
        return _cached(wave_model_points(bounds))
    return _cached(great_lakes_model_points(kind, bounds, _models()))


def _saved(load) -> Response | tuple[Response, int]:
    """Pass a saved-history answer from the Great Lakes Trolling site on to the browser."""
    try:
        return jsonify(load())
    except saved_history.HistoryUnavailable as error:
        return jsonify({"error": str(error)}), error.status


@blueprint.get("/api/great-lakes/history")
def great_lakes_history_index() -> Response | tuple[Response, int]:
    return _saved(saved_history.index)


@blueprint.get("/api/great-lakes/history/layers/<layer>")
def great_lakes_history_layer(layer: str) -> Response | tuple[Response, int]:
    response = _saved(lambda: saved_history.layer(layer, request.args.get("time", "")))
    if not isinstance(response, tuple):
        response.headers["Cache-Control"] = LAYER_CACHE_CONTROL
    return response


@blueprint.get("/api/great-lakes/history/images/<name>")
def great_lakes_history_image(name: str) -> Response | tuple[Response, int]:
    try:
        data, media_type = saved_history.image(name)
    except saved_history.HistoryUnavailable as error:
        return jsonify({"error": str(error)}), error.status
    response = Response(data, mimetype=media_type)
    response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
    return response


@blueprint.get("/api/great-lakes/history/point/<kind>")
def great_lakes_history_point(kind: str) -> Response | tuple[Response, int]:
    return _saved(lambda: saved_history.point(kind, request.args))


@blueprint.get("/api/great-lakes/history/stations")
def great_lakes_history_stations() -> Response | tuple[Response, int]:
    return _saved(lambda: saved_history.stations(request.args.get("time", "")))


@blueprint.get("/api/great-lakes/history/stations/<station_id>")
def great_lakes_history_station(station_id: str) -> Response | tuple[Response, int]:
    return _saved(lambda: saved_history.station(station_id))


@blueprint.get("/api/great-lakes/<layer>")
def great_lakes(layer: str) -> Response:
    if layer not in {"temperature", "currents"}:
        abort(404)
    frame = _animation_frame(layer)
    if frame is not None:
        return frame
    try:
        forecast_hour, depth = _forecast_hour(), _depth()
    except ValueError:
        abort(400, "forecastHour and depth must be numeric")
    return _cached(great_lakes_payload(layer, forecast_hour, depth, _models()))
