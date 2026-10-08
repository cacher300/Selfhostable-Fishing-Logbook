"""NOAA GLWU wave layer: GRIB2 decoding, run discovery, cached hours, drawing, and refresh."""

from __future__ import annotations

import math
import struct
from array import array
from datetime import datetime, timezone

from backend import grib2
from backend import great_lakes_animation as animation
from backend import great_lakes_cache as cache
from backend import great_lakes_refresher as refresher
from backend import great_lakes_service as service
from backend import great_lakes_waves as waves
from backend.great_lakes_render import GridAxes, WaterMask
from conftest import make_app


def _epoch(text: str) -> float:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp()


def _lambert_section() -> bytes:
    header = struct.pack(">IBBIBBH", 81, 3, 0, 6, 0, 0, 30)
    earth = bytes([6]) + bytes(15)
    grid = struct.pack(">IIiIB", 3, 2, 42_000_000, 277_000_000, 0)
    projection = struct.pack(">IIIIBBIIiI", 25_000_000, 265_000_000, 2_539_703, 2_539_703, 0, 0x40, 25_000_000, 25_000_000, -90_000_000 | 0, 0)
    section = header + earth + grid + projection
    # Sign-and-magnitude: the southern pole latitude is -90°.
    section = section[:73] + struct.pack(">I", 0x80000000 | 90_000_000) + section[77:]
    assert len(section) == 81
    return section


def _complex_message() -> bytes:
    """3 × 2 field [0.5, 0.7, missing, 0.8, 1.2, 1.1] packed as template 5.3 (order 1)."""
    section5 = struct.pack(">IBIH", 49, 5, 6, 3) + struct.pack(">fHHBBBB", 0.0, 0, 1, 4, 0, 1, 1)
    section5 += struct.pack(">IIIBBIBIBBB", 0x6258D19A, 0xFFFFFFFF, 2, 0, 2, 3, 1, 3, 1, 1, 2)
    assert len(section5) == 49
    # First value 5, minimum difference -1; groups [0, 3, missing] and [2, 5, 0] at 3 bits.
    data = bytes([0x00, 0x05, 0x80, 0x01, 0x00, 0xF0, 0x00, 0x0F, 0xAA, 0x00])
    sections = (
        struct.pack(">IB", 21, 1) + bytes(16)
        + _lambert_section()
        + struct.pack(">IBHH", 34, 4, 0, 0) + bytes(25)
        + section5
        + struct.pack(">IBB", 6, 6, 255)
        + struct.pack(">IB", 5 + len(data), 7) + data
        + b"7777"
    )
    return b"GRIB" + bytes([0, 0, 10, 2]) + struct.pack(">Q", 16 + len(sections)) + sections


def test_grib2_complex_packing_with_spatial_differencing_and_lambert_grid() -> None:
    message = grib2.decode(_complex_message())

    values = [None if math.isnan(value) else round(value, 6) for value in message.values]
    assert values == [0.5, 0.7, None, 0.8, 1.2, 1.1]
    grid = message.grid
    assert isinstance(grid, grib2.LambertGrid)
    assert (grid.nx, grid.ny, grid.orientation, grid.radius) == (3, 2, -95.0, 6371229.0)
    latitude, longitude = grid.coordinates(0, 0)
    assert math.isclose(latitude, 42.0, abs_tol=1e-6) and math.isclose(longitude, -83.0, abs_tol=1e-6)
    i, j = grid.index(*grid.coordinates(1.5, 0.75))
    assert math.isclose(i, 1.5, abs_tol=1e-6) and math.isclose(j, 0.75, abs_tol=1e-6)
    # One cell east is about 2.5 km away; one cell north (+j scanning) is further north.
    assert grid.coordinates(0, 1)[0] > latitude
    assert grib2.grid_from_header(grid.to_header()) == grid


def test_grib2_simple_packing_reads_sign_magnitude_scales() -> None:
    section5 = struct.pack(">IBIH", 21, 5, 4, 0) + struct.pack(">fHHBB", 10.0, 0x8001, 1, 4, 0)
    values = grib2._simple(section5, bytes([0x01, 0x2F]), 4)
    assert values == [1.0, 1.05, 1.1, 1.75]  # (10 + x / 2) / 10


