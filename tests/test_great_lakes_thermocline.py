from __future__ import annotations

from backend import great_lakes_service as service


def test_the_thermocline_starts_where_the_temperature_curve_bends() -> None:
    # Off Collingwood, October 2026: mixed to about 30 ft, then cooling (metres, °C).
    profile = [(0, 14.72), (2, 14.72), (4, 14.72), (6, 14.72), (8, 14.72), (10, 14.56), (12, 14.28), (15, 13.89), (20, 13.17), (25, 12.83)]

    band = service._thermocline_band(profile)

    # The curve leaves the warm layer at 10 m (33 ft); the cooling eases below about 20 m.
    assert band["top"] == 10
    assert round(band["bottom"], 2) == 20.39
    assert round(band["thickness"], 6) == round(band["bottom"] - band["top"], 6)
    assert band["topTemperature"] == 14.56


def test_a_slow_start_does_not_push_the_top_down() -> None:
    # Georgian Bay off Parry Sound: 58.7 °F to 49 ft, then only 0.4 °F by 66 ft before the
    # main drop. Waiting for the water to be 2 °F cooler put the top at 75-83 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164]
    fahrenheit = [58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.6, 58.3, 57.2, 56.3, 55.2, 54.3, 53.6, 52.9, 52.7]
    profile = [(depth / 3.28084, (temperature - 32) / 1.8) for depth, temperature in zip(feet, fahrenheit)]

    band = service._thermocline_band(profile)

    assert round(band["top"] * 3.28084) == 49
    assert band["bottom"] * 3.28084 > 90


def test_a_sharp_step_is_a_thin_band() -> None:
    profile = [(0, 20.0), (5, 20.0), (10, 20.0), (15, 12.0), (20, 12.0), (30, 12.0)]

    band = service._thermocline_band(profile)

    assert band["top"] == 10.0  # the step starts at 10 m
    assert band["bottom"] == 15.0  # and stops at 15 m
    assert round(band["gradient"], 2) == round((band["topTemperature"] - 12.0) / (15.0 - band["top"]), 2)


def test_the_band_ends_where_the_cooling_eases_to_half_its_strongest_rate() -> None:
    # Off Rochester: the water keeps cooling slowly far below the real drop.
    rates = [(10, 0.1), (12, 0.6), (15, 1.0), (20, 1.0), (25, 0.9), (30, 0.6), (35, 0.4), (40, 0.25), (50, 0.15)]
    profile, temperature, depth = [(0, 20.0), (8, 20.0)], 20.0, 8
    for next_depth, rate in rates:
        temperature -= rate * (next_depth - depth)
        depth = next_depth
        profile.append((depth, temperature))

    band = service._thermocline_band(profile)

    # Strongest 1.0 °C/m; the band ends where the rate eases to 0.5 °C/m (halfway from the
    # 0.6 °C/m layer centred at 27.5 m to the 0.4 °C/m one at 32.5 m), not at the 0.1 °C/m minimum (50 m).
    assert band["bottom"] == 30.0


def test_a_sun_warmed_skin_does_not_count() -> None:
    profile = [(0, 22.0), (1, 20.5), (3, 20.0), (10, 20.0), (15, 20.0), (20, 15.0), (30, 12.0)]

    assert service._thermocline_band(profile)["top"] == 15


def test_water_cooling_from_the_surface_has_no_thermocline() -> None:
    # Spring, or mid-lake Ontario in the fall: no warm layer, cooling straight from the surface.
    straight_down = [(0, 15.0), (3, 14.5), (6, 14.0), (10, 13.3), (15, 12.5), (20, 11.7), (30, 10.0), (40, 9.6)]
    # Off Port Dalhousie, October 2026: cools from the surface and tapers into cold deep water.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164, 197, 230]
    fahrenheit = [64.0, 63.4, 62.8, 61.6, 60.4, 59.2, 58.0, 55.7, 52.4, 47.6, 43.7, 41.8, 40.5, 39.7, 39.4, 39.3, 39.3, 39.2]
    tapering = [(depth / 3.28084, (temperature - 32) / 1.8) for depth, temperature in zip(feet, fahrenheit)]

    assert service._thermocline_analysis(straight_down) == (None, "gradual")
    assert service._thermocline_analysis(tapering) == (None, "gradual")


