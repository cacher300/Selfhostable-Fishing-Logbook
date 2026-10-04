"""Live NOAA buoy observations and forecast-model calculation points."""

from __future__ import annotations

from array import array
from datetime import datetime, timezone
from unittest.mock import patch

from backend import great_lakes_observations as observations
from backend import great_lakes_service as service
from conftest import make_app

NOW = datetime(2026, 10, 2, 17, 0, tzinfo=timezone.utc)

ACTIVE_STATIONS = """<?xml version="1.0"?>
<stations>
  <station id="45026" lat="41.982" lon="-86.619" name="Cook Nuclear Plant Buoy" owner="Limno Tech" type="buoy" met="y" currents="y" />
  <station id="cndo1" lat="41.541" lon="-81.635" name="Cleveland, OH" owner="NOS" type="fixed" met="y" currents="n" />
  <station id="45999" lat="44.1" lon="-82.0" name="Silent Buoy" owner="Test" type="buoy" met="y" currents="n" />
  <station id="41001" lat="34.7" lon="-72.7" name="Atlantic Buoy" owner="NDBC" type="buoy" met="y" currents="n" />
</stations>"""

LATEST = """#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text      deg      deg   yr mo day hr mn degT  m/s   m/s    m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
45026    41.982  -86.619 2026 10 02 16 30  200   5.0   6.0   MM   MM  MM  MM     MM    MM  15.2  16.4    MM   MM     MM
CNDO1    41.541  -81.635 2026 10 02 16 30   MM    MM    MM   MM   MM  MM  MM     MM    MM    MM  20.7    MM   MM     MM
45999    44.100  -82.000 2026 10 02 05 00   MM    MM    MM   MM   MM  MM  MM     MM    MM    MM  14.0    MM   MM     MM
41001    34.700  -72.700 2026 10 02 16 30   MM    MM    MM   MM   MM  MM  MM     MM    MM    MM  24.0    MM   MM     MM
"""

ADCP = """#YY  MM DD hh mm DEP01 DIR01 SPD01 DEP02 DIR02 SPD02 DEP03 DIR03 SPD03
#yr  mo dy hr mn     m  degT  cm/s     m  degT  cm/s     m  degT  cm/s
2026 10 02 16 40     1   360    10     3    40     9    MM    MM    MM
2026 10 02 16 30     1   350     8     3    30     7     5    20     6
"""


def test_latest_water_temperatures_skip_stale_and_missing_readings() -> None:
    readings = observations.parse_latest_water_temperatures(LATEST, NOW)

    assert readings["45026"] == {"temperatureC": 16.4, "observedAt": "2026-10-02T16:30:00Z"}
    assert readings["CNDO1"]["temperatureC"] == 20.7
    assert "45999" not in readings  # 12 hours old: a buoy pulled for the season


def test_adcp_profile_uses_the_newest_row_and_converts_units() -> None:
    profile = observations.parse_adcp(ADCP, NOW)

    assert profile["observedAt"] == "2026-10-02T16:40:00Z"
    assert profile["values"] == [
        {"depthMeters": 1.0, "directionDegrees": 0.0, "speedMetersPerSecond": 0.1},
        {"depthMeters": 3.0, "directionDegrees": 40.0, "speedMetersPerSecond": 0.09},
    ]
    assert observations.parse_adcp(ADCP, datetime(2026, 10, 3, tzinfo=timezone.utc)) is None


def test_observations_include_only_reporting_great_lakes_stations(monkeypatch) -> None:
    pages = {
        observations.ACTIVE_STATIONS_URL: ACTIVE_STATIONS,
        observations.LATEST_OBSERVATIONS_URL: LATEST,
        f"{observations.NDBC}/data/realtime2/45026.adcp": ADCP,
    }
    requested = []

    def get(url, max_bytes=None):
        requested.append((url.rsplit("/", 1)[-1], max_bytes))
        return pages[url]

    monkeypatch.setattr(observations, "_get", get)
    monkeypatch.setattr(observations, "datetime", type("FrozenDatetime", (datetime,), {"now": staticmethod(lambda tz=None: NOW)}))

    payload = observations._build_payload()
    stations = {station["id"]: station for station in payload["stations"]}

    assert set(stations) == {"45026", "CNDO1"}  # Atlantic and silent buoys are excluded
    assert stations["45026"]["type"] == "Buoy"
    assert stations["45026"]["current"]["values"][0]["speedMetersPerSecond"] == 0.1
    assert stations["CNDO1"]["type"] == "Shore station"
    assert stations["CNDO1"]["current"] is None
    assert stations["CNDO1"]["url"].endswith("station=cndo1")
    # Only the newest lines of the 45-day current-meter file are downloaded.
    assert ("45026.adcp", observations.ADCP_HEAD_BYTES) in requested


