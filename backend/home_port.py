"""Validate home launches against the same bundled Great Lakes shoreline as mobile."""
from functools import lru_cache
import json
import math
from pathlib import Path

from .backend_config import ROOT


@lru_cache(maxsize=1)
def _polygons():
    return json.loads((Path(ROOT) / "schema" / "great-lakes-boundaries.json").read_text(encoding="utf-8"))


def valid_home_port(point):
    if not isinstance(point, dict):
        return False
    latitude, longitude = point.get("latitude"), point.get("longitude")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in (latitude, longitude)):
        return False
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return False
    inside = False
    nearest = math.inf
    scale_x = math.pi / 180 * math.cos(math.radians(latitude)) * 6371000
    scale_y = math.pi / 180 * 6371000
    for polygon in _polygons():
        in_polygon = False
        for index, b in enumerate(polygon):
            a = polygon[index - 1]
            cross = (longitude - a[0]) * (b[1] - a[1]) - (latitude - a[1]) * (b[0] - a[0])
            if abs(cross) <= 1e-8 and min(a[0], b[0]) - 1e-8 <= longitude <= max(a[0], b[0]) + 1e-8 and min(a[1], b[1]) - 1e-8 <= latitude <= max(a[1], b[1]) + 1e-8:
                in_polygon = True
            elif (a[1] > latitude) != (b[1] > latitude) and longitude < (b[0] - a[0]) * (latitude - a[1]) / (b[1] - a[1]) + a[0]:
                in_polygon = not in_polygon
            x, y = (a[0] - longitude) * scale_x, (a[1] - latitude) * scale_y
            dx, dy = (b[0] - a[0]) * scale_x, (b[1] - a[1]) * scale_y
            length = dx * dx + dy * dy
            projection = max(0, min(1, -(x * dx + y * dy) / length)) if length else 0
            nearest = min(nearest, math.hypot(x + projection * dx, y + projection * dy))
        inside = inside or in_polygon
    return inside and nearest >= 1000
