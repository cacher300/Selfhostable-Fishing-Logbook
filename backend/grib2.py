"""A small pure-Python GRIB2 reader for single NOAA forecast messages.

NOAA's Great Lakes wave model (GLWU) is only published as GRIB2 now that
NOMADS has retired OPeNDAP. Each field is one message of a few tens of
kilobytes, fetched with an HTTP Range request from the file's ``.idx``
inventory, so a full GRIB library (and its native dependencies) is not
needed. Supported: regular latitude/longitude (template 3.0) and Lambert
conformal (3.30) grids; simple (5.0), complex (5.2), and complex packing with
spatial differencing (5.3); and an optional bitmap.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

_SPHERE_RADII = {0: 6367470.0, 6: 6371229.0, 8: 6371200.0}
_BIT_CHUNK = 512


@dataclass(frozen=True)
class Message:
    """One decoded field; ``values`` holds ``nan`` where the model has no data."""

    grid: "RegularGrid | LambertGrid"
    values: list[float]


def _signed(value: int, bits: int) -> int:
    """GRIB2 stores negative integers as sign-and-magnitude, not two's complement."""
    sign = 1 << (bits - 1)
    return -(value & (sign - 1)) if value & sign else value


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def _s32(data: bytes, offset: int) -> int:
    return _signed(_u32(data, offset), 32)


def _unpack_bits(data: bytes, bit_position: int, width: int, count: int) -> list[int]:
    """``count`` unsigned big-endian integers of ``width`` bits starting at ``bit_position``."""
    if count <= 0:
        return []
    if width == 0:
        return [0] * count
    mask = (1 << width) - 1
    result: list[int] = []
    # Shifting one huge integer per value is quadratic, so values are read
    # from bounded chunks.
    for first in range(0, count, _BIT_CHUNK):
        size = min(_BIT_CHUNK, count - first)
        start_bit = bit_position + first * width
        total = size * width
        start, end = start_bit >> 3, (start_bit + total + 7) >> 3
        chunk = int.from_bytes(data[start:end], "big") >> ((end - start) * 8 - (start_bit & 7) - total)
        result.extend((chunk >> (width * (size - 1 - index))) & mask for index in range(size))
    return result


def _earth_radius(section: bytes) -> float:
    shape = section[14]
    if shape == 1:
        scale, value = section[15], _u32(section, 16)
        return value / 10 ** scale
    if shape in _SPHERE_RADII:
        return _SPHERE_RADII[shape]
    raise ValueError(f"GRIB2 earth shape {shape} is not supported")


@dataclass(frozen=True)
class RegularGrid:
    """Template 3.0: a regular latitude/longitude grid."""

    nx: int
    ny: int
    latitude1: float
    longitude1: float
    latitude2: float
    longitude2: float
    dx: float
    dy: float
    scan: int

    def index(self, latitude: float, longitude: float) -> tuple[float, float]:
        i = ((longitude - self.longitude1 + 540) % 360 - 180) / self.dx
        j = (latitude - self.latitude1) / self.dy
        return (-i if self.scan & 0x80 else i), (j if self.scan & 0x40 else -j)

    def coordinates(self, i: float, j: float) -> tuple[float, float]:
        i = -i if self.scan & 0x80 else i
        j = j if self.scan & 0x40 else -j
        longitude = (self.longitude1 + i * self.dx + 180) % 360 - 180
        return self.latitude1 + j * self.dy, longitude

    def to_header(self) -> dict:
        return {"type": "regular", "nx": self.nx, "ny": self.ny, "latitude1": self.latitude1, "longitude1": self.longitude1,
                "latitude2": self.latitude2, "longitude2": self.longitude2, "dx": self.dx, "dy": self.dy, "scan": self.scan}


