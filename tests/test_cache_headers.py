from __future__ import annotations

from unittest.mock import patch

from server import create_app


def client():
    return create_app({"TESTING": True, "SECRET_KEY": "cache-header-test"}).test_client()


def test_great_lakes_layers_keep_their_private_cache_policy() -> None:
    with (
        patch("server.great_lakes_payload", return_value={"data": []}),
        patch("server.great_lakes_temperature_rasters", return_value={"rasters": []}),
        patch("server.great_lakes_thermocline_rasters", return_value={"rasters": []}),
    ):
        test_client = client()
        for path in (
            "/api/great-lakes/temperature",
            "/api/great-lakes/currents",
            "/api/great-lakes/temperature-raster",
            "/api/great-lakes/thermocline-raster",
        ):
            response = test_client.get(path)
            assert response.status_code == 200, path
            assert response.headers["Cache-Control"] == "private, max-age=600", path


def test_great_lakes_errors_and_other_routes_stay_no_store() -> None:
    test_client = client()

    assert test_client.get("/api/great-lakes/temperature?depth=deep").headers["Cache-Control"] == "no-store"
    assert test_client.get("/healthz").headers["Cache-Control"] == "no-store"
