"""NOAA run discovery, "Now" hour selection, cached volumes, and the background refresher."""

from __future__ import annotations

from array import array
from datetime import datetime, timezone

from backend import great_lakes_cache as cache
from backend import great_lakes_refresher as refresher
from backend import great_lakes_service as service
from backend import great_lakes_upwelling as upwelling
from backend import great_lakes_volumes as volumes
from conftest import make_app


def _epoch(text: str) -> float:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp()


def _catalog(*runs: tuple[str, str, range]) -> str:
    datasets = "".join(
        f'<dataset name="x" urlPath="NOAA/LEOFS/MODELS/x/leofs.t{cycle}z.{date}.regulargrid.f{hour:03d}.nc"/>'
        for date, cycle, hours in runs for hour in hours
    )
    return f'<catalog xmlns="http://www.unidata.ucar.edu/namespaces/thredds/InvCatalog/v1.0">{datasets}</catalog>'


def test_runs_still_being_published_are_not_used() -> None:
    runs = service.runs_from_catalog(_catalog(("20261002", "12", range(0, 121)), ("20261002", "18", range(0, 40))))

    assert [(run["id"], run["complete"]) for run in runs] == [("20261002t18z", False), ("20261002t12z", True)]
    assert runs[1]["cycleEpoch"] == _epoch("2026-10-02T12:00:00")
    assert runs[1]["files"][120].endswith("f120.nc")


def test_discovery_falls_back_to_the_previous_day_during_a_partial_00z_run(monkeypatch) -> None:
    catalogs = {
        "today": _catalog(("20261003", "00", range(0, 30))),
        "yesterday": _catalog(("20261002", "12", range(0, 121)), ("20261002", "18", range(0, 121))),
    }
    monkeypatch.setattr(service, "_day_catalogs", lambda model, count=2: ["today", "yesterday"])
    monkeypatch.setattr(service, "_get", catalogs.__getitem__)

    assert service._discover_model("LEOFS")["id"] == "20261002t18z"


