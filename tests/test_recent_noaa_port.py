from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch

import pytest

from conftest import make_app
from backend import great_lakes_cache as cache


def test_noaa_502_retries_and_returns_the_successful_response(monkeypatch):
    monkeypatch.setattr(cache, "HTTP_502_MAX_RETRIES", 2)
    monkeypatch.setattr(cache.time, "sleep", lambda seconds: None)
    url = "https://opendap.co-ops.nos.noaa.gov/data.dods"
    errors = [HTTPError(url, 502, "Bad gateway", {}, None) for _ in range(2)]
    with patch.object(cache.urllib.request, "urlopen", side_effect=[*errors, BytesIO(b"ready")]) as get:
        assert cache.http_get(url) == b"ready"
        assert get.call_count == 3


@pytest.mark.parametrize("host,code", [("example.com", 502), ("nomads.ncep.noaa.gov", 404), ("nomads.ncep.noaa.gov", 503)])
def test_retry_does_not_hide_other_errors(host, code):
    url = f"https://{host}/data"
    with patch.object(cache.urllib.request, "urlopen", side_effect=HTTPError(url, code, "Unavailable", {}, None)) as get:
        with pytest.raises(HTTPError):
            cache.http_get(url)
        assert get.call_count == 1


@pytest.mark.parametrize("detail", ["6", "9", "12", "full"])
def test_contour_detail_route_returns_geojson(tmp_path, detail):
    response = make_app(tmp_path).client.get(f"/api/bathymetry/contours/ontario?detail={detail}")
    assert response.status_code == 200
    assert response.get_json()["type"] == "FeatureCollection"


def test_contour_detail_route_rejects_invalid_detail(tmp_path):
    assert make_app(tmp_path).client.get("/api/bathymetry/contours/ontario?detail=../secret").status_code == 400
