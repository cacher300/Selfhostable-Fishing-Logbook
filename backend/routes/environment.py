"""Environmental proxies for weather, astronomy, and bathymetry."""

from __future__ import annotations

import gzip
from pathlib import Path

from flask import Blueprint, Response, abort, current_app, jsonify, request

from ..bathymetry_service import apply_depth_result, lookup_depth, valid_coordinates
from ..weather_service import (
    astronomy_payload,
    marine_weather_payload,
    weather_archive_payload,
    weather_forecast_payload,
)
from . import read_document


blueprint = Blueprint("environment", __name__)


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
    detail = request.args.get("detail", "full")
    if detail not in {"6", "9", "12", "full"}:
        abort(400, "detail must be 6, 9, 12, or full")
    suffix = "" if detail == "full" else f"-z{detail}"
    path = Path(__file__).resolve().parents[2] / "static" / "data" / f"lake-{lake}-contours{suffix}.geojson.gz"
    if not path.is_file():
        abort(404)
    response = Response(_decompressed_bathymetry_contours(path), mimetype="application/geo+json")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


def _decompressed_bathymetry_contours(path: Path):
    with gzip.open(path, "rb") as source:
        while chunk := source.read(64 * 1024):
            yield chunk