def _index(cycle: str, last_hour: int) -> str:
    lines, offset, number = [], 0, 1
    for hour in range(0, last_hour + 1):
        label = "anl" if hour == 0 else f"{hour} hour fcst"
        for variable in ("WIND", "HTSGW", "PERPW", "DIRPW", "WVDIR"):
            lines.append(f"{number}:{offset}:d={cycle}:{variable}:surface:{label}:")
            number += 1
            offset += 1000
    return "\n".join(lines) + "\n"


def test_runs_need_the_final_forecast_hour_and_skip_missing_cycles(monkeypatch) -> None:
    epoch = _epoch("2026-10-02T21:00:00")
    assert waves.run_from_index(epoch, _index("2026100221", 30)) is None

    run = waves.run_from_index(epoch, _index("2026100221", 48))
    assert run["id"] == "20261002t21z"
    assert run["url"].endswith("/glwu.20261002/glwu.grlc_2p5km_sr.t21z.grib2")
    assert run["hours"] == list(range(49))
    assert run["messages"]["HTSGW"]["0"] == [1000, 2000]
    assert run["messages"]["DIRPW"]["48"] == [48 * 5000 + 3000, 48 * 5000 + 4000]

    pages = {
        waves.cycle_url(_epoch("2026-10-02T22:00:00"), ".idx"): None,  # not published yet
        waves.cycle_url(_epoch("2026-10-02T21:00:00"), ".idx"): _index("2026100221", 20),  # still running
        waves.cycle_url(_epoch("2026-10-02T20:00:00"), ".idx"): _index("2026100220", 48),
    }
    monkeypatch.setattr(waves, "_get_text", lambda url: pages.get(url))
    assert waves.discover(_epoch("2026-10-02T22:04:00"))["id"] == "20261002t20z"


def test_discovered_run_is_shared_and_kept_when_noaa_is_unreachable(monkeypatch) -> None:
    good = waves.run_from_index(_epoch("2026-10-02T20:00:00"), _index("2026100220", 48))
    monkeypatch.setattr(waves, "discover", lambda now=None: good)
    assert waves.discovered_wave_run(refresh=True)["id"] == "20261002t20z"

    def offline(now=None):
        raise OSError("NOMADS unreachable")

    monkeypatch.setattr(waves, "discover", offline)
    assert waves.discovered_wave_run(refresh=True)["id"] == "20261002t20z"
    waves.clear_memory()
    assert waves.known_run()["id"] == "20261002t20z"  # another worker reads the shared file


def test_now_is_the_wave_frame_nearest_the_current_time() -> None:
    run = {"cycleEpoch": _epoch("2026-10-02T20:00:00"), "hours": list(range(49))}

    assert waves.select_wave_hour(run, 0, _epoch("2026-10-02T21:10:00")) == 1
    assert waves.select_wave_hour(run, 0, _epoch("2026-10-02T21:30:00")) == 2
    assert waves.select_wave_hour(run, 48, _epoch("2026-10-02T21:10:00")) == 48  # clamped to the run


def test_wave_hours_download_three_fields_once(monkeypatch) -> None:
    run = waves.run_from_index(_epoch("2026-10-02T20:00:00"), _index("2026100220", 48))
    requested = []

    def fetch(url, start, end):
        requested.append((start, end))
        return _complex_message()

    monkeypatch.setattr(waves, "_get_range", fetch)
    first = waves.load_wave_hour(run, 3)
    waves.clear_memory()
    again = waves.load_wave_hour(run, 3)

    assert sorted(requested) == sorted(tuple(run["messages"][name]["3"]) for name in ("HTSGW", "PERPW", "DIRPW"))
    assert again.grid == first.grid
    assert [round(value, 3) for value in again.height if value == value] == [0.5, 0.7, 0.8, 1.2, 1.1]


