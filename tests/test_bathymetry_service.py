from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "module-import-test-secret")

from backend import bathymetry_service


class BathymetryServiceTests(unittest.TestCase):
    def test_lookup_depth_uses_raw_depth_without_default_offset(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Ontario", "depth_ft": 52.5, "depth_m": 16.002},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(43.0, -79.0)

        self.assertEqual(52.5, result["depth_ft"])
        self.assertAlmostEqual(16.002, result["depth_m"], places=3)
        self.assertEqual("52.5", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

    def test_lookup_depth_adds_user_offset(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Ontario", "depth_ft": 52.5, "depth_m": 16.002},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(
                43.0,
                -79.0,
                {"Ontario": {"offshoreOffsetFeet": 7.5}},
            )

        self.assertEqual(55.875, result["depth_ft"])
        self.assertAlmostEqual(17.031, result["depth_m"], places=3)
        self.assertEqual("55.9", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

    def test_lookup_depth_uses_only_the_matching_lake_offset(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Erie", "depth_ft": 52.5, "depth_m": 16.002},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(
                43.0,
                -79.0,
                {
                    "Ontario": {"offshoreOffsetFeet": 7.5},
                    "Erie": {"offshoreOffsetFeet": -2},
                },
            )

        self.assertEqual(51.6, result["depth_ft"])

    def test_lookup_depth_ramps_between_shallow_and_offshore_adjustments(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Erie", "depth_ft": 55, "depth_m": 16.764},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(
                43.0,
                -79.0,
                {"Erie": {"shallowOffsetFeet": 0, "offshoreOffsetFeet": 5}},
            )

        self.assertEqual(57.5, result["depth_ft"])

    def test_lookup_depth_preserves_negative_depth_sign_when_offsetting(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Ontario", "depth_ft": -52.5, "depth_m": -16.002},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(43.0, -79.0)

        self.assertEqual(-52.5, result["depth_ft"])
        self.assertAlmostEqual(-16.002, result["depth_m"], places=3)
        self.assertEqual("52.5", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

    def test_lookup_depth_does_not_turn_zero_depth_into_offset(self) -> None:
        with patch.object(
            bathymetry_service,
            "query_bathymetry_features",
            return_value=[
                {
                    "attributes": {"Lake": "Ontario", "depth_ft": 0, "depth_m": 0},
                    "geometry": {"x": -79.0, "y": 43.0},
                }
            ],
        ):
            result = bathymetry_service.lookup_depth(43.0, -79.0)

        self.assertIsNone(result["depth_ft"])
        self.assertIsNone(result["depth_m"])
        self.assertEqual("", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))


if __name__ == "__main__":
    unittest.main()
