from __future__ import annotations

from backend import great_lakes_service as service


def test_the_thermocline_starts_where_the_warm_layer_ends() -> None:
    # Off Collingwood, October 2026: mixed to about 30 ft, then cooling (metres, °C).
    profile = [(0, 14.72), (2, 14.72), (4, 14.72), (6, 14.72), (8, 14.72), (10, 14.56), (12, 14.28), (15, 13.89), (20, 13.17), (25, 12.83)]

    band = service._thermocline_band(profile)

    # Flat to 8 m (26 ft): the straight part ends there, and the cooling that starts below it
    # keeps going (gently at first) down to about 22 m.
    assert band["top"] == 8.0
    assert round(band["bottom"], 2) == 22.24
    assert round(band["thickness"], 6) == round(band["bottom"] - band["top"], 6)
    assert band["topTemperature"] == 14.72


def test_a_slow_start_does_not_push_the_top_down() -> None:
    # Georgian Bay off Parry Sound: 58.7 °F to 49 ft, then only 0.4 °F by 66 ft before the
    # main drop. Waiting for the water to be 2 °F cooler put the top at 75-83 ft; the straight
    # part ends at 39 ft, where the cooling starts and keeps going.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164]
    fahrenheit = [58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.7, 58.6, 58.3, 57.2, 56.3, 55.2, 54.3, 53.6, 52.9, 52.7]
    profile = [(depth / 3.28084, (temperature - 32) / 1.8) for depth, temperature in zip(feet, fahrenheit)]

    band = service._thermocline_band(profile)

    assert round(band["top"] * 3.28084) == 39
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

    assert service._thermocline_band(profile)["top"] == 15.0


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


def test_deep_water_that_keeps_cooling_to_the_bed_does_not_hide_the_thermocline() -> None:
    # Off Mississauga, October 2026: warm and uniform to about 20 ft, cooling from about 30 ft,
    # and the deep water keeps cooling right down to the lake bed (4.5 °F in the last 33 ft).
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164, 197]
    fahrenheit = [64.6, 64.6, 64.6, 64.6, 64.5, 64.3, 64.0, 63.4, 62.0, 59.3, 56.4, 53.1, 50.7, 48.9, 47.5, 46.3, 41.8]
    profile = [(depth / 3.28084, (temperature - 32) / 1.8) for depth, temperature in zip(feet, fahrenheit)]

    band, finding = service._thermocline_analysis(profile, 200 / 3.28084)

    assert finding == "found" and 30 <= band["top"] * 3.28084 <= 34


def _feet_profile(feet: list[float], fahrenheit: list[float]) -> list[tuple[float, float]]:
    return [(depth / 3.28084, (temperature - 32) / 1.8) for depth, temperature in zip(feet, fahrenheit)]


def test_a_tight_thermocline_under_a_slowly_cooling_top_layer_is_found() -> None:
    # Off Wilson NY (43.48, -78.66): the top layer cools about 0.9 °F per 10 ft, then
    # 3.6 °F per 10 ft from 33 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148]
    fahrenheit = [63.5, 63.2, 62.9, 62.4, 61.8, 61.2, 60.6, 59.0, 55.4, 49.5, 43.8, 41.1, 39.9, 39.7, 39.6]

    band, finding = service._thermocline_analysis(_feet_profile(feet, fahrenheit), 160 / 3.28084)

    assert finding == "found" and round(band["top"] * 3.28084) == 33


def test_a_gentle_band_under_a_flat_warm_layer_is_found() -> None:
    # North Channel / Georgian Bay, October 2026: flat to 49 ft, then 0.4-0.7 °F per 10 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131]
    fahrenheit = [60.2, 60.2, 60.2, 60.2, 60.2, 60.2, 60.2, 60.2, 60.1, 59.4, 58.6, 57.6, 56.5, 55.5]

    band, finding = service._thermocline_analysis(_feet_profile(feet, fahrenheit), 140 / 3.28084)

    assert finding == "found" and round(band["top"] * 3.28084) == 49


def test_the_top_is_where_the_curve_bends_not_partway_down_the_band() -> None:
    # 45.45, -81.73: flat to 66 ft, then 0.2-0.4 °F per 10 ft. The warm layer above 82 ft is
    # still flat next to the whole band, but the curve bends at 66 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82, 98, 115, 131, 148, 164, 197]
    fahrenheit = [54.87, 54.87, 54.87, 54.88, 54.88, 54.89, 54.90, 54.90, 54.90, 54.84, 54.48, 54.02, 53.35, 52.67, 51.94, 51.39, 50.72]

    band, finding = service._thermocline_analysis(_feet_profile(feet, fahrenheit), 210 / 3.28084)

    assert finding == "found" and round(band["top"] * 3.28084) == 66