def _regular_wave_hour() -> waves.WaveHour:
    grid = grib2.RegularGrid(nx=4, ny=3, latitude1=42.0, longitude1=-83.0, latitude2=42.2, longitude2=-82.7, dx=0.1, dy=0.1, scan=0x40)
    nan = math.nan
    height = array("f", [0.2, 0.4, 0.6, nan, 0.4, 0.8, 1.6, nan, 0.6, 1.2, 2.4, nan])
    period = array("f", [3.0] * 12)
    direction = array("f", [350.0, 10.0, 270.0, nan] * 3)
    return waves.WaveHour("20261002t20z", 1, grid, height, period, direction)


def _target(model: str) -> dict:
    latitudes, longitudes = [42.0, 42.05, 42.1, 42.15, 42.2], [-83.0, -82.95, -82.9, -82.85, -82.8, -82.75, -82.7]
    wet = [True] * (len(latitudes) * len(longitudes))
    wet[0] = False
    return {
        "model": model, "rows": len(latitudes), "columns": len(longitudes), "yStride": 1, "xStride": 1,
        "latitudeAxis": latitudes, "longitudeAxis": longitudes, "wet": wet,
        "axes": GridAxes.from_axes(latitudes, longitudes, 1, 1),
        "water": WaterMask(len(latitudes), len(longitudes), 1, 1, bytes(255 if item else 0 for item in wet)),
    }


def test_wave_layer_is_drawn_per_lake_with_arrows_and_point_values(monkeypatch) -> None:
    run = {"id": "20261002t20z", "cycleEpoch": _epoch("2026-10-02T20:00:00"), "hours": list(range(49))}
    monkeypatch.setattr(waves, "discovered_wave_run", lambda refresh=False, now=None: run)
    monkeypatch.setattr(waves, "select_wave_hour", lambda run, offset, now=None: 1 + offset)
    monkeypatch.setattr(waves, "load_wave_hour", lambda run, hour: _regular_wave_hour())
    monkeypatch.setattr(service, "model_render_grid", _target)

    payload = waves.wave_rasters(0, 512, ("LEOFS",))
    metadata = payload["metadata"]
    assert [item["model"] for item in payload["rasters"]] == ["LEOFS"]
    assert payload["rasters"][0]["imageUrl"].startswith("data:image/")
    assert metadata["validTime"] == "2026-10-02T21:00:00Z" and metadata["models"][0]["available"] is True
    assert metadata["minHeightMeters"] == 0.0 and metadata["maxHeightMeters"] == waves.WAVE_COLOR_RANGE_METERS[1]
    assert payload["arrows"] and all(0 <= arrow["directionDegrees"] < 360 for arrow in payload["arrows"])
    # Drawn once, then shared through the disk cache.
    assert cache.read_json(service._rendered_path((waves.WAVE_RENDER_VERSION, run["id"], 1, 512, ("LEOFS",), None, service._cache_bucket()))) is not None

    value = waves.wave_value(0, 42.1, -82.9)
    assert value["available"] is True
    assert math.isclose(value["heightMeters"], 0.8, abs_tol=0.01)
    assert value["directionDegrees"] == 10  # nearest cell, never a circular average
    assert waves.wave_value(0, 42.1, -82.7)["heightMeters"] > 0  # shoreline gap falls back to the nearest water cell
    assert waves.wave_value(0, 45.0, -80.0) == {"available": False}


def test_wave_layer_reports_unavailable_without_a_run(monkeypatch) -> None:
    monkeypatch.setattr(waves, "discovered_wave_run", lambda refresh=False, now=None: {"error": "NOMADS unreachable"})

    payload = waves.wave_rasters(0, 512, ("LEOFS",))
    assert payload["rasters"] == [] and payload["metadata"]["models"][0]["available"] is False


