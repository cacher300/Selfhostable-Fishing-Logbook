"""Preparation reuse, process coordination, and recovery from partial data."""

import multiprocessing
import threading
from array import array
from concurrent.futures import Future, ProcessPoolExecutor, ThreadPoolExecutor
from concurrent.futures.process import BrokenProcessPool

import pytest

from backend import great_lakes_animation as animation
from backend import great_lakes_cache as cache
from backend import great_lakes_refresher as refresher
from backend import great_lakes_service as service
from backend import great_lakes_waves as waves


def test_default_drawing_workers_are_bounded_by_cpu_count(monkeypatch):
    monkeypatch.delenv("GREAT_LAKES_PREPARE_WORKERS")
    monkeypatch.setattr(refresher.os, "cpu_count", lambda: 20)
    assert refresher.preparation_workers() == 4
    monkeypatch.setattr(refresher.os, "cpu_count", lambda: 1)
    assert refresher.preparation_workers() == 1


def test_spawned_drawing_process_cannot_start_another_refresher(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from backend import app_factory
    from backend.config import AppConfig

    monkeypatch.setattr(app_factory.multiprocessing, "current_process", lambda: SimpleNamespace(name="SpawnProcess-1"))
    monkeypatch.setattr(app_factory, "GreatLakesRefresher", lambda: pytest.fail("Spawned worker started a refresher"))
    app = app_factory.create_app(AppConfig(data_dir=tmp_path, great_lakes_cache_dir=str(cache.cache_dir()),
                                         great_lakes_background_refresh=True))
    assert "fish.great_lakes_refresher" not in app.extensions


def test_wave_animation_reuses_ordinary_fixed_scale_drawing(monkeypatch):
    monkeypatch.setattr(waves, "discovered_wave_run", lambda: {"id": "wave-run"})
    monkeypatch.setattr(waves, "select_wave_hour", lambda *args: 6)
    keys = []
    monkeypatch.setattr(service, "_shared_payload", lambda memory, key, build, count: keys.append(key) or {})
    waves.wave_rasters(6, 512)
    waves.wave_rasters(6, 512, scale=(0.0, 6.0))
    assert keys[0] == keys[1]


def test_temperature_range_preserves_desktop_colours_without_encoding(monkeypatch):
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("LEOFS", "run", 6),))
    monkeypatch.setattr(service, "snap_depth", lambda depth, models: depth)
    inputs = [{"model": "LEOFS", "grid": service.ScalarGrid([10.0, 12.0, 16.0, 20.0], [True] * 4, 2, 2, 1, 1)}]
    monkeypatch.setattr(service, "_temperature_inputs", lambda *args: (inputs, [{"model": "LEOFS", "available": True}], []))
    rendered = []
    monkeypatch.setattr(service, "_render_rasters", lambda *args: rendered.append(1) or [])
    expected = service._build_temperature_rasters(("fields", 1), 0, 10, 512, ("LEOFS",))["metadata"]
    actual = service.temperature_range_metadata(0, 10, 512, ("LEOFS",))
    assert (actual["minC"], actual["maxC"]) == (expected["minC"], expected["maxC"])
    assert (actual["minC"], actual["maxC"]) != (0.0, 30.0)
    assert rendered == [1]


def _offline_dataset_info(directory, path):
    cache.configure(directory)
    service._dds_cache.clear()
    service._dimensions_cache.clear()

    def offline(*args, **kwargs):
        raise AssertionError("A new worker must reuse metadata without contacting NOAA")

    service._get = offline
    cache.fetch_dods = offline
    return service._dds(path), service._regular_grid_dimensions(path)


def test_dataset_metadata_is_shared_with_new_processes_and_scoped_to_a_run(monkeypatch):
    dds = "Dataset { Float64 Latitude[ny = 2][nx = 3]; Float32 Depth[Depth = 2]; } x;"
    lookups = []
    monkeypatch.setattr(service, "_get", lambda url: lookups.append(url) or dds)
    monkeypatch.setattr(cache, "fetch_dods", lambda *args: lookups.append(args) or {"Depth": ([2], array("f", [0, 10]))})
    path = "NOAA/LEOFS/leo.t12z.20261008.regulargrid.f000.nc"
    assert service._regular_grid_dimensions(path) == (2, 3, [0.0, 10.0])

    with ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn")) as pool:
        saved_dds, dimensions = pool.submit(_offline_dataset_info, str(cache.cache_dir()), path.replace("f000", "f006")).result(timeout=20)
    assert saved_dds == dds and dimensions == (2, 3, [0.0, 10.0])
    assert len(lookups) == 2

    service._regular_grid_dimensions(path.replace("20261008", "20261009"))
    assert len(lookups) == 4