@dataclass(frozen=True)
class LambertGrid:
    """Template 3.30: a Lambert conformal conic grid on a sphere."""

    nx: int
    ny: int
    latitude1: float
    longitude1: float
    orientation: float
    latin1: float
    latin2: float
    dx: float
    dy: float
    scan: int
    radius: float
    _n: float = field(init=False, repr=False)
    _f: float = field(init=False, repr=False)
    _x1: float = field(init=False, repr=False)
    _y1: float = field(init=False, repr=False)

    def __post_init__(self) -> None:
        phi1, phi2 = math.radians(self.latin1), math.radians(self.latin2)
        if abs(phi1 - phi2) < 1e-9:
            n = math.sin(phi1)
        else:
            n = math.log(math.cos(phi1) / math.cos(phi2)) / math.log(math.tan(math.pi / 4 + phi2 / 2) / math.tan(math.pi / 4 + phi1 / 2))
        object.__setattr__(self, "_n", n)
        object.__setattr__(self, "_f", math.cos(phi1) * math.tan(math.pi / 4 + phi1 / 2) ** n / n)
        x1, y1 = self.project(self.latitude1, self.longitude1)
        object.__setattr__(self, "_x1", x1)
        object.__setattr__(self, "_y1", y1)

    def rho(self, latitude: float) -> float:
        return self.radius * self._f / math.tan(math.pi / 4 + math.radians(latitude) / 2) ** self._n

    def theta(self, longitude: float) -> float:
        return self._n * math.radians((longitude - self.orientation + 540) % 360 - 180)

    def project(self, latitude: float, longitude: float) -> tuple[float, float]:
        rho, theta = self.rho(latitude), self.theta(longitude)
        return rho * math.sin(theta), -rho * math.cos(theta)

    def index_from_xy(self, x: float, y: float) -> tuple[float, float]:
        i, j = (x - self._x1) / self.dx, (y - self._y1) / self.dy
        return (-i if self.scan & 0x80 else i), (j if self.scan & 0x40 else -j)

    def index(self, latitude: float, longitude: float) -> tuple[float, float]:
        return self.index_from_xy(*self.project(latitude, longitude))

    def coordinates(self, i: float, j: float) -> tuple[float, float]:
        i = -i if self.scan & 0x80 else i
        j = j if self.scan & 0x40 else -j
        x, y = self._x1 + i * self.dx, self._y1 + j * self.dy
        sign = 1.0 if self._n > 0 else -1.0
        rho = sign * math.hypot(x, y)
        theta = math.atan2(sign * x, -sign * y)
        longitude = (self.orientation + math.degrees(theta / self._n) + 180) % 360 - 180
        latitude = math.degrees(2 * math.atan((self.radius * self._f / rho) ** (1 / self._n)) - math.pi / 2)
        return latitude, longitude

    def to_header(self) -> dict:
        return {"type": "lambert", "nx": self.nx, "ny": self.ny, "latitude1": self.latitude1, "longitude1": self.longitude1,
                "orientation": self.orientation, "latin1": self.latin1, "latin2": self.latin2, "dx": self.dx, "dy": self.dy,
                "scan": self.scan, "radius": self.radius}


def grid_from_header(header: dict) -> "RegularGrid | LambertGrid":
    values = {key: value for key, value in header.items() if key != "type"}
    return LambertGrid(**values) if header.get("type") == "lambert" else RegularGrid(**values)


def _grid(section: bytes) -> "RegularGrid | LambertGrid":
    template = struct.unpack_from(">H", section, 12)[0]
    if template == 0:
        basic_angle, subdivisions = _u32(section, 38), _u32(section, 42)
        unit = 1e-6 if basic_angle in (0, 0xFFFFFFFF) or subdivisions in (0, 0xFFFFFFFF) else basic_angle / subdivisions
        return RegularGrid(
            nx=_u32(section, 30), ny=_u32(section, 34),
            latitude1=_s32(section, 46) * unit, longitude1=_s32(section, 50) * unit,
            latitude2=_s32(section, 55) * unit, longitude2=_s32(section, 59) * unit,
            dx=_u32(section, 63) * unit, dy=_u32(section, 67) * unit, scan=section[71],
        )
    if template == 30:
        return LambertGrid(
            nx=_u32(section, 30), ny=_u32(section, 34),
            latitude1=_s32(section, 38) * 1e-6, longitude1=(_s32(section, 42) * 1e-6 + 180) % 360 - 180,
            orientation=(_s32(section, 51) * 1e-6 + 180) % 360 - 180,
            dx=_u32(section, 55) * 1e-3, dy=_u32(section, 59) * 1e-3, scan=section[64],
            latin1=_s32(section, 65) * 1e-6, latin2=_s32(section, 69) * 1e-6, radius=_earth_radius(section),
        )
    raise ValueError(f"GRIB2 grid template 3.{template} is not supported")


def _simple(section5: bytes, data: bytes, count: int) -> list[float]:
    reference = struct.unpack_from(">f", section5, 11)[0]
    binary_scale = _signed(struct.unpack_from(">H", section5, 15)[0], 16)
    decimal_scale = _signed(struct.unpack_from(">H", section5, 17)[0], 16)
    bits = section5[19]
    factor, divisor = 2.0 ** binary_scale, 10.0 ** decimal_scale
    if bits == 0:
        return [reference / divisor] * count
    return [(reference + value * factor) / divisor for value in _unpack_bits(data, 0, bits, count)]


