"""Great Lakes overlay rendering: shoreline clipping, Mercator placement, colour range."""

from __future__ import annotations

import base64
import math
from io import BytesIO

from PIL import Image

from backend import great_lakes_render as render
from backend import great_lakes_service as service


def _decode(image_url: str) -> Image.Image:
    return Image.open(BytesIO(base64.b64decode(image_url.split(",", 1)[1]))).convert("RGBA")


def _axes(rows: int, columns: int) -> render.GridAxes:
    # 0.01° cells starting at 43 N, 80 W.
    latitudes = [43 + row * 0.01 for row in range(rows) for _ in range(columns)]
    longitudes = [-80 + column * 0.01 for _ in range(rows) for column in range(columns)]
    return render.GridAxes.from_samples(latitudes, longitudes, rows, columns, 1, 1)


def test_overlay_is_clipped_to_the_fine_water_mask() -> None:
    rows, columns = 20, 40
    # The coarse grid calls the whole area water; the fine mask says only the
    # southern half is. Colour must follow the fine mask, not the coarse grid.
    grid = render.ScalarGrid([10.0] * rows * columns, [True] * rows * columns, rows, columns, 1, 1)
    wet = bytes(255 if row < rows // 2 else 0 for row in range(rows) for _ in range(columns))
    water = render.WaterMask(rows, columns, 1, 1, wet)

    raster = render.render_overlay(grid, _axes(rows, columns), water, render.TEMPERATURE_COLOR_STOPS, 5, 15, 256)
    image = _decode(raster["imageUrl"])

    width, height = image.size
    assert image.getpixel((width // 2, height - 3))[3] > 240  # south: water
    assert image.getpixel((width // 2, 3))[3] == 0  # north: land
    (south, west), (north, east) = raster["bounds"]
    assert math.isclose(south, 42.995) and math.isclose(north, 43.195)
    assert math.isclose(west, -80.005) and math.isclose(east, -79.605)


def test_overlay_rows_follow_web_mercator() -> None:
    # A tall grid spanning 5° of latitude: a band of water at 46 N must land on
    # the Mercator row for 46 N, not the linear-latitude row.
    rows, columns = 501, 10
    latitudes = [43 + row * 0.01 for row in range(rows) for _ in range(columns)]
    longitudes = [-80 + column * 0.01 for _ in range(rows) for column in range(columns)]
    axes = render.GridAxes.from_samples(latitudes, longitudes, rows, columns, 1, 1)
    band = range(298, 303)  # 45.98–46.02 N
    wet = bytes(255 if row in band else 0 for row in range(rows) for _ in range(columns))
    grid = render.ScalarGrid([1.0] * rows * columns, [True] * rows * columns, rows, columns, 1, 1)

    raster = render.render_overlay(grid, axes, render.WaterMask(rows, columns, 1, 1, wet), render.TEMPERATURE_COLOR_STOPS, 0, 2, 256)
    image = _decode(raster["imageUrl"])
    (south, _), (north, _) = raster["bounds"]
    alphas = [image.getpixel((image.width // 2, y))[3] for y in range(image.height)]
    band_rows = [y for y, alpha in enumerate(alphas) if alpha > 128]
    observed_row = (band_rows[0] + band_rows[-1]) / 2

    def mercator(latitude: float) -> float:
        return math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2))

    expected_row = (mercator(north) - mercator(46.0)) / (mercator(north) - mercator(south)) * image.height
    linear_row = (north - 46.0) / (north - south) * image.height
    assert abs(observed_row - expected_row) <= 2
    assert abs(linear_row - expected_row) > 8  # the old linear placement was visibly off


def test_mixed_water_without_a_value_stays_transparent() -> None:
    rows, columns = 10, 20
    valid = [column < columns // 2 for _ in range(rows) for column in range(columns)]
    grid = render.ScalarGrid([20.0 if ok else 0.0 for ok in valid], valid, rows, columns, 1, 1)
    water = render.WaterMask(rows, columns, 1, 1, bytes([255] * rows * columns))
    no_data = [not ok for ok in valid]

    raster = render.render_overlay(grid, _axes(rows, columns), water, render.THERMOCLINE_COLOR_STOPS, 10, 30, 256, no_data)
    image = _decode(raster["imageUrl"])

    assert image.getpixel((image.width // 5, image.height // 2))[3] > 240
    assert image.getpixel((image.width * 9 // 10, image.height // 2))[3] < 10


def test_fill_invalid_extends_values_without_touching_valid_cells() -> None:
    values = [1.0, 0.0, 0.0, 0.0]
    filled = render.fill_invalid(values, [True, False, False, False], 1, 4, layers=2, fallback=-1.0)

    assert filled == [1.0, 1.0, 1.0, -1.0]


def test_robust_range_enforces_a_minimum_span() -> None:
    assert render.robust_range([10.0, 10.5, 11.0], 0.0, 1.0, 3.0) == (9.0, 12.0)
    assert render.robust_range([float(value) for value in range(101)], 0.01, 0.99, 1.0) == (1.0, 99.0)


def test_water_mask_payload_packs_bits_row_major() -> None:
    mask = render.WaterMask(2, 5, 2, 2, bytes([255, 0, 0, 0, 255, 0, 255, 0, 0, 0]))
    payload = mask.payload(_axes(2, 2))
    bits = base64.b64decode(payload["bits"])

    assert [(bits[index >> 3] >> (index & 7)) & 1 for index in range(10)] == [1, 0, 0, 0, 1, 0, 1, 0, 0, 0]
    assert math.isclose(payload["latitudeEnd"], 43.02) and math.isclose(payload["longitudeEnd"], -79.92)


def test_temperature_rasters_share_one_colour_range_across_lakes(monkeypatch) -> None:
    monkeypatch.setattr(service, "_raster_cache", {})
    monkeypatch.setattr(service, "_temperature_field_cache", {})
    rows, columns = 6, 8
    temperatures = {"LEOFS": 20.0, "LSOFS": 8.0}

    def grid(model, *_):
        values = [temperatures[model]] * rows * columns
        render_input = {
            "model": model,
            "validTime": "2026-10-02T12:00:00Z",
            "grid": render.ScalarGrid(values, [True] * len(values), rows, columns, 1, 1),
            "axes": _axes(rows, columns),
            "water": render.WaterMask(rows, columns, 1, 1, bytes([255] * len(values))),
        }
        return render_input, {"model": model, "available": True}, {"model": model}

    monkeypatch.setattr(service, "_regular_temperature_grid", grid)
    payload = service.great_lakes_temperature_rasters(0, 0, 128, ("LEOFS", "LSOFS"))

    assert (payload["metadata"]["minC"], payload["metadata"]["maxC"]) == (8.0, 20.0)
    colors = {raster["model"]: _decode(raster["imageUrl"]).getpixel((10, 10))[:3] for raster in payload["rasters"]}
    warm, cold = colors["LEOFS"], colors["LSOFS"]
    assert warm[0] > 150 and warm[2] < 120  # top of the palette is red
    assert cold[2] > 120 and cold[0] < 100  # bottom of the palette is deep blue


def _reference_fill(values, valid, rows, columns, layers, fallback):
    """The original per-cell implementation, kept as the specification."""
    known = bytearray(1 if item else 0 for item in valid)
    filled = [value if item else 0.0 for value, item in zip(values, valid)]
    for _ in range(layers):
        updates = {}
        for index in range(rows * columns):
            if known[index]:
                continue
            row, column = divmod(index, columns)
            neighbours = [
                filled[r * columns + c]
                for r in range(max(0, row - 1), min(rows, row + 2))
                for c in range(max(0, column - 1), min(columns, column + 2))
                if known[r * columns + c]
            ]
            if neighbours:
                updates[index] = sum(neighbours) / len(neighbours)
        for index, value in updates.items():
            filled[index] = value
            known[index] = 1
    return [value if known[index] else fallback for index, value in enumerate(filled)]


def test_fill_invalid_matches_the_reference_on_random_shorelines() -> None:
    import random

    generator = random.Random(7)
    for rows, columns, layers in ((9, 13, 4), (20, 7, 2), (15, 15, 6)):
        valid = [generator.random() < 0.35 for _ in range(rows * columns)]
        values = [generator.uniform(-2.0, 25.0) for _ in range(rows * columns)]
        expected = _reference_fill(values, valid, rows, columns, layers, -99.0)
        actual = render.fill_invalid(values, valid, rows, columns, layers=layers, fallback=-99.0)
        assert len(actual) == len(expected)
        assert all(abs(a - b) < 1e-3 for a, b in zip(actual, expected))

def test_mixed_water_can_be_drawn_in_its_own_colour() -> None:
    rows, columns = 4, 4
    grid = render.ScalarGrid([10.0] * 16, [True, True, False, False] * 4, rows, columns, 1, 1)
    water = render.WaterMask(rows, columns, 1, 1, bytes([255] * 16))
    no_data = [False, False, True, True] * 4
    image = _decode(render.render_overlay(grid, _axes(rows, columns), water, render.THERMOCLINE_COLOR_STOPS, 0, 20, 64, no_data, (104, 116, 132))["imageUrl"])
    right = image.getpixel((image.width - 2, image.height // 2))
    assert right[3] > 200 and all(abs(a - b) <= 3 for a, b in zip(right[:3], (104, 116, 132)))  # filled, not transparent
    transparent = _decode(render.render_overlay(grid, _axes(rows, columns), water, render.THERMOCLINE_COLOR_STOPS, 0, 20, 64, no_data)["imageUrl"])
    assert transparent.getpixel((transparent.width - 2, transparent.height // 2))[3] < 30


def test_water_shallower_than_the_level_is_left_out_of_the_mask() -> None:
    # 3 x 3 model grid, stride 2; the fine mask has stride 1 (5 x 5), all water.
    fine = render.WaterMask(5, 5, 1, 1, bytes([255] * 25))
    wet = [True] * 9
    # Only the left column of model cells is deep enough to have a value.
    valid = [True, False, False] * 3
    limited = render.limit_water_to_depth(fine, wet, valid, 3, 3, 2, 2)
    rows = [list(limited.wet[row * 5:(row + 1) * 5]) for row in range(5)]
    assert all(row[0] == 255 for row in rows)  # nearest model column 0
    assert all(row[3] == 0 and row[4] == 0 for row in rows)  # nearest model columns 2 (and 1.5 rounds to 2)


def test_the_surface_mask_is_unchanged_when_every_water_cell_has_a_value() -> None:
    fine = render.WaterMask(5, 5, 1, 1, bytes([255, 0, 255, 0, 255] * 5))
    assert render.limit_water_to_depth(fine, [True] * 9, [True] * 9, 3, 3, 2, 2) is fine


def test_shoreline_the_coarse_grid_calls_land_stays_beside_deep_enough_water() -> None:
    fine = render.WaterMask(5, 5, 1, 1, bytes([255] * 25))
    # Model column 2 is land (fine shoreline water there); column 1 has a value, column 0 does not.
    wet = [True, True, False] * 3
    valid = [False, True, False] * 3
    limited = render.limit_water_to_depth(fine, wet, valid, 3, 3, 2, 2)
    rows = [list(limited.wet[row * 5:(row + 1) * 5]) for row in range(5)]
    assert all(row[0] == 0 for row in rows)  # deep cell without a value: too shallow
    assert all(row[2] == 255 and row[4] == 255 for row in rows)  # land next to a valid cell keeps its shoreline