def test_invalid_dataset_response_is_retried(monkeypatch):
    path = "NOAA/LEOFS/leo.t12z.20261008.regulargrid.f000.nc"
    responses = iter(["<html>Service unavailable</html>", "Dataset { Float32 temp[time = 1]; } x;"])
    monkeypatch.setattr(service, "_get", lambda url: next(responses))
    with pytest.raises(RuntimeError, match="invalid dataset"):
        service._dds(path)
    assert "Float32 temp" in service._dds(path)


def test_concurrent_cache_misses_only_build_once(tmp_path):
    start = threading.Barrier(4)
    building, release = threading.Event(), threading.Event()
    builds = []
    target = tmp_path / "metadata.json"

    def build():
        builds.append(1)
        building.set()
        assert release.wait(3)
        return {"ok": True}

    def lookup():
        start.wait(timeout=3)
        return cache.get_or_create_json(target, build, valid=lambda value: isinstance(value, dict))

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(lookup) for _ in range(4)]
        try:
            assert building.wait(3)
        finally:
            release.set()
        assert [future.result(timeout=3) for future in futures] == [{"ok": True}] * 4
    assert builds == [1]


def test_cache_lock_timeout_recovers_after_owner_releases(tmp_path):
    target = tmp_path / "metadata.json"
    lock = cache.LeaderLock(target.with_suffix(".lock"))
    assert lock.acquire()
    try:
        with pytest.raises(TimeoutError):
            cache.get_or_create_json(target, lambda: {"ok": True}, valid=lambda value: isinstance(value, dict), timeout=0)
    finally:
        lock.release()
    assert cache.get_or_create_json(target, lambda: {"ok": True}, valid=lambda value: isinstance(value, dict)) == {"ok": True}


@pytest.mark.parametrize("layer", ["currents", "thermocline", "temperature"])
def test_ranges_reuse_the_same_data_across_hours_and_invalidate_for_new_runs(monkeypatch, layer):
    selected = ["r1"]
    bucket = [1]
    builds = []
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("LEOFS", selected[0], 9),))
    monkeypatch.setattr(service, "_cache_bucket", lambda: bucket[0])
    monkeypatch.setattr(service, "snap_depth", lambda depth, models: depth)
    fields = ("minSpeedMetersPerSecond", "maxSpeedMetersPerSecond") if layer == "currents" else (("minDepthMeters", "maxDepthMeters") if layer == "thermocline" else ("minC", "maxC"))
    metadata = {fields[0]: 0.0, fields[1]: 12.0, "models": [{"model": "LEOFS", "available": True}]}

    def build(*args, **kwargs):
        builds.append(1)
        return {"metadata": metadata}

    monkeypatch.setattr(service, "_build_payload" if layer == "currents" else ("_build_thermocline_rasters" if layer == "thermocline" else "_build_temperature_rasters"), build)
    lookup = (lambda hour: service.current_range_metadata(hour, 10, ("LEOFS",))) if layer == "currents" else (
        lambda hour: service.thermocline_range_metadata(hour, 512, ("LEOFS",))) if layer == "thermocline" else (
        lambda hour: service.temperature_range_metadata(hour, 10, 512, ("LEOFS",)))
    assert lookup(3) == metadata
    bucket[0] += 1
    service._range_metadata_cache.clear()  # Another worker, or the next hourly pass.
    assert lookup(2) == metadata and builds == [1]
    selected[0] = "r2"
    assert lookup(2) == metadata and builds == [1, 1]


def test_partial_ranges_are_retried_instead_of_saved(monkeypatch):
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("LEOFS", "r1", 9),))
    monkeypatch.setattr(service, "snap_depth", lambda depth, models: depth)
    builds = []

    def build(*args, **kwargs):
        builds.append(1)
        return {"metadata": {"minSpeedMetersPerSecond": 0.0, "maxSpeedMetersPerSecond": 0.2,
                             "models": [{"model": "LEOFS", "available": len(builds) > 1}]}}

    monkeypatch.setattr(service, "_build_payload", build)
    assert not service.current_range_metadata(0, 10)["models"][0]["available"]
    assert service.current_range_metadata(0, 10)["models"][0]["available"]
    assert builds == [1, 1]


@pytest.mark.parametrize("layer,expected", [("waves", (0.0, 6.0)), ("upwelling", (-8.0, 8.0))])
def test_fixed_ranges_skip_frame_scanning(monkeypatch, layer, expected):
    monkeypatch.setattr(animation, "layer_payload", lambda *args: pytest.fail("Fixed range scanned a frame"))
    steps = []
    assert animation._compute_scale(layer, 0, (0, 3, 6), lambda: steps.append(1)) == expected
    assert len(steps) == 3