def test_model_points_are_filtered_to_bounds_and_never_thinned(monkeypatch) -> None:
    mesh = (array("d", [41.0, 41.5, 42.0, 42.5]), array("d", [-82.0, -81.0, -82.5, -81.5]))
    monkeypatch.setattr(service, "_model_mesh", lambda model, kind: mesh)

    payload = service.great_lakes_model_points("temperature", (41.2, -82.6, 42.6, -81.2), ("LEOFS",))
    assert payload["points"] == [42.0, -82.5, 42.5, -81.5]
    assert payload["count"] == 2 and payload["tooMany"] is False

    crowded = service.great_lakes_model_points("temperature", (40, -83, 43, -80), ("LEOFS",), limit=3)
    assert crowded["tooMany"] is True and crowded["count"] == 4 and crowded["points"] == []


def test_model_points_report_an_unavailable_lake_without_failing(monkeypatch) -> None:
    def mesh(model, kind):
        if model == "LSOFS":
            raise RuntimeError("catalog offline")
        return array("d", [42.0]), array("d", [-81.0])

    monkeypatch.setattr(service, "_model_mesh", mesh)
    payload = service.great_lakes_model_points("currents", (41, -83, 43, -80), ("LEOFS", "LSOFS"))

    assert payload["count"] == 1
    assert {item["model"]: item["available"] for item in payload["models"]} == {"LEOFS": True, "LSOFS": False}


def test_latest_waves_keep_height_period_and_direction() -> None:
    latest = LATEST.replace(
        "45026    41.982  -86.619 2026 10 02 16 30  200   5.0   6.0   MM   MM  MM  MM",
        "45026    41.982  -86.619 2026 10 02 16 30  200   5.0   6.0  1.3    5 4.4 270",
    )
    readings = observations.parse_latest_waves(latest, NOW)

    assert readings == {"45026": {"heightMeters": 1.3, "periodSeconds": 5.0, "directionDegrees": 270.0, "observedAt": "2026-10-02T16:30:00Z"}}
    assert observations.parse_latest_waves(LATEST, NOW) == {}  # "MM" means not measured


def test_wave_model_points_are_the_wave_grid_water_cells(monkeypatch) -> None:
    from backend import grib2
    from backend import great_lakes_waves as waves

    grid = grib2.RegularGrid(nx=3, ny=2, latitude1=42.0, longitude1=-83.0, latitude2=42.1, longitude2=-82.8, dx=0.1, dy=0.1, scan=0x40)
    hour = waves.WaveHour("r", 0, grid, array("f", [0.5, float("nan"), 0.7, 0.2, 0.3, 0.4]), array("f", [3.0] * 6), array("f", [90.0] * 6))
    monkeypatch.setattr(waves, "discovered_wave_run", lambda refresh=False, now=None: {"id": "r", "cycleEpoch": 0, "hours": [0]})
    monkeypatch.setattr(waves, "select_wave_hour", lambda run, offset, now=None: 0)
    monkeypatch.setattr(waves, "load_wave_hour", lambda run, hour_number: hour)

    payload = waves.wave_model_points((41.95, -83.05, 42.15, -82.85))
    assert payload["kind"] == "waves" and payload["count"] == 3  # the land cell and the eastern column are left out
    assert payload["points"] == [42.0, -83.0, 42.1, -83.0, 42.1, -82.9]
    assert waves.wave_model_points((41, -84, 43, -82), limit=2)["tooMany"] is True


def test_model_points_route_validates_kind_and_bounds(tmp_path) -> None:
    test_client = make_app(tmp_path).client
    with patch("backend.routes.environment.great_lakes_model_points", return_value={"points": []}) as lookup:
        assert test_client.get("/api/great-lakes/model-points?kind=salinity&south=41&west=-83&north=42&east=-82").status_code == 400
        assert test_client.get("/api/great-lakes/model-points?kind=currents&south=42&west=-83&north=41&east=-82").status_code == 400
        assert test_client.get("/api/great-lakes/model-points?kind=currents&south=nan&west=-83&north=42&east=-82").status_code == 400
        assert test_client.get("/api/great-lakes/model-points?kind=currents&west=-83&north=42&east=-82").status_code == 400
        response = test_client.get("/api/great-lakes/model-points?kind=currents&south=41&west=-83&north=42&east=-82&models=LEOFS")
    assert response.status_code == 200
    lookup.assert_called_once_with("currents", (41.0, -83.0, 42.0, -82.0), ("LEOFS",))
    with patch("backend.routes.environment.wave_model_points", return_value={"kind": "waves", "points": []}) as waves_lookup:
        assert test_client.get("/api/great-lakes/model-points?kind=waves&south=41&west=-83&north=42&east=-82").status_code == 200
    waves_lookup.assert_called_once_with((41.0, -83.0, 42.0, -82.0))


def test_observations_route_reports_provider_failure(tmp_path) -> None:
    test_client = make_app(tmp_path).client
    with patch("backend.routes.environment.great_lakes_observations", side_effect=RuntimeError("NDBC offline")):
        response = test_client.get("/api/great-lakes/observations")
    assert response.status_code == 503
    assert response.json["stations"] == []
    assert response.headers["Cache-Control"] == "no-store"