def _complex(section5: bytes, data: bytes, count: int, spatial: bool) -> list[float]:
    reference = struct.unpack_from(">f", section5, 11)[0]
    binary_scale = _signed(struct.unpack_from(">H", section5, 15)[0], 16)
    decimal_scale = _signed(struct.unpack_from(">H", section5, 17)[0], 16)
    reference_bits = section5[19]
    missing_management = section5[22]
    groups = _u32(section5, 31)
    width_reference, width_bits = section5[35], section5[36]
    length_reference, length_increment = _u32(section5, 37), section5[41]
    last_length, length_bits = _u32(section5, 42), section5[46]
    order, descriptor_octets = (section5[47], section5[48]) if spatial else (0, 0)

    position = 0
    first_values: list[int] = []
    minimum = 0
    if order:
        descriptor_bits = descriptor_octets * 8
        first_values = [_signed(value, descriptor_bits) for value in _unpack_bits(data, 0, descriptor_bits, order)]
        minimum = _signed(_unpack_bits(data, order * descriptor_bits, descriptor_bits, 1)[0], descriptor_bits)
        position = (order + 1) * descriptor_bits

    def read(width: int, total: int) -> list[int]:
        nonlocal position
        values = _unpack_bits(data, position, width, total)
        position += ((width * total + 7) // 8) * 8
        return values

    references = read(reference_bits, groups)
    widths = [width_reference + value for value in read(width_bits, groups)]
    lengths = [length_reference + value * length_increment for value in read(length_bits, groups)]
    if groups:
        lengths[-1] = last_length

    raw: list[int | None] = []
    for group_reference, width, length in zip(references, widths, lengths):
        if width == 0:
            missing = missing_management and group_reference == (1 << reference_bits) - 1
            raw.extend([None] * length if missing else [group_reference] * length)
            continue
        packed = _unpack_bits(data, position, width, length)
        position += width * length
        if missing_management:
            missing_value = (1 << width) - 1
            # Management 2 also marks the next-highest value as (secondary) missing.
            secondary = missing_value - 1 if missing_management == 2 else -1
            raw.extend(None if value in (missing_value, secondary) else group_reference + value for value in packed)
        else:
            raw.extend(group_reference + value for value in packed)
    if len(raw) != count:
        raise ValueError("GRIB2 complex packing group lengths do not match the point count")

    if order:
        present = [index for index, value in enumerate(raw) if value is not None]
        sequence = [raw[index] for index in present]
        for index in range(min(order, len(sequence))):
            sequence[index] = first_values[index]
        if order == 1:
            for index in range(1, len(sequence)):
                sequence[index] = sequence[index] + minimum + sequence[index - 1]
        elif order == 2:
            for index in range(2, len(sequence)):
                sequence[index] = sequence[index] + minimum + 2 * sequence[index - 1] - sequence[index - 2]
        else:
            raise ValueError(f"GRIB2 spatial differencing order {order} is not supported")
        for index, value in zip(present, sequence):
            raw[index] = value

    factor, divisor = 2.0 ** binary_scale, 10.0 ** decimal_scale
    nan = math.nan
    return [nan if value is None else (reference + value * factor) / divisor for value in raw]


def decode(message: bytes) -> Message:
    """Decode the first field of a GRIB2 message."""
    if message[:4] != b"GRIB" or message[7] != 2:
        raise ValueError("Not a GRIB2 message")
    total = struct.unpack_from(">Q", message, 8)[0]
    if len(message) < total:
        raise ValueError("GRIB2 message is truncated")
    position = 16
    grid = None
    section5 = b""
    bitmap: list[int] | None = None
    while position < total - 4:
        length = _u32(message, position)
        number = message[position + 4]
        section = message[position:position + length]
        if number == 3:
            grid = _grid(section)
        elif number == 5:
            section5 = section
        elif number == 6:
            indicator = section[5]
            if indicator == 0:
                assert grid is not None
                bitmap = _unpack_bits(section[6:], 0, 1, grid.nx * grid.ny)
            elif indicator != 255:
                raise ValueError("GRIB2 predefined bitmaps are not supported")
        elif number == 7:
            if grid is None or not section5:
                raise ValueError("GRIB2 data section precedes its definitions")
            template = struct.unpack_from(">H", section5, 9)[0]
            count = _u32(section5, 5)
            data = section[5:]
            if template == 0:
                packed = _simple(section5, data, count)
            elif template in (2, 3):
                packed = _complex(section5, data, count, template == 3)
            else:
                raise ValueError(f"GRIB2 data template 5.{template} is not supported")
            if bitmap is None:
                values = packed
            else:
                values, iterator = [], iter(packed)
                for present in bitmap:
                    values.append(next(iterator) if present else math.nan)
            if len(values) != grid.nx * grid.ny:
                raise ValueError("GRIB2 field size does not match its grid")
            return Message(grid, values)
        position += length
    raise ValueError("GRIB2 message has no data section")


def parse_index(text: str) -> list[dict]:
    """Parse a NOMADS ``.idx`` inventory into byte ranges (``end`` is exclusive; ``None`` = to end of file)."""
    entries = []
    for line in text.splitlines():
        parts = line.split(":")
        if len(parts) < 6 or not parts[1].isdigit():
            continue
        entries.append({"offset": int(parts[1]), "date": parts[2].removeprefix("d="), "variable": parts[3], "level": parts[4], "forecast": parts[5]})
    for current, following in zip(entries, entries[1:] + [None]):
        current["end"] = following["offset"] if following else None
    return entries


def forecast_hour(text: str) -> int | None:
    """``anl`` → 0, ``7 hour fcst`` → 7; anything else (averages, ranges) → ``None``."""
    if text == "anl":
        return 0
    parts = text.split()
    if len(parts) == 3 and parts[1] == "hour" and parts[2] == "fcst" and parts[0].isdigit():
        return int(parts[0])
    return None