def test_drawing_process_pool_is_reused_and_stopped(monkeypatch):
    monkeypatch.setenv("GREAT_LAKES_PREPARE_WORKERS", "2")
    pools, draws = [], []

    def create_pool(**kwargs):
        pool = ThreadPoolExecutor(max_workers=kwargs["max_workers"])
        pools.append(pool)
        return pool

    monkeypatch.setattr(refresher, "ProcessPoolExecutor", create_pool)
    monkeypatch.setattr(refresher, "_draw_view", lambda *task: draws.append(task))
    worker = refresher.GreatLakesRefresher()
    try:
        worker._draw_tasks([("temperature", 0, 0.0)], "now")
        worker._draw_tasks([("currents", 6, 0.0)], "forecast")
        assert len(pools) == 1 and len(draws) == 2
    finally:
        worker.stop()
    assert worker._pool is None
    with pytest.raises(RuntimeError):
        pools[0].submit(lambda: None)


def test_broken_drawing_pool_is_replaced_on_retry(monkeypatch):
    monkeypatch.setenv("GREAT_LAKES_PREPARE_WORKERS", "2")
    closed = []

    class BrokenPool:
        def submit(self, *args):
            future = Future()
            future.set_exception(BrokenProcessPool("worker exited"))
            return future

        def shutdown(self, **kwargs):
            closed.append(True)

    monkeypatch.setattr(refresher, "ProcessPoolExecutor", lambda **kwargs: BrokenPool())
    worker = refresher.GreatLakesRefresher()
    with pytest.raises(RuntimeError, match="will retry"):
        worker._draw_tasks([("temperature", 0, 0.0)], "now")
    assert closed == [True] and worker._pool is None
    monkeypatch.setattr(refresher, "ProcessPoolExecutor", lambda **kwargs: ThreadPoolExecutor(max_workers=2))
    monkeypatch.setattr(refresher, "_draw_view", lambda *args: None)
    try:
        worker._draw_tasks([("temperature", 0, 0.0)], "retry")
        assert not worker.state["errors"]
    finally:
        worker.stop()


def test_lakes_download_concurrently_and_keep_individual_failures(monkeypatch):
    barrier = threading.Barrier(len(service.MODELS))
    warmed = []

    def warm(model, offset):
        warmed.append((model, offset))
        barrier.wait(timeout=3)
        if model == "LEOFS":
            raise OSError("NOAA unavailable")

    monkeypatch.setattr(service, "warm_model_hour", warm)
    worker = refresher.GreatLakesRefresher()
    assert worker._warm({model: {"files": {0: "x"}} for model in service.MODELS}, 6) is False
    assert set(warmed) == {(model, 6) for model in service.MODELS}
    assert set(worker.state["errors"]) == {"LEOFS +6 h"}


def test_thermocline_range_uses_render_values_without_drawing(monkeypatch) -> None:
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("run", hour),))
    models = ("LEOFS", "LOOFS")
    rendered = []

    def grid(model, *_):
        values = [2.0, 4.0, 8.0, 12.0] if model == "LEOFS" else [3.0, 6.0, 10.0, 14.0]
        return {"model": model, "grid": service.ScalarGrid(values, [True] * 4, 2, 2, 1, 1)}, {"model": model, "available": True}

    monkeypatch.setattr(service, "_regular_thermocline_grid", grid)
    monkeypatch.setattr(service, "_render_rasters", lambda inputs, *args: rendered.append(inputs) or [])

    expected = service._build_thermocline_rasters(0, 512, models)["metadata"]
    actual = service.thermocline_range_metadata(0, 512, models)

    assert (actual["minDepthMeters"], actual["maxDepthMeters"]) == (expected["minDepthMeters"], expected["maxDepthMeters"])
    assert len(rendered) == 1


def test_current_range_uses_render_values_without_drawing(monkeypatch) -> None:
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("run", hour),))
    models = ("LEOFS", "LOOFS")
    rendered = []

    def field(model, *_):
        values = [0.01, 0.04, 0.12, 0.20] if model == "LEOFS" else [0.02, 0.05, 0.10, 0.24]
        return {
            "model": model,
            "_samples": [],
            "_metadata": {"model": model, "available": True},
            "_render": {"model": model, "grid": service.ScalarGrid(values, [True] * 4, 2, 2, 1, 1)},
        }

    monkeypatch.setattr(service, "snap_depth", lambda depth, models: depth)
    monkeypatch.setattr(service, "_current_grid_field", field)
    monkeypatch.setattr(service, "_render_rasters", lambda inputs, *args: rendered.append(inputs) or [])

    expected = service._build_payload("currents", 0, 10, models)["metadata"]
    actual = service.current_range_metadata(0, 10, models)

    assert (actual["minSpeedMetersPerSecond"], actual["maxSpeedMetersPerSecond"]) == (expected["minSpeedMetersPerSecond"], expected["maxSpeedMetersPerSecond"])
    assert len(rendered) == 1