def test_the_top_is_the_last_level_of_the_straight_part() -> None:
    # Off Port Credit (43.23, -79.44): flat to 49 ft, 1.2 °F cooler at 66 ft, then 3.6 °F more by
    # 82 ft. The band starts where the straight part ends (49 ft), not at the sharper bend (66 ft).
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82]
    fahrenheit = [63.1, 63.1, 63.1, 63.1, 63.1, 63.2, 63.2, 63.2, 63.2, 62.0, 58.4]

    band, finding = service._thermocline_analysis(_feet_profile(feet, fahrenheit), 85 / 3.28084)

    assert finding == "found" and round(band["top"] * 3.28084) == 49 and round(band["bottom"] * 3.28084) == 82
    # A gentler lead-in (0.6 °F) still starts the band where the straight part ends.
    gentler = [63.11, 63.13, 63.15, 63.18, 63.19, 63.19, 63.20, 63.20, 63.20, 62.56, 58.67]
    band, finding = service._thermocline_analysis(_feet_profile(feet, gentler), 85 / 3.28084)
    assert finding == "found" and round(band["top"] * 3.28084) == 49
    # A cooling of 0.1 °F is not a lead-in: the band starts at the sharp drop.
    barely = [57.67, 57.67, 57.68, 57.70, 57.71, 57.72, 57.72, 57.72, 57.72, 57.61, 56.55, 55.07, 53.98, 52.99, 52.01]
    band, finding = service._thermocline_analysis(_feet_profile([*feet, 98, 115, 131, 148], barely), 170 / 3.28084)
    assert finding == "found" and round(band["top"] * 3.28084) == 66


def test_the_top_always_has_cooler_water_right_below_it() -> None:
    # Slightly warmer at 39 ft and the same at 49 ft: the band cannot start above 49 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66, 82]
    fahrenheit = [60, 60, 60, 60, 60, 60, 60, 60.2, 60.2, 57, 52]
    profile = _feet_profile(feet, fahrenheit)

    band, finding = service._thermocline_analysis(profile, 90 / 3.28084)

    assert finding == "found" and round(band["top"] * 3.28084) == 49
    below = next(temperature for depth, temperature in profile if depth > band["top"])
    assert below < band["topTemperature"]


def test_a_thermocline_just_above_the_bed_is_found() -> None:
    # 45.71, -81.26: flat to 49 ft, 0.45 °F cooler at the deepest level (66 ft), bed at 79 ft.
    feet = [0, 3, 7, 13, 20, 26, 33, 39, 49, 66]
    fahrenheit = [57.91, 57.91, 57.91, 57.91, 57.91, 57.91, 57.91, 57.91, 57.90, 57.45]

    band, finding = service._thermocline_analysis(_feet_profile(feet, fahrenheit), 79 / 3.28084)

    assert finding == "found"
    assert round(band["top"] * 3.28084) == 49 and round(band["bottom"] * 3.28084) == 66


def test_mixed_and_winter_water_have_no_thermocline() -> None:
    mixed = [(0, 18.0), (5, 17.95), (10, 17.9), (20, 17.85), (30, 17.8)]  # under 1 °F from top to bottom
    inverse = [(0, 1.0), (5, 2.0), (10, 3.0), (20, 3.8), (30, 4.0)]  # winter: colder at the top
    gradual = [(0, 18.0), (10, 17.6), (40, 16.4), (80, 14.8)]  # cools at about the same rate all the way down

    assert service._thermocline_analysis(mixed) == (None, "mixed")
    assert service._thermocline_analysis(inverse) == (None, "mixed")
    assert service._thermocline_analysis(gradual) == (None, "gradual")


def test_a_thin_cold_bottom_layer_counts_when_the_lake_is_deeper_than_its_last_level() -> None:
    # Central Lake Erie: mixed to 15 m, colder at the deepest level (20 m), lake bed at 23 m.
    profile = [(0, 20.46), (4, 20.48), (8, 20.49), (12, 20.49), (15, 20.49), (20, 18.92)]

    assert service._thermocline_band(profile) is None  # no bed depth: may be bottom cooling
    band = service._thermocline_band(profile, 23.0)
    assert band["top"] == 15.0 and band["bottom"] == 20
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

    # The band runs from 39 ft to about 143 ft; readings show its top 15 ft.
    top_feet = thermocline["topDepthMeters"] * 3.28084
    assert round(top_feet) == 39
    assert round(thermocline["thicknessMeters"] * 3.28084) == 15 and round(thermocline["bottomDepthMeters"] * 3.28084) == round(top_feet + 15)
    assert thermocline["fullBottomDepthMeters"] * 3.28084 > 90
    assert round(thermocline["temperatureBelowC"] * 1.8 + 32, 1) == 58.0  # at 54 ft, between 58.3 °F (49 ft) and 57.2 °F (66 ft)


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
