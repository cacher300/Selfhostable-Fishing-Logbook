"""Image rendering for the NOAA Great Lakes map overlays.

NOAA's regular grids are uniform in latitude/longitude, but Leaflet stretches
an image overlay linearly in Web Mercator. Every overlay is therefore warped
onto Mercator rows so it lines up with the basemap mid-lake, clipped to NOAA's
fine water mask (not the coarse sampled grid) so colour stays off the land, and
coloured across the full palette for the values actually being shown.
"""

from __future__ import annotations

import base64
import math
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageChops, ImageFilter, ImageMath, features


TEMPERATURE_COLOR_STOPS = (
    (0.00, (58, 40, 168)),
    (0.13, (36, 92, 226)),
    (0.27, (14, 152, 242)),
    (0.40, (12, 204, 222)),
    (0.53, (34, 208, 136)),
    (0.66, (150, 222, 48)),
    (0.78, (252, 218, 36)),
    (0.89, (252, 140, 28)),
    (1.00, (228, 40, 52)),
)
# Thermocline depth shares the temperature palette (shallow → deep).
THERMOCLINE_COLOR_STOPS = TEMPERATURE_COLOR_STOPS
# Water mixed top to bottom (no thermocline): a neutral slate outside the palette.
THERMOCLINE_MIXED_COLOR = (104, 116, 132)
CURRENT_SPEED_COLOR_STOPS = (
    (0.00, (22, 58, 128)),
    (0.22, (40, 92, 178)),
    (0.45, (98, 70, 186)),
    (0.68, (172, 60, 170)),
    (0.86, (232, 86, 118)),
    (1.00, (252, 158, 72)),
)
# Significant wave height, calm → rough.
WAVE_HEIGHT_COLOR_STOPS = (
    (0.00, (30, 64, 150)),
    (0.18, (26, 120, 210)),
    (0.36, (20, 190, 214)),
    (0.54, (118, 222, 122)),
    (0.70, (250, 224, 60)),
    (0.85, (250, 138, 40)),
    (1.00, (222, 40, 92)),
)

# Output rows are warped in strips this tall; Mercator is smooth enough that a
# piecewise-linear strip mapping is visually exact.
_MERCATOR_STRIP_PIXELS = 4
_MAX_OUTPUT_SIZE = 2400
_FILL_LAYERS = 4


@dataclass(frozen=True)
class GridAxes:
    """Linear mapping from a regular grid's full-resolution indices to degrees."""

    latitude0: float
    latitude_step: float
    longitude0: float
    longitude_step: float

    @classmethod
    def from_samples(cls, latitudes: list[float], longitudes: list[float], rows: int, columns: int, y_stride: int, x_stride: int) -> "GridAxes":
        """Build axes from a strided ``rows × columns`` subset (longitudes already in -180–180)."""
        if rows < 2 or columns < 2:
            raise RuntimeError("NOAA grid subset is too small to place on the map")
        latitude_step = (latitudes[(rows - 1) * columns] - latitudes[0]) / ((rows - 1) * y_stride)
        longitude_step = (longitudes[columns - 1] - longitudes[0]) / ((columns - 1) * x_stride)
        if not latitude_step or not longitude_step:
            raise RuntimeError("NOAA grid coordinates do not span an area")
        return cls(latitudes[0], latitude_step, longitudes[0], longitude_step)

    @classmethod
    def from_axes(cls, latitude_axis: list[float], longitude_axis: list[float], y_stride: int, x_stride: int) -> "GridAxes":
        """Build axes from a rectilinear subset's row latitudes and column longitudes."""
        rows, columns = len(latitude_axis), len(longitude_axis)
        if rows < 2 or columns < 2:
            raise RuntimeError("NOAA grid subset is too small to place on the map")
        latitude_step = (latitude_axis[-1] - latitude_axis[0]) / ((rows - 1) * y_stride)
        longitude_step = (longitude_axis[-1] - longitude_axis[0]) / ((columns - 1) * x_stride)
        if not latitude_step or not longitude_step:
            raise RuntimeError("NOAA grid coordinates do not span an area")
        return cls(latitude_axis[0], latitude_step, longitude_axis[0], longitude_step)

    def latitude(self, row_index: float) -> float:
        return self.latitude0 + row_index * self.latitude_step

    def longitude(self, column_index: float) -> float:
        return self.longitude0 + column_index * self.longitude_step

    def row_index(self, latitude: float) -> float:
        return (latitude - self.latitude0) / self.latitude_step


