from __future__ import annotations

from backend import great_lakes_service as service


def test_thermocline_uses_strongest_adjacent_cooling_gradient() -> None:
    profile = [(0, 22.0), (2, 21.9), (5, 21.8), (10, 21.5), (15, 17.0), (20, 12.0), (30, 10.0)]

    pair = service._sustained_thermocline_pair(profile)

    assert pair == ((15, 17.0), (20, 12.0))
    # Cooling spreads from 10 to 30 m, strongest at 15-20 m: the estimate sits between the levels.
    assert round(service._continuous_thermocline_depth(profile, pair), 2) == 16.07


def test_a_sharp_step_stays_halfway_between_its_levels() -> None:
    profile = [(0, 20.0), (5, 20.0), (10, 20.0), (15, 12.0), (20, 12.0), (30, 12.0)]

    pair = service._sustained_thermocline_pair(profile)

    assert service._continuous_thermocline_depth(profile, pair) == 12.5


def test_a_thin_cold_bottom_layer_counts_when_the_lake_is_deeper_than_its_last_level() -> None:
    # Central Lake Erie: mixed to 15 m, colder at the deepest level (20 m), lake bed at 23 m.
    profile = [(0, 20.46), (4, 20.48), (8, 20.49), (12, 20.49), (15, 20.49), (20, 18.92)]

    assert service._sustained_thermocline_pair(profile) is None  # no bed depth: may be bottom cooling
    assert service._sustained_thermocline_pair(profile, 23.0) == ((15, 20.49), (20, 18.92))
    assert service._sustained_thermocline_pair(profile, 20.5) is None  # bed right below: bottom cooling


def test_smoothing_evens_out_level_jitter_without_spreading_into_mixed_water() -> None:
    values = [10.0, 12.0, None, 10.0, 12.0, None]

    smoothed = service._smooth_thermocline(values, 2, 3)

    assert smoothed[2] is None and smoothed[5] is None
    assert 10.0 < smoothed[0] < 12.0 and 10.0 < smoothed[1] < 12.0


def test_thermocline_rejects_temperature_inversion() -> None:
    profile = [(0, 8.0), (5, 8.5), (10, 10.0), (15, 13.0), (25, 15.0)]

    assert service._sustained_thermocline_pair(profile) is None


def test_thermocline_rejects_mixed_water_column() -> None:
    profile = [(0, 18.0), (5, 17.9), (10, 17.8), (20, 17.7), (30, 17.6)]

    assert service._sustained_thermocline_pair(profile) is None


def test_thermocline_ignores_bottom_boundary_cooling() -> None:
    profile = [(0, 20.0), (5, 19.8), (10, 19.5), (15, 18.5), (20, 18.0), (25, 10.0)]

    pair = service._sustained_thermocline_pair(profile)

    assert pair == ((10, 19.5), (15, 18.5))


def test_thermocline_sorts_profile_depths_before_detection() -> None:
    profile = [(20, 10.0), (0, 20.0), (15, 15.0), (5, 19.8), (10, 19.5)]

    assert service._sustained_thermocline_pair(profile) == ((10, 19.5), (15, 15.0))


def test_cache_store_drops_expired_buckets_and_caps_entries() -> None:
    cache: dict[tuple, str] = {}
    service._cache_store(cache, ("old", 1), "expired", 3)
    for depth in range(5):
        service._cache_store(cache, (depth, 2), f"value-{depth}", 3)

    assert list(cache) == [(2, 2), (3, 2), (4, 2)]

    service._cache_store(cache, ("late", 1), "stale-writer", 3)
    assert (4, 2) in cache


def test_temperature_raster_cache_stays_bounded(monkeypatch) -> None:
    monkeypatch.setattr(service, "_raster_cache", {})
    monkeypatch.setattr(service, "_temperature_field_cache", {})
    monkeypatch.setattr(
        service,
        "_regular_temperature_grid",
        lambda model, *_: ({"model": model, "grid": service.ScalarGrid([1.0, 2.0], [True, True], 1, 2, 1, 1)}, {"model": model}, {"model": model}),
    )
    monkeypatch.setattr(service, "_render_rasters", lambda inputs, *_: [{"model": item["model"]} for item in inputs])

    for depth in range(service.MAX_FIELD_CACHE_ENTRIES * 3):
        service.great_lakes_temperature_rasters(0, depth, 128, ("LEOFS",))

    assert len(service._raster_cache) == service.MAX_FIELD_CACHE_ENTRIES
    assert len(service._temperature_field_cache) == service.MAX_FIELD_CACHE_ENTRIES