def test_now_is_the_hour_nearest_the_current_time() -> None:
    run = {"cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: f"f{hour}" for hour in range(0, 121)}}

    # Published at 14:33 UTC, so "Now" is f003, not the run's 12:00 start.
    assert service.select_forecast_hour(run, 0, _epoch("2026-10-02T14:33:00")) == 3
    assert service.select_forecast_hour(run, 0, _epoch("2026-10-02T18:29:00")) == 6
    assert service.select_forecast_hour(run, 0, _epoch("2026-10-02T18:30:00")) == 7  # halves round up
    assert service.select_forecast_hour(run, 48, _epoch("2026-10-02T18:30:00")) == 55
    assert service.select_forecast_hour(run, 48, _epoch("2026-10-06T12:00:00")) == 120  # clamped to the run
    assert service.select_forecast_hour(run, 0, _epoch("2026-10-02T11:00:00")) == 0


def test_discovered_runs_keep_the_last_good_run_and_share_it(monkeypatch) -> None:
    good = {"id": "20261002t12z", "cycleEpoch": 1.0, "files": {0: "a", 120: "b"}}
    monkeypatch.setattr(service, "_discover_model", lambda model: good)
    assert service.discovered_runs(("LEOFS",), refresh=True)["LEOFS"]["id"] == "20261002t12z"

    def offline(model):
        raise OSError("NOAA unreachable")

    monkeypatch.setattr(service, "_discover_model", offline)
    assert service.discovered_runs(("LEOFS",), refresh=True)["LEOFS"]["id"] == "20261002t12z"

    # Another worker reads the shared file instead of asking NOAA.
    shared = cache.read_json(cache.path_for(service.RUNS_FILE))
    service._runs_state.clear()
    service._runs_disk_checked[0] = 0.0
    run = service.discovered_runs(("LEOFS",))["LEOFS"]
    assert shared["LEOFS"]["run"]["id"] == run["id"] == "20261002t12z"
    assert run["files"] == {0: "a", 120: "b"}  # JSON string keys are restored to hours


def test_ascii_numbers_keep_negative_signs() -> None:
    text = "Dataset {\n} x;\n---\nu_eastward[1][2]\n[0][0], -0.12, 0.30\n[0][1], 0.05, -1.5E-2\n"

    assert service._numbers(text, "u_eastward") == [-0.12, 0.3, 0.05, -0.015]


def test_volumes_download_once_then_come_from_disk(monkeypatch) -> None:
    calls = []

    def fetch(base_url, expression):
        calls.append(expression)
        return {
            "Latitude": ([2, 1], array("d", [41.0, 41.01])),
            "Longitude": ([1, 2], array("d", [-83.0, -82.99])),
            "mask": ([2, 2], array("d", [1, 1, 0, 1])),
            "temp": ([1, 2, 2, 2], array("f", [20, 21, -99999, 19, 15, 16, -99999, 14])),
        }

    monkeypatch.setattr(cache, "fetch_dods", fetch)
    arguments = ("temperature", "LEOFS", "20261002t12z", 3, "https://noaa.test/x", 2, 2, [0.0, 5.0], ["temp"])

    volume = volumes.load_volume(*arguments)
    volumes.clear_memory()
    again = volumes.load_volume(*arguments)

    assert len(calls) == 1
    assert "temp[0][0:1:1][0:1:1][0:1:1]" in calls[0]
    assert list(again.level("temp", 1)) == [15, 16, -99999, 14]
    assert again.profile("temp", 3) == [19, 14]
    assert list(again.wet) == [1, 1, 0, 1] == list(volume.wet)
    assert again.nearest_level(4) == 1


def test_refresher_schedules_run_checks_around_publication(monkeypatch) -> None:
    run = {"id": "20261002t12z", "cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: "x" for hour in range(121)}}
    runs = {model: run for model in service.MODELS}
    # LEOFS's 18z run is due about 20:35 UTC.
    assert refresher.in_publication_window(runs, _epoch("2026-10-02T20:40:00")) is True
    assert refresher.in_publication_window(runs, _epoch("2026-10-02T16:00:00")) is False
    assert refresher.expected_publication("LEOFS", run, 0) == _epoch("2026-10-02T20:35:00")


def test_refresher_tick_checks_runs_and_warms_each_new_hour(monkeypatch) -> None:
    from backend import great_lakes_animation as animation

    run = {"id": "20261002t12z", "cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: "x" for hour in range(121)}}
    clock = [_epoch("2026-10-02T16:00:00")]
    events = []
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: (events.append("runs-check") if refresh else None) or {model: run for model in models})
    monkeypatch.setattr(service, "warm_model_hour", lambda model, hour: events.append(f"warm {model} +{hour}"))
    monkeypatch.setattr(service, "_model_mesh", lambda model, kind: events.append("mesh"))
    monkeypatch.setattr(service, "_bathymetry_grid", lambda model: events.append("bathymetry"))
    monkeypatch.setattr(refresher.GreatLakesRefresher, "predraw", lambda self, offset=0: events.append(f"predraw +{offset}"))
    monkeypatch.setattr(service, "prune_rendered", lambda: events.append("prune-drawn"))
    monkeypatch.setattr(service, "prune_model_hours", lambda model, run, keep: events.append("keep " + ",".join(map(str, sorted(keep)))))
    monkeypatch.setattr(animation, "prepare", lambda layer: events.append(f"animate {layer}"))
    monkeypatch.setattr(animation, "prune", lambda: events.append("prune-animation"))
    monkeypatch.setattr(refresher.GreatLakesRefresher, "refresh_waves", lambda self: None)
    monkeypatch.setattr(service.time, "time", lambda: clock[0])

    worker = refresher.GreatLakesRefresher(clock=lambda: clock[0])
    worker.tick()
    assert events.count("runs-check") == 1
    # Every forecast choice and animation frame (16, 18 … 63 UTC) for every lake, "Now" first.
    frames = service.animation_offsets(clock[0])
    assert frames == (0, *range(2, 48, 3))
    warmed = [event for event in events if event.startswith("warm")]
    assert sorted(warmed) == sorted(f"warm {model} +{offset}" for model in service.MODELS for offset in {*service.FORECAST_OFFSETS, *frames})
    assert all(event.endswith("+0") for event in warmed[:len(service.MODELS)])
    assert events.count("mesh") == len(service.MODELS) * len(service.MODEL_POINT_KINDS)
    assert events.count("bathymetry") == len(service.MODELS)
    assert [event for event in events if event.startswith("predraw")] == [f"predraw +{offset}" for offset in service.FORECAST_OFFSETS]
    assert [event for event in events if event.startswith("animate")] == ["animate temperature", "animate thermocline", "animate currents", "animate upwelling"]
    # Files for every frame are kept (run hours 4 … 52), and nothing else.
    kept = {event for event in events if event.startswith("keep ")}
    assert kept == {"keep " + ",".join(map(str, sorted({4 + offset for offset in {*service.FORECAST_OFFSETS, *frames}})))}
    assert events.count("prune-drawn") == 1 and events.count("prune-animation") == 1
    assert worker.next_run_check - clock[0] == refresher.SLOW_RUN_CHECK_SECONDS  # 16:00 is between publications

    events.clear()
    clock[0] += 120
    worker.tick()  # same hour, nothing due
    assert events == []

    clock[0] = _epoch("2026-10-02T16:31:00")  # "Now" moves from f004 to f005
    worker.tick()
    assert [event for event in events if event.startswith("warm")] and "mesh" not in events
    assert "predraw +0" in events and "predraw +48" in events  # each new hour is drawn ahead of time
    assert "animate currents" in events
    assert cache.read_json(cache.path_for(refresher.STATUS_FILE))["lastWarm"] == "2026-10-02T16:31:00Z"


def test_status_route_reports_served_hour_and_next_run(monkeypatch, tmp_path) -> None:
    run = {"id": "20261002t12z", "cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: "x" for hour in range(121)}}
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: {model: run for model in models})

    status = refresher.data_status(("LEOFS",), now=_epoch("2026-10-02T18:10:00"))
    assert status["models"]["LEOFS"]["nowForecastHour"] == 6
    assert status["models"]["LEOFS"]["nowValidTime"] == "2026-10-02T18:00:00Z"
    assert status["models"]["LEOFS"]["nextRunExpectedAt"] == "2026-10-02T20:35:00Z"
    assert status["version"] == f"LEOFS:20261002t12z:6|draw:{service.TEMPERATURE_RASTER_RENDER_VERSION}.{service.THERMOCLINE_RASTER_RENDER_VERSION}.{service.CURRENT_RENDER_VERSION}.{upwelling.UPWELLING_RENDER_VERSION}"

    response = make_app(tmp_path).client.get("/api/great-lakes/status?models=LEOFS")
    assert response.status_code == 200
    assert response.json["models"]["LEOFS"]["run"] == "20261002t12z"
    assert response.headers["Cache-Control"] == "no-store"


def test_background_refresh_is_off_for_tests_and_configurable() -> None:
    from backend.config import AppConfig

    assert AppConfig.from_env({}).great_lakes_background_refresh is True
    assert AppConfig.from_env({"GREAT_LAKES_BACKGROUND_REFRESH": "false"}).great_lakes_background_refresh is False
    assert AppConfig().great_lakes_background_refresh is False


def test_drawn_layers_are_shared_through_disk_and_skip_failed_lakes() -> None:
    builds = []

    def build(available=True):
        builds.append(1)
        return {"rasters": ["image"], "metadata": {"models": [{"model": "LEOFS", "available": available}]}}

    key = ("test", "LEOFS:20261002t12z:7", 0, 256, ("LEOFS",), 1)
    first = service._shared_payload({}, key, build, 4)
    # Another worker (empty memory) reads the drawn layer from disk.
    second = service._shared_payload({}, key, build, 4)
    assert first == second and len(builds) == 1

    # The hourly bucket only bounds memory: a later hour reuses the same drawing from disk.
    later_hour = key[:-1] + (2,)
    assert service._shared_payload({}, later_hour, build, 4) == first and len(builds) == 1

    failed_key = ("test", "LEOFS:20261002t12z:8", 0, 256, ("LEOFS",), 1)
    service._shared_payload({}, failed_key, lambda: build(False), 4)
    service._shared_payload({}, failed_key, lambda: build(False), 4)
    assert len(builds) == 3  # a layer with an unavailable lake is retried, not stored


def test_a_layer_missing_a_lake_is_redrawn_after_a_short_wait(monkeypatch) -> None:
    """One NOAA hiccup must not hide a layer from memory until the hour changes."""
    builds = []
    available = [False]

    def build():
        builds.append(1)
        return {"rasters": ["image"], "metadata": {"models": [{"model": "LEOFS", "available": available[0]}]}}

    clock = [1_000_000.0]
    monkeypatch.setattr(service.time, "time", lambda: clock[0])
    memory: dict = {}
    key = ("test-retry", "LEOFS:20261002t12z:7", 0, 256, ("LEOFS",), 1)
    service._shared_payload(memory, key, build, 4)
    service._shared_payload(memory, key, build, 4)
    assert len(builds) == 1  # served from memory within the retry window

    available[0] = True
    clock[0] += service.INCOMPLETE_RETRY_SECONDS + 1
    redrawn = service._shared_payload(memory, key, build, 4)
    assert len(builds) == 2 and redrawn["metadata"]["models"][0]["available"]
    clock[0] += 10 * service.INCOMPLETE_RETRY_SECONDS
    service._shared_payload(memory, key, build, 4)
    assert len(builds) == 2  # a complete layer stays cached


def test_uncached_forecast_hours_download_one_depth_first(monkeypatch) -> None:
    run = {"id": "20261002t12z", "cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: f"f{hour}" for hour in range(121)}}
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: {model: run for model in models})
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda path: (2, 2, [0.0, 2.0, 4.0]))
    monkeypatch.setattr(service, "_metadata", lambda path: {"temperature": "temp", "u": "u", "v": "v"})
    expressions, prefetched = [], []

    def fetch(base_url, expression):
        expressions.append(expression)
        levels = 1 if "temp[0][1:1:1]" in expression else 3
        return {
            "Latitude": ([2, 1], array("d", [41.0, 41.01])),
            "Longitude": ([1, 2], array("d", [-83.0, -82.99])),
            "mask": ([2, 2], array("d", [1, 1, 1, 1])),
            "temp": ([1, levels, 2, 2], array("f", [float(index) for index in range(4 * levels)])),
        }

    monkeypatch.setattr(cache, "fetch_dods", fetch)
    monkeypatch.setattr(volumes, "prefetch_volume", lambda *args: prefetched.append(args[:4]))

    _, hour, _, _, volume, layer = service._model_depth("temperature", "LEOFS", 6, 2.0)

    assert len(expressions) == 1 and "temp[0][1:1:1]" in expressions[0]  # only the 2 m level
    assert volume.depths == [2.0] and layer == 0
    assert prefetched == [("temperature", "LEOFS", "20261002t12z", hour)]  # full volume follows in the background

    volumes.load_volume("temperature", "LEOFS", "20261002t12z", hour, "x", 2, 2, [0.0, 2.0, 4.0], ["temp"])
    assert "Latitude" not in expressions[-1] and "mask" not in expressions[-1]  # fixed grid is not downloaded again
    _, _, _, _, full, layer = service._model_depth("temperature", "LEOFS", 6, 4.0)
    assert full.depths == [0.0, 2.0, 4.0] and layer == 2  # once the full volume exists it is used directly

def test_hours_no_longer_shown_are_deleted_within_a_run() -> None:
    run = {"id": "20261002t12z"}
    directory = cache.path_for("models", "LEOFS", run["id"])
    directory.mkdir(parents=True)
    for name in ("temperature-f006-2x2-v1.bin", "temperature-f007-2x2-v1.bin", "temperature-f007-2x2-L00-v1.bin", "velocity-f031-9x6-v1.bin", "thermocline-f006-2x2-v16.bin"):
        (directory / name).write_bytes(b"x")

    service.prune_model_hours("LEOFS", run, {7, 31})

    assert sorted(item.name for item in directory.iterdir()) == ["temperature-f007-2x2-L00-v1.bin", "temperature-f007-2x2-v1.bin", "velocity-f031-9x6-v1.bin"]


def test_model_bathymetry_interpolates_water_cells_and_names_the_lake(monkeypatch) -> None:
    grid = {"latitudeAxis": [45.0, 45.01], "longitudeAxis": [-85.0, -84.99, -84.98], "columns": 3,
            "wet": array("B", [1, 1, 0, 1, 1, 0]), "depth": array("f", [10, 20, 0, 30, 40, 0])}
    monkeypatch.setattr(service, "_bathymetry_grid", lambda model: grid if model == "LMHOFS" else None)

    centre = service.model_bathymetry_depth(45.005, -84.995)
    assert centre["model"] == "LMHOFS" and abs(centre["depthMeters"] - 25.0) < 1e-6
    assert centre["lake"] == "Michigan"  # west of the Straits of Mackinac
    # Only wet corners contribute; the dry column never pulls depths toward zero.
    assert abs(service.model_bathymetry_depth(45.005, -84.985)["depthMeters"] - 30.0) < 1e-6
    assert service.model_bathymetry_depth(44.0, -84.995) is None  # outside the grid
    assert service.lake_name_for_model("LMHOFS", -82.0) == "Huron"
    assert service.lake_name_for_model("LEOFS", -81.0) == "Erie"

def test_requested_depths_snap_to_the_levels_noaa_stores(monkeypatch) -> None:
    run = {"id": "r", "files": {0: "f0"}}
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: {model: run for model in models})
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda path: (2, 2, [0.0, 1.0, 2.0, 4.0, 6.0]))

    assert service.depth_levels(("LEOFS",)) == [0.0, 1.0, 2.0, 4.0, 6.0]
    assert [service.snap_depth(depth, ("LEOFS",)) for depth in (0, 1, 3, 4, 5, 9)] == [0.0, 1.0, 2.0, 4.0, 4.0, 6.0]


