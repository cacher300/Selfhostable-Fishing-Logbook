import gzip
import json
from unittest.mock import patch
import pytest
from backend import bathymetry_service as bathymetry, great_lakes_cache as cache
CONTOUR = [{"attributes": {"Lake": "Ontario", "depth_ft": 52.5, "depth_m": 16.002}, "geometry": {"x": -79.0, "y": 43.0}}]
@pytest.fixture(autouse=True)
def isolated_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "_cache_dir", tmp_path)
    monkeypatch.setattr(bathymetry, "nearest_local_contour", lambda *args: None)
    monkeypatch.setattr(bathymetry, "model_depth_estimate", lambda *args: None)

def test_available_model_depth_skips_the_remote_service(monkeypatch):
    monkeypatch.setattr(bathymetry, "model_depth_estimate", lambda *args: {"depthMeters": 100, "lake": "Ontario"})
    with patch.object(bathymetry, "query_bathymetry_features", side_effect=AssertionError("remote lookup must not run")):
        assert bathymetry.lookup_depth(43.6, -77.9)["depth_source"] == bathymetry.MODEL_DEPTH_SOURCE

def test_local_contour_remains_the_preferred_depth(monkeypatch):
    monkeypatch.setattr(bathymetry, "nearest_local_contour", lambda *args: (20, "Ontario"))
    with patch.object(bathymetry, "model_depth_estimate", side_effect=AssertionError("model must not run")), \
         patch.object(bathymetry, "query_bathymetry_features", side_effect=AssertionError("remote must not run")):
        assert bathymetry.lookup_depth(43.6, -77.9)["depth_source"] == bathymetry.LOCAL_DEPTH_SOURCE

def test_remote_contour_can_cover_a_model_failure(monkeypatch):
    with patch.object(bathymetry, "model_depth_estimate", side_effect=RuntimeError("model still loading")), \
         patch.object(bathymetry, "query_bathymetry_features", return_value=CONTOUR):
        assert bathymetry.lookup_depth(43.6, -77.9)["depth_source"] == bathymetry.DEPTH_SOURCE

def test_saved_contour_index_survives_worker_restart_and_source_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(bathymetry, "LOCAL_CONTOUR_DIR", tmp_path)
    monkeypatch.setattr(bathymetry, "LOCAL_CONTOUR_INDEX_DIR", tmp_path / "bundled")
    monkeypatch.setattr(bathymetry, "_LOCAL_CONTOUR_CACHE", {})
    path = tmp_path / "lake-ontario-contours.geojson.gz"
    def write_source(depth):
        with gzip.open(path, "wt", encoding="utf-8") as source:
            json.dump({"features": [{"properties": {"DEPTH": depth}, "geometry": {
                "type": "LineString", "coordinates": [[-78, 43.5], [-77.99, 43.5]]}}]}, source)
    write_source(20)
    original = bathymetry._local_contour_index("ontario")
    bathymetry._LOCAL_CONTOUR_CACHE.clear()
    with patch.object(bathymetry, "_build_local_contour_index", side_effect=AssertionError("index rebuilt")):
        restored = bathymetry._local_contour_index("ontario")
    assert restored == original
    write_source(30)
    bathymetry._LOCAL_CONTOUR_CACHE.clear()
    assert bathymetry._local_contour_index("ontario")[0][4] == 30

def test_invalid_saved_index_is_rebuilt(tmp_path, monkeypatch):
    from backend import great_lakes_cache as cache

    monkeypatch.setattr(bathymetry, "LOCAL_CONTOUR_DIR", tmp_path)
    monkeypatch.setattr(bathymetry, "LOCAL_CONTOUR_INDEX_DIR", tmp_path / "bundled")
    monkeypatch.setattr(bathymetry, "_LOCAL_CONTOUR_CACHE", {})
    with gzip.open(tmp_path / "lake-ontario-contours.geojson.gz", "wt", encoding="utf-8") as source:
        json.dump({"features": []}, source)
    bathymetry._local_contour_index("ontario")
    saved = next(cache.path_for("contour-indexes").glob("*.bin"))
    saved.write_bytes(b"truncated")
    bathymetry._LOCAL_CONTOUR_CACHE.clear()
    assert bathymetry._local_contour_index("ontario") is not None