def test_water_that_cools_evenly_has_no_thermocline() -> None:
    straight = [(depth, 20 - 0.15 * depth) for depth in (0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60)]
    # A slightly faster stretch (0.25 against 0.15 °C/m) does not stand out enough.
    rates = [(5, 0.15), (10, 0.15), (15, 0.15), (20, 0.25), (25, 0.25), (30, 0.15), (40, 0.15), (50, 0.15)]
    gentle, temperature, depth = [(0, 20.0)], 20.0, 0
    for next_depth, rate in rates:
        temperature -= rate * (next_depth - depth)
        depth = next_depth
        gentle.append((depth, temperature))

    assert service._thermocline_analysis(straight) == (None, "gradual")
    assert service._thermocline_analysis(gentle) == (None, "gradual")


def test_a_band_that_stands_out_from_the_rest_of_the_column_is_a_thermocline() -> None:
    # The same gentle column with a sharp 2 °C/m step in it.
    profile = [(0, 20.0), (5, 19.25), (10, 18.5), (15, 17.75), (20, 7.75), (25, 7.0), (30, 6.25), (40, 4.75)]

    band, finding = service._thermocline_analysis(profile)

    assert finding == "found" and band["top"] == 15 and 20 <= band["bottom"] < 21


def test_mixed_and_winter_water_have_no_thermocline() -> None:
    mixed = [(0, 18.0), (5, 17.95), (10, 17.9), (20, 17.85), (30, 17.8)]  # under 1 °F from top to bottom
    inverse = [(0, 1.0), (5, 2.0), (10, 3.0), (20, 3.8), (30, 4.0)]  # winter: colder at the top
    gradual = [(0, 18.0), (10, 18.0), (40, 16.8), (80, 15.6)]  # cools 2.4 °C, never 0.1 °C/m

    assert service._thermocline_analysis(mixed) == (None, "mixed")
    assert service._thermocline_analysis(inverse) == (None, "mixed")
    assert service._thermocline_analysis(gradual) == (None, "gradual")


def test_a_thin_cold_bottom_layer_counts_when_the_lake_is_deeper_than_its_last_level() -> None:
    # Central Lake Erie: mixed to 15 m, colder at the deepest level (20 m), lake bed at 23 m.
    profile = [(0, 20.46), (4, 20.48), (8, 20.49), (12, 20.49), (15, 20.49), (20, 18.92)]

    assert service._thermocline_band(profile) is None  # no bed depth: may be bottom cooling
    band = service._thermocline_band(profile, 23.0)
    assert band["top"] == 15 and band["bottom"] == 20
    assert service._thermocline_band(profile, 20.5) is None  # bed right below: bottom cooling


def test_profile_depths_are_sorted_before_detection() -> None:
    shuffled = [(20, 10.0), (0, 20.0), (15, 15.0), (5, 19.8), (10, 19.5)]

    assert service._thermocline_band(shuffled) == service._thermocline_band(sorted(shuffled))


def test_readings_show_at_most_15_ft_of_the_band(monkeypatch) -> None:
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164]
    fahrenheit = [58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.6, 58.3, 57.2, 56.3, 55.2, 54.3, 53.6, 52.9, 52.7]
    values = [{"depthMeters": depth / 3.28084, "temperatureC": (temperature - 32) / 1.8} for depth, temperature in zip(feet, fahrenheit)]
    monkeypatch.setattr(service, "model_bathymetry_depth", lambda *args: None)
    run = {"id": "20261004t18z", "cycleEpoch": 1791137600.0}

    thermocline = service._temperature_profile_result("LMHOFS", run, 5, 45.19, -80.46, 45.19, -80.46, values)["thermocline"]

    # The band runs from 49 ft to about 103 ft; readings show its top 15 ft.
    assert round(thermocline["topDepthMeters"] * 3.28084) == 49
    assert round(thermocline["bottomDepthMeters"] * 3.28084) == 64 and round(thermocline["thicknessMeters"] * 3.28084) == 15
    assert thermocline["fullBottomDepthMeters"] * 3.28084 > 90
    assert round(thermocline["temperatureBelowC"] * 1.8 + 32, 1) == 57.3  # at 64 ft, between 58.3 (49 ft) and 57.2 (66 ft)


def test_smoothing_evens_out_level_jitter_without_spreading_into_mixed_water() -> None:
    values = [10.0, 12.0, None, 10.0, 12.0, None]

    smoothed = service._smooth_thermocline(values, 2, 3)

    assert smoothed[2] is None and smoothed[5] is None
    assert 10.0 < smoothed[0] < 12.0 and 10.0 < smoothed[1] < 12.0


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
