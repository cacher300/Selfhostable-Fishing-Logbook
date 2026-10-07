from __future__ import annotations

from unittest.mock import patch

import pytest

from conftest import make_app


def client(tmp_path):
    return make_app(tmp_path, SECRET_KEY="cache-header-test").client


def test_great_lakes_layers_keep_their_private_cache_policy(tmp_path) -> None:
    with (
        patch("backend.routes.environment.great_lakes_payload", return_value={"data": []}),
        patch("backend.routes.environment.great_lakes_temperature_rasters", return_value={"rasters": []}),
        patch("backend.routes.environment.great_lakes_thermocline_rasters", return_value={"rasters": []}),
        patch("backend.routes.environment.great_lakes_model_points", return_value={"points": []}),
    ):
        test_client = client(tmp_path)
        for path in (
            "/api/great-lakes/temperature",
            "/api/great-lakes/currents",
            "/api/great-lakes/temperature-raster",
            "/api/great-lakes/thermocline-raster",
            "/api/great-lakes/model-points?kind=currents&south=41&west=-83&north=42&east=-82",
        ):
            response = test_client.get(path)
            assert response.status_code == 200, path
            assert response.headers["Cache-Control"] == "private, max-age=600", path


def test_great_lakes_errors_and_other_routes_stay_no_store(tmp_path) -> None:
    test_client = client(tmp_path)

    assert test_client.get("/api/great-lakes/temperature?depth=deep").headers["Cache-Control"] == "no-store"
    assert test_client.get("/healthz").headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("preview", [False, True])
def test_local_media_is_privately_cached_and_revalidates(tmp_path, preview) -> None:
    fish = make_app(tmp_path)
    directory = fish.uploads / "lures"
    if preview:
        directory /= "_previews"
    directory.mkdir(parents=True)
    (directory / "sample.jpg").write_bytes(b"sample-image")
    url = f"/uploads/lures/{'_previews/' if preview else ''}sample.jpg"

    response = fish.client.get(url)
    assert response.status_code == 200
    assert response.data == b"sample-image"
    assert response.headers["Cache-Control"] == "private, max-age=3600"
    head = fish.client.head(url)
    assert head.status_code == 200
    assert head.headers["Cache-Control"] == "private, max-age=3600"
    unchanged = fish.client.get(url, headers={"If-None-Match": response.headers["ETag"]})
    assert unchanged.status_code == 304
    assert unchanged.data == b""
    assert unchanged.headers["Cache-Control"] == "private, max-age=3600"
    partial = fish.client.get(url, headers={"Range": "bytes=0-5"})
    assert partial.status_code == 206
    assert partial.data == b"sample"
    assert partial.headers["Cache-Control"] == "private, max-age=3600"
    missing = fish.client.get(url.replace("sample.jpg", "missing.jpg"))
    assert missing.status_code == 404
    assert missing.headers["Cache-Control"] == "no-store"
    assert fish.client.get("/api/gallery").headers["Cache-Control"] == "no-store"
    assert fish.client.get("/api/logbook").headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("preview", [False, True])
def test_cloud_media_uses_the_same_private_cache_policy(tmp_path, preview) -> None:
    fish = make_app(tmp_path, storage_backend="cloud", cloud_api_url="https://cloud.invalid")
    url = f"/uploads/lures/{'_previews/' if preview else ''}sample.jpg"
    with patch("backend.cloud_storage.get_object", return_value=(
        b"sample-image", {"content-type": "image/jpeg", "etag": '"sample-etag"'}
    )):
        response = fish.client.get(url)
    assert response.status_code == 200
    assert response.data == b"sample-image"
    assert response.headers["Cache-Control"] == "private, max-age=3600"
    assert response.headers["ETag"] == '"sample-etag"'


def test_live_station_readings_are_never_cached(tmp_path) -> None:
    with patch("backend.routes.environment.great_lakes_observations", return_value={"stations": []}):
        response = client(tmp_path).get("/api/great-lakes/observations")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
