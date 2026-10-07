from __future__ import annotations

import json
import urllib.error

from backend import great_lakes_history_client as saved_history
from conftest import make_app


def test_saved_past_conditions_come_from_the_site_with_images_served_here(monkeypatch, tmp_path) -> None:
    requested = []
    image_bytes = b"RIFF....WEBP"
    name = "a" * 40 + ".webp"

    def fetch(path, params=None):
        requested.append((path, params))
        if path == "/layers/temperature":
            return json.dumps({"metadata": {"history": {"time": params["time"]}},
                               "rasters": [{"imageUrl": f"/api/v1/history/images/{name}", "valueUrl": f"/api/v1/history/images/{name}"}]}).encode()
        if path == f"/images/{name}":
            return image_bytes
        if path == "":
            return b'{"hours": [{"time": "2026-10-05T03:00:00Z", "layers": ["temperature"]}]}'
        if path.startswith("/point/") or path.startswith("/stations"):
            return json.dumps({"path": path, "params": params}).encode()
        raise saved_history.HistoryUnavailable("Saved conditions request failed (404)", 404)

    monkeypatch.setattr(saved_history, "_fetch", fetch)
    client = make_app(tmp_path).client
    saved_history.clear_memory()

    assert client.get("/api/great-lakes/history").get_json()["hours"][0]["layers"] == ["temperature"]
    layer = client.get("/api/great-lakes/history/layers/temperature?time=2026-10-05T03:00:00Z")
    assert layer.status_code == 200 and layer.headers["Cache-Control"] == "private, max-age=600"
    raster = layer.get_json()["rasters"][0]
    assert raster["imageUrl"] == raster["valueUrl"] == f"/api/great-lakes/history/images/{name}"
    client.get("/api/great-lakes/history/layers/temperature?time=2026-10-05T03:00:00Z")
    assert [path for path, _ in requested].count("/layers/temperature") == 1  # kept in memory

    image = client.get(raster["imageUrl"])
    assert image.status_code == 200 and image.data == image_bytes and image.mimetype == "image/webp"
    assert client.get("/api/great-lakes/history/images/not-an-image.webp").status_code == 404

    point = client.get("/api/great-lakes/history/point/temperature-profile?time=t&latitude=43.5&longitude=-79.5&models=LOOFS").get_json()
    assert point == {"path": "/point/temperature-profile", "params": {"time": "t", "depth": None, "latitude": "43.5", "longitude": "-79.5"}}
    assert client.get("/api/great-lakes/history/point/salinity?time=t").status_code == 404
    assert client.get("/api/great-lakes/history/stations?time=t").get_json()["path"] == "/stations"
    assert client.get("/api/great-lakes/history/stations/45012").get_json()["path"] == "/stations/45012"
    assert client.get("/api/great-lakes/history/stations/..%2Fx").status_code == 404
    assert client.get("/api/great-lakes/history/layers/waves?time=2026-10-05T03:00:00Z").status_code == 404


def test_an_unreachable_site_answers_503(monkeypatch, tmp_path) -> None:
    def unreachable(request, timeout):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(saved_history.urllib.request, "urlopen", unreachable)
    client = make_app(tmp_path).client
    response = client.get("/api/great-lakes/history")
    assert response.status_code == 503 and response.get_json()["error"] == "Saved conditions are unavailable"


def test_the_history_site_is_configurable(tmp_path) -> None:
    make_app(tmp_path, great_lakes_history_url="http://127.0.0.1:8090/")
    assert saved_history.base_url() == "http://127.0.0.1:8090"
    make_app(tmp_path)
    assert saved_history.base_url() == "https://greatlakestrolling.com"
