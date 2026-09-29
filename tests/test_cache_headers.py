from __future__ import annotations

from unittest.mock import patch

from conftest import make_app


def client(tmp_path):
    return make_app(tmp_path, SECRET_KEY="cache-header-test").client


def test_great_lakes_layers_keep_their_private_cache_policy(tmp_path) -> None:
    with (
        patch("backend.routes.environment.great_lakes_payload", return_value={"data": []}),
        patch("backend.routes.environment.great_lakes_temperature_rasters", return_value={"rasters": []}),
        patch("backend.routes.environment.great_lakes_thermocline_rasters", return_value={"rasters": []}),
    ):
        test_client = client(tmp_path)
        for path in (
            "/api/great-lakes/temperature",
            "/api/great-lakes/currents",
            "/api/great-lakes/temperature-raster",
            "/api/great-lakes/thermocline-raster",
        ):
            response = test_client.get(path)
            assert response.status_code == 200, path
            assert response.headers["Cache-Control"] == "private, max-age=600", path


def test_great_lakes_errors_and_other_routes_stay_no_store(tmp_path) -> None:
    test_client = client(tmp_path)

    assert test_client.get("/api/great-lakes/temperature?depth=deep").headers["Cache-Control"] == "no-store"
    assert test_client.get("/healthz").headers["Cache-Control"] == "no-store"
