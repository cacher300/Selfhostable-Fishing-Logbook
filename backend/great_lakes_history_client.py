"""Saved past Great Lakes conditions, read from the Great Lakes Trolling site.

The site's server records a rolling 90-day history of "Now" four times a day
(surface maps, water-column profiles, and station readings; never forecasts).
The desktop
app does not run around the clock, so it asks the site instead
(``GREAT_LAKES_HISTORY_URL``, default https://greatlakestrolling.com) and
passes the answers to the browser. Saved map images are served through this
app too, and past maps and images are kept in memory for reuse.
"""

from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict

DEFAULT_HISTORY_URL = "https://greatlakestrolling.com"
SITE_PREFIX = "/api/v1/history"
LOCAL_PREFIX = "/api/great-lakes/history"
USER_AGENT = "Fishing-Logbook-GreatLakes/1.0"
TIMEOUT_SECONDS = 30
MAX_MAPS = 24
MAX_IMAGES = 160
LAYERS = ("temperature", "thermocline", "currents", "waves")
POINT_KINDS = ("temperature", "temperature-profile", "current-profile", "fishing-conditions", "waves", "upwelling")
IMAGE_NAME = re.compile(r"^[0-9a-f]{40}\.(webp|png)$")
STATION_ID = re.compile(r"^[A-Za-z0-9]{3,12}$")
MEDIA_TYPES = {"webp": "image/webp", "png": "image/png"}

_base_url = DEFAULT_HISTORY_URL
_lock = threading.Lock()
_maps: OrderedDict[str, dict] = OrderedDict()
_images: OrderedDict[str, bytes] = OrderedDict()


class HistoryUnavailable(Exception):
    """The site could not be reached or had nothing saved; ``status`` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 503) -> None:
        super().__init__(message)
        self.status = status


def configure(base_url: str | None) -> None:
    global _base_url
    _base_url = (base_url or DEFAULT_HISTORY_URL).strip().rstrip("/") or DEFAULT_HISTORY_URL


def base_url() -> str:
    return _base_url


def _fetch(path: str, params: dict | None = None) -> bytes:
    query = urllib.parse.urlencode({key: value for key, value in (params or {}).items() if value not in (None, "")})
    url = f"{_base_url}{SITE_PREFIX}{path}{'?' + query if query else ''}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, image/*"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        status = error.code if error.code in (400, 404) else 503
        raise HistoryUnavailable(f"Saved conditions request failed ({error.code})", status) from error
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise HistoryUnavailable("Saved conditions are unavailable") from error


def _json(path: str, params: dict | None = None) -> dict:
    try:
        return json.loads(_fetch(path, params))
    except ValueError as error:
        raise HistoryUnavailable("Saved conditions were unreadable") from error


def _local_images(payload: dict) -> dict:
    for raster in payload.get("rasters") or []:
        for key in ("imageUrl", "valueUrl", "mixedUrl"):
            url = raster.get(key)
            if isinstance(url, str) and url.startswith(f"{SITE_PREFIX}/images/"):
                raster[key] = LOCAL_PREFIX + url[len(SITE_PREFIX):]
    return payload


def index() -> dict:
    return _json("")


def layer(layer_name: str, time: str) -> dict:
    """The saved surface map of a past hour, its images served by this app."""
    if layer_name not in LAYERS:
        raise HistoryUnavailable("Unknown layer", 404)
    key = f"{layer_name}|{time}"
    with _lock:
        cached = _maps.get(key)
        if cached is not None:
            _maps.move_to_end(key)
            return cached
    payload = _local_images(_json(f"/layers/{layer_name}", {"time": time}))
    with _lock:
        _maps[key] = payload
        while len(_maps) > MAX_MAPS:
            _maps.popitem(last=False)
    return payload


def image(name: str) -> tuple[bytes, str]:
    if not IMAGE_NAME.match(name):
        raise HistoryUnavailable("Not an image", 404)
    with _lock:
        data = _images.get(name)
        if data is not None:
            _images.move_to_end(name)
    if data is None:
        data = _fetch(f"/images/{name}")
        with _lock:
            _images[name] = data
            while len(_images) > MAX_IMAGES:
                _images.popitem(last=False)
    return data, MEDIA_TYPES[name.rsplit(".", 1)[1]]


def point(kind: str, params: dict) -> dict:
    if kind not in POINT_KINDS:
        raise HistoryUnavailable("Unknown reading", 404)
    allowed = {key: params.get(key) for key in ("time", "depth", "latitude", "longitude")}
    return _json(f"/point/{kind}", allowed)


def stations(time: str) -> dict:
    return _json("/stations", {"time": time})


def station(station_id: str) -> dict:
    if not STATION_ID.match(station_id):
        raise HistoryUnavailable("Unknown station", 404)
    return _json(f"/stations/{station_id.upper()}")


def clear_memory() -> None:
    with _lock:
        _maps.clear()
        _images.clear()
