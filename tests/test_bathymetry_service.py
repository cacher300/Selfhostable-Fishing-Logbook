from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "module-import-test-secret")

from backend import bathymetry_service


class BathymetryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        # These tests exercise the remote contour/model fallback, independent
        # of which local NOAA contour assets are installed on the machine.
        local = patch.object(bathymetry_service, "nearest_local_contour", return_value=None)
        local.start()
        self.addCleanup(local.stop)

    def test_local_contour_precedes_remote_providers(self) -> None:
        with (
            patch.object(bathymetry_service, "nearest_local_contour", return_value=(100.0, "Ontario")),
            patch.object(bathymetry_service, "query_bathymetry_features") as contours,
            patch.object(bathymetry_service, "model_depth_estimate") as model,
        ):
            result = bathymetry_service.lookup_depth(43.6, -77.9)
        self.assertEqual(328, result["depth_ft"])
        self.assertEqual(bathymetry_service.LOCAL_DEPTH_SOURCE, result["depth_source"])
        contours.assert_not_called()
        model.assert_not_called()

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

        self.assertEqual(53, result["depth_ft"])
        self.assertEqual(16, result["depth_m"])
        self.assertEqual("53", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

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

        self.assertEqual(56, result["depth_ft"])
        self.assertEqual(17, result["depth_m"])
        self.assertEqual("56", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

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

        self.assertEqual(52, result["depth_ft"])

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

        self.assertEqual(58, result["depth_ft"])

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

        self.assertEqual(-53, result["depth_ft"])
        self.assertEqual(-16, result["depth_m"])
        self.assertEqual("53", bathymetry_service.format_fow_value(result["depth_ft"], result["depth_m"]))

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

    def test_mid_lake_points_without_a_nearby_contour_use_model_depth(self) -> None:
        with (
            patch.object(bathymetry_service, "query_bathymetry_features", return_value=[]),
            patch.object(bathymetry_service, "model_depth_estimate", return_value={"depthMeters": 24.1, "model": "LEOFS", "lake": "Erie"}),
        ):
            result = bathymetry_service.lookup_depth(42.2, -81.7, {"Erie": {"offshoreOffsetFeet": 3}})

        self.assertEqual(82, result["depth_ft"])  # 79.07 ft plus the full offshore calibration
        self.assertEqual(25, result["depth_m"])
        self.assertEqual("Erie", result["lake_name"])
        self.assertEqual(bathymetry_service.MODEL_DEPTH_SOURCE, result["depth_source"])

    def test_model_depth_covers_a_contour_service_outage(self) -> None:
        with (
            patch.object(bathymetry_service, "query_bathymetry_features", side_effect=RuntimeError("Bathymetry service unavailable")),
            patch.object(bathymetry_service, "model_depth_estimate", return_value={"depthMeters": 100.0, "model": "LOOFS", "lake": "Ontario"}),
        ):
            result = bathymetry_service.lookup_depth(43.6, -77.9)
        self.assertEqual(328, result["depth_ft"])

        with (
            patch.object(bathymetry_service, "query_bathymetry_features", side_effect=RuntimeError("Bathymetry service unavailable")),
            patch.object(bathymetry_service, "model_depth_estimate", return_value=None),
        ):
            with self.assertRaises(RuntimeError):
                bathymetry_service.lookup_depth(43.6, -77.9)

    def test_points_outside_every_lake_still_have_no_depth(self) -> None:
        with (
            patch.object(bathymetry_service, "query_bathymetry_features", return_value=[]),
            patch.object(bathymetry_service, "model_depth_estimate", return_value=None),
        ):
            self.assertIsNone(bathymetry_service.lookup_depth(43.0, -80.5))


if __name__ == "__main__":
    unittest.main()