@dataclass(frozen=True)
class WaterMask:
    """NOAA wet/dry cells, row 0 being grid row 0; ``wet`` holds 0 or 255 per cell."""

    rows: int
    columns: int
    y_stride: int
    x_stride: int
    wet: bytes

    def payload(self, axes: GridAxes) -> dict:
        """Compact form for the browser: row-major bits, least-significant bit first."""
        packed = bytearray((len(self.wet) + 7) // 8)
        for index, value in enumerate(self.wet):
            if value:
                packed[index >> 3] |= 1 << (index & 7)
        return {
            "rows": self.rows,
            "columns": self.columns,
            "latitudeStart": axes.latitude(0),
            "latitudeEnd": axes.latitude((self.rows - 1) * self.y_stride),
            "longitudeStart": axes.longitude(0),
            "longitudeEnd": axes.longitude((self.columns - 1) * self.x_stride),
            "bits": base64.b64encode(bytes(packed)).decode("ascii"),
        }


def limit_water_to_depth(water: WaterMask, wet: list[bool], valid: list[bool], rows: int, columns: int, y_stride: int, x_stride: int) -> WaterMask:
    """The part of a lake's surface water mask that still has water at one depth level.

    ``wet`` is the model grid's surface water and ``valid`` its cells with a
    value at this level; water shallower than the level has none. A fine
    mask cell is kept when its nearest model cell has a value, or when that
    model cell is land next to one with a value (the fine shoreline the
    coarse grid calls land). At the surface every wet cell has a value, so
    the mask comes back unchanged.
    """
    if all(ok or not is_wet for is_wet, ok in zip(wet, valid)):
        return water
    has_value = Image.new("L", (columns, rows))
    has_value.putdata([255 if ok else 0 for ok in valid])
    near_value = has_value.filter(ImageFilter.MaxFilter(3))
    land = Image.new("L", (columns, rows))
    land.putdata([0 if is_wet else 255 for is_wet in wet])
    keep = ImageChops.lighter(has_value, ImageChops.darker(land, near_value))
    # Nearest model cell for each fine cell: fine index j sits at full-grid
    # index j * stride, nearest model cell round(j * stride / model stride).
    sx, sy = water.x_stride / x_stride, water.y_stride / y_stride
    keep_fine = keep.transform((water.columns, water.rows), Image.Transform.AFFINE, (sx, 0, 0.5 - 0.5 * sx, 0, sy, 0.5 - 0.5 * sy), Image.Resampling.NEAREST)
    fine = Image.new("L", (water.columns, water.rows))
    fine.putdata(water.wet)
    return WaterMask(water.rows, water.columns, water.y_stride, water.x_stride, ImageChops.darker(fine, keep_fine).tobytes())


@dataclass(frozen=True)
class ScalarGrid:
    """A strided subset of one model variable; ``valid`` marks usable water cells."""

    values: list[float]
    valid: list[bool]
    rows: int
    columns: int
    y_stride: int
    x_stride: int


def fill_invalid(values: list[float], valid: list[bool], rows: int, columns: int, layers: int = _FILL_LAYERS, fallback: float | None = None) -> list[float]:
    """Extend valid values a few cells outward so interpolation never mixes in land.

    The fine water mask decides visibility; these filled values only colour
    shoreline pixels that the coarse sampling grid classified as land. Each
    step gives every unfilled cell the mean of its already-filled 3 × 3
    neighbours. Cells beyond ``layers`` get ``fallback`` (the valid mean when
    omitted). Runs as whole-image operations; a per-cell Python loop took
    about half a second for a large lake.
    """
    if fallback is None:
        valid_values = [value for value, item in zip(values, valid) if item]
        fallback = sum(valid_values) / len(valid_values) if valid_values else 0.0
    # Zero padding wider than the fill distance, so the wrap-around of
    # ImageChops.offset only ever brings in empty cells.
    pad = layers + 1
    width, height = columns + 2 * pad, rows + 2 * pad
    filled_image = Image.new("F", (width, height), 0.0)
    known_image = Image.new("F", (width, height), 0.0)
    inside_image = Image.new("F", (width, height), 0.0)
    filled_image.paste(_float_image([value if item else 0.0 for value, item in zip(values, valid)], columns, rows), (pad, pad))
    known_image.paste(_float_image([1.0 if item else 0.0 for item in valid], columns, rows), (pad, pad))
    inside_image.paste(1.0, (pad, pad, pad + columns, pad + rows))
    offsets = [(dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
    for _ in range(layers):
        weighted = [ImageChops.offset(filled_image, dx, dy) for dx, dy in offsets]
        weights = [ImageChops.offset(known_image, dx, dy) for dx, dy in offsets]
        total = ImageMath.lambda_eval(lambda args: sum(args[f"v{index}"] for index in range(8)), **{f"v{index}": image for index, image in enumerate(weighted)})
        count = ImageMath.lambda_eval(lambda args: sum(args[f"w{index}"] for index in range(8)), **{f"w{index}": image for index, image in enumerate(weights)})
        # Unfilled cells inside the grid (padding never fills) with at least
        # one filled neighbour.
        newly = ImageMath.lambda_eval(lambda args: args["min"](args["count"], 1.0) * (1.0 - args["known"]) * args["inside"], count=count, known=known_image, inside=inside_image)
        filled_image = ImageMath.lambda_eval(lambda args: args["filled"] + args["newly"] * args["total"] / args["max"](args["count"], 1e-9), filled=filled_image, newly=newly, total=total, count=count)
        known_image = ImageMath.lambda_eval(lambda args: args["max"](args["known"], args["newly"]), known=known_image, newly=newly)
    box = (pad, pad, pad + columns, pad + rows)
    filled_values = filled_image.crop(box).getdata()
    known_values = known_image.crop(box).getdata()
    return [value if known else fallback for value, known in zip(filled_values, known_values)]


def _float_image(values: list[float], columns: int, rows: int) -> Image.Image:
    image = Image.new("F", (columns, rows))
    image.putdata(values)
    return image


def robust_range(values: list[float], low: float, high: float, minimum_span: float) -> tuple[float, float]:
    """Trimmed value range used to spread the palette across what is on screen."""
    ordered = sorted(value for value in values if math.isfinite(value))
    if not ordered:
        raise RuntimeError("No finite values to colour")
    minimum = ordered[min(len(ordered) - 1, int(low * (len(ordered) - 1)))]
    maximum = ordered[min(len(ordered) - 1, round(high * (len(ordered) - 1)))]
    if maximum - minimum < minimum_span:
        middle = (minimum + maximum) / 2
        minimum, maximum = middle - minimum_span / 2, middle + minimum_span / 2
    return minimum, maximum


def gradient_rgb(position: float, stops: tuple[tuple[float, tuple[int, int, int]], ...]) -> tuple[int, int, int]:
    position = max(0.0, min(1.0, position))
    upper = next((index for index, (stop, _) in enumerate(stops) if position <= stop), len(stops) - 1)
    lower_stop, lower_color = stops[max(0, upper - 1)]
    upper_stop, upper_color = stops[upper]
    fraction = 0.0 if upper_stop == lower_stop else (position - lower_stop) / (upper_stop - lower_stop)
    return tuple(round(lower_color[channel] + (upper_color[channel] - lower_color[channel]) * fraction) for channel in range(3))  # type: ignore[return-value]


def _palette(stops: tuple[tuple[float, tuple[int, int, int]], ...]) -> list[int]:
    return [channel for index in range(256) for channel in gradient_rgb(index / 255, stops)]


def _smoothstep_lut(low: int, high: int) -> list[int]:
    lut = []
    for value in range(256):
        t = max(0.0, min(1.0, (value - low) / (high - low)))
        lut.append(round(t * t * (3 - 2 * t) * 255))
    return lut


def _mercator(latitude: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2))


def _inverse_mercator(y: float) -> float:
    return math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)


def _padded_image(mode: str, values: list[float], rows: int, columns: int, pad: int, replicate: bool) -> Image.Image:
    width = columns + 2 * pad
    data = []
    for padded_row in range(rows + 2 * pad):
        row = min(rows - 1, max(0, padded_row - pad))
        inside_row = pad <= padded_row < rows + pad
        for padded_column in range(width):
            column = min(columns - 1, max(0, padded_column - pad))
            inside = inside_row and pad <= padded_column < columns + pad
            data.append(values[row * columns + column] if inside or replicate else 0)
    image = Image.new(mode, (width, rows + 2 * pad))
    image.putdata(data)
    return image


def _encode(image: Image.Image) -> str:
    buffer = BytesIO()
    if features.check("webp"):
        # Method 1 encodes about 3× faster than method 4 for ~10% larger files.
        image.save(buffer, format="WEBP", quality=85, method=1)
        return f"data:image/webp;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"
    image.save(buffer, format="PNG", optimize=True)
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"


def _encode_values(image: Image.Image) -> str:
    """A value image: grey level = position in the layer's colour range, alpha = water.

    Browsers recolour it to fit the range on screen. Lossy WebP at quality 97
    is the size of the coloured image and off by under half a step on average
    (a few hundredths of a degree); the alpha (shoreline) is kept exact.
    """
    buffer = BytesIO()
    if features.check("webp"):
        # exact: keep the grey levels under transparent pixels (filled from the nearby water), or the
        # encoder blanks them and they bleed into the shoreline's half-transparent edge as wrong values.
        # Prioritize preparation speed over file size, retaining quality and exact alpha.
        image.save(buffer, format="WEBP", quality=97, alpha_quality=100, method=0, exact=True)
        return f"data:image/webp;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"
    image.save(buffer, format="PNG", optimize=True)
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"


def render_overlay(
    grid: ScalarGrid,
    axes: GridAxes,
    water: WaterMask,
    stops: tuple[tuple[float, tuple[int, int, int]], ...],
    minimum: float,
    maximum: float,
    resolution: int,
    no_data: list[bool] | None = None,
    no_data_color: tuple[int, int, int] | None = None,
) -> dict:
    """Render ``grid`` as a Mercator-aligned, shoreline-clipped RGBA overlay.

    ``no_data`` optionally marks water cells that have no value (for example
    fully mixed water without a thermocline). They stay transparent, or are
    filled with ``no_data_color`` when one is given.

    Besides the coloured image (``imageUrl``), returns a value image
    (``valueUrl``, see _encode_values) over ``valueRange`` so browsers can fit
    the colours to what is on screen, and with ``no_data_color`` a separate
    image of just the no-data water in that colour (``mixedUrl``).
    """
    pad = 2
    source = _padded_image("F", fill_invalid(grid.values, grid.valid, grid.rows, grid.columns), grid.rows, grid.columns, pad, True)
    mask_source = Image.new("L", (water.columns, water.rows))
    mask_source.putdata(water.wet)

    # Full-resolution grid-index extents of the water mask's outer cell edges.
    x_edges = (-0.5 * water.x_stride, (water.columns - 0.5) * water.x_stride)
    y_edges = (-0.5 * water.y_stride, (water.rows - 0.5) * water.y_stride)
    west_x, east_x = sorted(x_edges, key=axes.longitude)
    south, north = sorted(axes.latitude(edge) for edge in y_edges)
    west, east = axes.longitude(west_x), axes.longitude(east_x)
    mercator_south, mercator_north = _mercator(south), _mercator(north)
    width = max(256, min(_MAX_OUTPUT_SIZE, resolution * 4, water.columns * 4))
    height = max(64, round(width * (mercator_north - mercator_south) / math.radians(east - west)))
    if height > _MAX_OUTPUT_SIZE:
        width, height = max(16, round(width * _MAX_OUTPUT_SIZE / height)), _MAX_OUTPUT_SIZE

    def mesh(to_u, to_v) -> list:
        quads = []
        for top in range(0, height, _MERCATOR_STRIP_PIXELS):
            bottom = min(height, top + _MERCATOR_STRIP_PIXELS)
            top_row = axes.row_index(_inverse_mercator(mercator_north - top / height * (mercator_north - mercator_south)))
            bottom_row = axes.row_index(_inverse_mercator(mercator_north - bottom / height * (mercator_north - mercator_south)))
            quads.append(((0, top, width, bottom), (
                to_u(west_x), to_v(top_row),
                to_u(west_x), to_v(bottom_row),
                to_u(east_x), to_v(bottom_row),
                to_u(east_x), to_v(top_row),
            )))
        return quads

    coarse_mesh = mesh(lambda x: x / grid.x_stride + pad + 0.5, lambda y: y / grid.y_stride + pad + 0.5)
    values = source.transform((width, height), Image.Transform.MESH, coarse_mesh, Image.Resampling.BILINEAR)
    span = max(maximum - minimum, 1e-6)
    indices = values.point(lambda value: value * (255 / span) - minimum * 255 / span).convert("L")
    levels = indices.copy()  # the plain grey levels, for the value image
    indices.putpalette(_palette(stops))
    color = indices.convert("RGB")

    fine_mesh = mesh(lambda x: x / water.x_stride + 0.5, lambda y: y / water.y_stride + 0.5)
    alpha = mask_source.transform((width, height), Image.Transform.MESH, fine_mesh, Image.Resampling.BILINEAR)
    pixels_per_cell = width / water.columns
    alpha = alpha.filter(ImageFilter.GaussianBlur(max(0.8, 0.6 * pixels_per_cell))).point(_smoothstep_lut(96, 160))
    value_alpha, mixed = alpha, None
    if no_data is not None and any(no_data):
        # Land cells inherit the no-data state of nearby water, so shoreline
        # pixels next to mixed water are not tinted with a borrowed value.
        known = [missing or ok for missing, ok in zip(no_data, grid.valid)]
        hole_values = fill_invalid([1.0 if missing else 0.0 for missing in no_data], known, grid.rows, grid.columns, fallback=0.0)
        holes = _padded_image("F", [value * 255 for value in hole_values], grid.rows, grid.columns, pad, True)
        holes = holes.transform((width, height), Image.Transform.MESH, coarse_mesh, Image.Resampling.BILINEAR).convert("L")
        holes = holes.filter(ImageFilter.GaussianBlur(max(0.8, 0.35 * width / grid.columns))).point(_smoothstep_lut(100, 156))
        if no_data_color is None:
            alpha = ImageChops.multiply(alpha, ImageChops.invert(holes))
            value_alpha = alpha
        else:
            color = Image.composite(Image.new("RGB", color.size, no_data_color), color, holes)
            value_alpha = ImageChops.multiply(alpha, ImageChops.invert(holes))
            mixed = Image.new("RGB", color.size, no_data_color)
            mixed.putalpha(ImageChops.multiply(alpha, holes))
    color.putalpha(alpha)
    result = {
        "imageUrl": _encode(color),
        "valueUrl": _encode_values(Image.merge("RGBA", (levels, levels, levels, value_alpha))),
        "valueRange": [minimum, maximum],
        "bounds": [[south, west], [north, east]],
    }
    if mixed is not None:
        result["mixedUrl"] = _encode(mixed)
    return result