def test_predraw_draws_exactly_what_the_map_requests(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(service, "depth_levels", lambda models=service.MODELS: [0.0, 2.0, 10.0, 30.0, 60.0])
    monkeypatch.setattr(service, "great_lakes_temperature_rasters", lambda hour, depth, resolution, models: calls.append(("temperature", hour, depth, resolution, models)))
    monkeypatch.setattr(service, "great_lakes_payload", lambda kind, hour, depth, models: calls.append((kind, hour, depth, None, models)))
    monkeypatch.setattr(service, "great_lakes_thermocline_rasters", lambda hour, resolution, models: calls.append(("thermocline", hour, None, resolution, models)))
    monkeypatch.setattr(upwelling, "upwelling_rasters", lambda hour, resolution, models: calls.append(("upwelling", hour, None, resolution, models)))
    worker = refresher.GreatLakesRefresher()

    worker.predraw(0)
    # Every lake together at full detail, at each level down to ~100 ft for "Now".
    assert {call[4] for call in calls} == {service.MODELS}
    assert {call[3] for call in calls if call[3] is not None} == {refresher.MAP_RESOLUTION}
    assert sorted({call[2] for call in calls if call[0] == "temperature"}) == [0.0, 2.0, 10.0, 30.0]
    assert sum(1 for call in calls if call[0] == "thermocline") == 1

    calls.clear()
    worker.predraw(24)
    assert sorted({call[2] for call in calls if call[0] in ("temperature", "currents")}) == [0.0]  # forecasts at the surface

def test_a_run_with_only_raw_fields_files_does_not_replace_the_regular_grid_run(monkeypatch) -> None:
    def files(date, cycle, kind, hours):
        return "".join(f'<dataset name="x" urlPath="NOAA/LOOFS/MODELS/x/loofs.t{cycle}z.{date}.{kind}.f{hour:03d}.nc"/>' for hour in hours)

    # 18z: fields complete, regular grid not published yet; 12z: complete.
    catalog = ('<catalog xmlns="http://www.unidata.ucar.edu/namespaces/thredds/InvCatalog/v1.0">'
               + files("20261002", "18", "fields", range(0, 121)) + files("20261002", "12", "regulargrid", range(0, 121))
               + files("20261002", "12", "fields", range(0, 121)) + "</catalog>")
    monkeypatch.setattr(service, "_day_catalogs", lambda model, count=2: ["today"])
    monkeypatch.setattr(service, "_get", lambda url: catalog)

    run = service._discover_model("LOOFS")
    assert (run["id"], run["kind"]) == ("20261002t12z", "regulargrid")

def test_cache_bucket_changes_when_now_moves_to_the_next_hour(monkeypatch) -> None:
    times = iter([_epoch("2026-10-02T18:30:00"), _epoch("2026-10-02T19:00:00"), _epoch("2026-10-02T19:29:59"), _epoch("2026-10-02T19:30:00")])
    monkeypatch.setattr(service.time, "time", lambda: next(times))
    before, on_the_hour, before_half, half_past = (service._cache_bucket() for _ in range(4))
    # Drawn layers stay valid from :30 to :30, matching "Now" and the refresher.
    assert before == on_the_hour == before_half
    assert half_past == before + 1


def test_a_lake_shallower_than_the_requested_depth_is_left_blank(monkeypatch) -> None:
    run = {"id": "20261002t12z", "cycleEpoch": _epoch("2026-10-02T12:00:00"), "files": {hour: f"f{hour}" for hour in range(121)}}
    monkeypatch.setattr(service, "discovered_runs", lambda models=service.MODELS, refresh=False: {model: run for model in models})
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda path: (2, 2, [0.0, 30.0, 60.0]))

    def no_download(*_args):
        raise AssertionError("a lake too shallow for the depth must not be downloaded")

    monkeypatch.setattr(cache, "fetch_dods", no_download)
    try:
        service._model_depth("temperature", "LEOFS", 0, 125.0)
    except service.LakeTooShallow as shallow:
        assert shallow.metadata() == {"model": "LEOFS", "available": True, "tooShallow": True, "maxDepthMeters": 60.0, "validTime": None}
    else:
        raise AssertionError("expected LakeTooShallow")

    inputs, metadata, fields = service._temperature_inputs(0, 125.0, 512, ("LEOFS",))
    assert inputs == [] and fields == [] and metadata[0]["tooShallow"] is True
