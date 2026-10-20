"""Cold point depth reuses local data and bounded, shared model downloads."""

from array import array
from concurrent.futures import ThreadPoolExecutor
import threading
import time

import pytest

from backend import bathymetry_service as bathymetry, great_lakes_bathymetry as service, great_lakes_cache as cache


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "_cache_dir", tmp_path)


GRID = {"latitudeAxis": [43.5, 43.51], "longitudeAxis": [-78, -77.99], "columns": 2,
        "wet": array("B", [1, 1, 1, 1]), "depth": array("f", [100] * 4)}


def test_model_depth_reads_saved_grid_without_catalogue_or_network(monkeypatch):
    monkeypatch.setattr(service, "_bathymetry_cache", {})
    cache.write_record(cache.path_for("static", "LOOFS", "bathymetry-2x2.bin"),
                       {"latitudeAxis": GRID["latitudeAxis"], "longitudeAxis": GRID["longitudeAxis"]},
                       {"wet": GRID["wet"], "depth": GRID["depth"]})
    def no_discovery(*args):
        raise AssertionError("static bathymetry must survive an offline catalogue")
    monkeypatch.setattr(service, "_latest_regular_grid_path", no_discovery)
    assert service.model_bathymetry_depth(43.505, -77.995, ("LOOFS",), timeout=0)["depthMeters"] == 100


def test_cold_click_has_a_deadline_and_following_clicks_share_download(monkeypatch):
    monkeypatch.setattr(service, "_bathymetry_cache", {})
    monkeypatch.setattr(service, "_bathymetry_downloads", {})
    monkeypatch.setattr(service, "_bathymetry_retry_at", {})
    release, started = threading.Event(), threading.Event()
    calls = []
    def download(model):
        calls.append(model)
        started.set()
        assert release.wait(2)
        service._bathymetry_cache[model] = GRID
        return GRID
    monkeypatch.setattr(service, "_bathymetry_grid", download)
    with ThreadPoolExecutor(max_workers=1) as pool:
        monkeypatch.setattr(service, "_bathymetry_executor", pool)
        try:
            before = time.monotonic()
            for _ in range(2):
                with pytest.raises(RuntimeError, match="still loading"):
                    service.model_bathymetry_depth(43.505, -77.995, ("LOOFS",), timeout=0.01)
            assert time.monotonic() - before < 1
            assert started.wait(1) and calls == ["LOOFS"]
        finally:
            release.set()
    assert service.model_bathymetry_depth(43.505, -77.995, ("LOOFS",), timeout=0)["depthMeters"] == 100


def test_model_failure_is_not_reported_as_land(monkeypatch):
    monkeypatch.setattr(bathymetry, "nearest_local_contour", lambda *args: None)
    def unavailable(*args):
        raise RuntimeError("still loading")
    monkeypatch.setattr(bathymetry, "model_depth_estimate", unavailable)
    monkeypatch.setattr(bathymetry, "query_bathymetry_features", lambda *args: [])
    with pytest.raises(RuntimeError, match="still loading"):
        bathymetry.lookup_depth(43.6, -77.9)


def test_point_download_only_checks_the_lake_at_the_clicked_location(monkeypatch):
    calls = []
    def depth(latitude, longitude, models, **kwargs):
        calls.append((models, kwargs["timeout"]))
    monkeypatch.setattr(service, "model_bathymetry_depth", depth)
    bathymetry.model_depth_estimate(43.6, -77.9)
    assert calls == [(("LOOFS",), bathymetry.MODEL_DEPTH_TIMEOUT_SECONDS)]
