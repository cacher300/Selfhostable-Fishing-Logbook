"""Environmental proxies: weather, marine, astronomy, bathymetry, Great Lakes."""

from __future__ import annotations

from flask import Blueprint, Response, abort, current_app, jsonify, request

from ..bathymetry_service import apply_depth_result, lookup_depth, valid_coordinates
from ..great_lakes_service import (
    MODELS,
    great_lakes_current_profile,
    great_lakes_payload,
    great_lakes_temperature_profile,
    great_lakes_temperature_rasters,
    great_lakes_temperature_value,
    great_lakes_thermocline_rasters,
)
from ..weather_service import (
    astronomy_payload,
    marine_weather_payload,
    weather_archive_payload,
    weather_forecast_payload,
)
from . import read_document


blueprint = Blueprint("environment", __name__)

FORECAST_HOURS = (0, 6, 12, 24, 48)
LAYER_CACHE_CONTROL = "private, max-age=600"
# Endpoints whose successful responses may be cached privately by the browser.
CACHEABLE_ENDPOINTS = {
    "environment.great_lakes",
    "environment.great_lakes_temperature_raster",
    "environment.great_lakes_thermocline_raster",
}


def _forecast_hour() -> int:
    requested = int(request.args.get("forecastHour", 0))
    return min(FORECAST_HOURS, key=lambda value: abs(value - requested))


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
    response.headers["Cache-Control"] = LAYER_CACHE_CONTROL
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
    try:
        forecast_hour, depth, resolution = _forecast_hour(), _depth(), _resolution()
    except ValueError:
        abort(400, "forecastHour, depth, and resolution must be numeric")
    return _cached(great_lakes_temperature_rasters(forecast_hour, depth, resolution, _models()))


@blueprint.get("/api/great-lakes/thermocline-raster")
def great_lakes_thermocline_raster() -> Response:
    try:
        forecast_hour, resolution = _forecast_hour(), _resolution()
    except ValueError:
        abort(400, "forecastHour and resolution must be numeric")
    return _cached(great_lakes_thermocline_rasters(forecast_hour, resolution, _models()))


@blueprint.get("/api/great-lakes/<layer>")
def great_lakes(layer: str) -> Response:
    if layer not in {"temperature", "currents"}:
        abort(404)
    try:
        forecast_hour, depth = _forecast_hour(), _depth()
    except ValueError:
        abort(400, "forecastHour and depth must be numeric")
    return _cached(great_lakes_payload(layer, forecast_hour, depth, _models()))
