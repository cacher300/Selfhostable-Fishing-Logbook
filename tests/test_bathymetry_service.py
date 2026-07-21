from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "module-import-test-secret")

from backend import bathymetry_service


class BathymetryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        bathymetry_service._BATHYMETRY_CACHE.clear()

    def test_lookup_depth_adds_real_world_depth_offset(self) -> None:
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

        self.assertEqual(60.0, result["depth_ft"])
        self.assertAlmostEqual(18.288, result["depth_m"], places=3)
        self.assertEqual("60", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

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

        self.assertEqual(-60.0, result["depth_ft"])
        self.assertAlmostEqual(-18.288, result["depth_m"], places=3)
        self.assertEqual("60", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

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