def test_refresher_warms_and_draws_each_new_wave_hour(monkeypatch) -> None:
    run = {"id": "20261002t20z", "cycleEpoch": _epoch("2026-10-02T20:00:00"), "hours": list(range(49))}
    clock = [_epoch("2026-10-02T20:10:00")]
    events = []
    monkeypatch.setattr(waves, "discovered_wave_run", lambda refresh=False, now=None: events.append("check") or run)
    monkeypatch.setattr(waves, "known_run", lambda: run)
    monkeypatch.setattr(waves, "warm_wave_hours", lambda offsets, now=None: events.append("warm"))
    monkeypatch.setattr(waves, "wave_rasters", lambda offset, resolution, models: events.append(f"draw +{offset}") or {"metadata": {"models": [{"available": True}]}})
    monkeypatch.setattr(animation, "prepare", lambda layer: events.append(f"animate {layer}"))

    worker = refresher.GreatLakesRefresher(clock=lambda: clock[0])
    worker.refresh_waves()
    assert events == ["check", "warm"] + [f"draw +{offset}" for offset in service.FORECAST_OFFSETS] + ["animate waves"]

    events.clear()
    clock[0] += 60
    worker.refresh_waves()  # same hour, run checked recently
    assert events == []

    clock[0] = _epoch("2026-10-02T20:40:00")  # "Now" moves to the next frame
    worker.refresh_waves()
    assert events[:2] == ["check", "warm"] and "draw +48" in events


def test_wave_routes_and_status_version(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: {model: {"error": "offline"} for model in models})
    status = refresher.data_status(("LEOFS",))
    assert status["wavesVersion"] == f"waves:none|draw:{waves.WAVE_RENDER_VERSION}" and status["waves"]["available"] is False

    run = {"id": "20261002t20z", "cycleEpoch": _epoch("2026-10-02T20:00:00"), "hours": list(range(49))}
    monkeypatch.setattr(waves, "known_run", lambda: run)
    status = refresher.data_status(("LEOFS",), now=_epoch("2026-10-02T21:10:00"))
    assert status["wavesVersion"] == f"waves:20261002t20z:1|draw:{waves.WAVE_RENDER_VERSION}"
    assert status["waves"]["nextRunExpectedAt"] == "2026-10-02T21:05:00Z"
    run = {**run, "id": "20261002t18z", "cycleEpoch": _epoch("2026-10-02T18:00:00")}
    # The longer 01/07/13/19 UTC runs are published about half an hour later.
    assert refresher.data_status(("LEOFS",))["waves"]["nextRunExpectedAt"] == "2026-10-02T19:36:00Z"

    monkeypatch.setattr("backend.routes.environment.wave_rasters", lambda forecast_hour, resolution, models: {"rasters": [], "arrows": [], "metadata": {"forecastHour": forecast_hour}})
    monkeypatch.setattr(service, "animation_offsets", lambda now=None: (0,))
    client = make_app(tmp_path).client
    response = client.get("/api/great-lakes/waves-raster?forecastHour=7&resolution=512")
    assert response.status_code == 200
    assert response.json["metadata"]["forecastHour"] == 6
    assert response.headers["Cache-Control"] == "private, max-age=600"
    assert client.get("/api/great-lakes/wave-value?forecastHour=0&latitude=nope&longitude=-81").status_code == 400


def test_wave_animation_failure_keeps_refresher_eligible_for_retry(monkeypatch) -> None:
    run = {"id": "20261002t20z", "cycleEpoch": _epoch("2026-10-02T20:00:00"), "hours": list(range(49))}
    clock = [_epoch("2026-10-02T20:10:00")]
    monkeypatch.setattr(waves, "known_run", lambda: run)
    monkeypatch.setattr(waves, "warm_wave_hours", lambda *args: None)
    monkeypatch.setattr(waves, "wave_rasters", lambda *args: {"metadata": {"models": [{"available": True}]}})
    def unavailable(layer):
        raise RuntimeError("animation unavailable")
    monkeypatch.setattr(animation, "prepare", unavailable)
    worker = refresher.GreatLakesRefresher(clock=lambda: clock[0])
    worker.refresh_waves(check_source=False)
    assert worker.waves_signature is None
    assert worker.wave_retry_at == clock[0] + refresher.RETRY_SECONDS
    assert "lastWaveWarm" not in worker.state
    monkeypatch.setattr(animation, "prepare", lambda layer: {})
    clock[0] = worker.wave_retry_at
    worker.refresh_waves(check_source=False)
    assert worker.waves_signature == (run["id"], waves.select_wave_hour(run, 0, clock[0]))
    assert worker.wave_retry_at == 0 and "lastWaveWarm" in worker.state
