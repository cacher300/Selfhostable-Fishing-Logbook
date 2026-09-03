from __future__ import annotations

from backend import great_lakes_service as service


def test_thermocline_uses_strongest_adjacent_cooling_gradient() -> None:
    profile = [(0, 22.0), (2, 21.9), (5, 21.8), (10, 21.5), (15, 17.0), (20, 12.0), (30, 10.0)]

    pair = service._sustained_thermocline_pair(profile)

    assert pair == ((15, 17.0), (20, 12.0))
    assert service._continuous_thermocline_depth(profile, pair) == 17.5


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
