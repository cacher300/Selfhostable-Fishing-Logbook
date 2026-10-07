"""Live Great Lakes water observations from NOAA's National Data Buoy Center.

These are real measurements (buoys, shore gauges, and buoy-mounted current
profilers), unlike the forecast-model layers in ``great_lakes_service``.
One shared 30-minute snapshot limits NOAA requests and remains available during
provider outages.
"""

from __future__ import annotations

import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from . import great_lakes_cache as cache

NDBC = "https://www.ndbc.noaa.gov"
ACTIVE_STATIONS_URL = f"{NDBC}/activestations.xml"
LATEST_OBSERVATIONS_URL = f"{NDBC}/data/latest_obs/latest_obs.txt"
# South, west, north, east: the five Great Lakes and their connecting waters.
GREAT_LAKES_BOUNDS = (41.0, -92.6, 49.5, -75.4)
# Seasonal buoys are pulled in autumn; an old last reading must not look current.
MAX_OBSERVATION_AGE = timedelta(hours=6)
STATION_TYPE_LABELS = {"buoy": "Buoy", "fixed": "Shore station", "other": "Buoy"}
# A current-meter file holds 45 days of readings (up to ~2 MB), newest first.
# Its first 4 KB always contain the newest reading.
ADCP_HEAD_BYTES = 4096
OBSERVATIONS_CACHE_FILE = "observations/latest.json"
OBSERVATIONS_LOCK_FILE = "observations-refresh.lock"
OBSERVATIONS_CACHE_TTL_SECONDS = 30 * 60
OBSERVATIONS_FAILURE_BACKOFF_SECONDS = 5 * 60
_refresh_lock = threading.Lock()


def _get(url: str, max_bytes: int | None = None) -> str:
    headers = {"User-Agent": "Fishing-Logbook-GreatLakes/1.0"}
    if max_bytes:
        headers["Range"] = f"bytes=0-{max_bytes - 1}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        # If the server ignores the range, still read no more than needed.
        return response.read(max_bytes or -1).decode("utf-8", "replace")


def _in_bounds(latitude: float, longitude: float) -> bool:
    south, west, north, east = GREAT_LAKES_BOUNDS
    return south <= latitude <= north and west <= longitude <= east


def _number(value: str) -> float | None:
    if value in {"", "MM"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _timestamp(fields: list[str]) -> datetime | None:
    try:
        year, month, day, hour, minute = (int(value) for value in fields[:5])
        return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    except (ValueError, IndexError):
        return None


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def parse_active_stations(xml_text: str) -> dict[str, dict]:
    stations = {}
    for node in ET.fromstring(xml_text).iter("station"):
        latitude, longitude = _number(node.get("lat", "")), _number(node.get("lon", ""))
        if latitude is None or longitude is None or not _in_bounds(latitude, longitude):
            continue
        station_id = node.get("id", "").upper()
        stations[station_id] = {
            "id": station_id,
            "name": node.get("name", station_id).strip(),
            "owner": node.get("owner", "").strip(),
            "type": STATION_TYPE_LABELS.get(node.get("type", ""), "Station"),
            "latitude": latitude,
            "longitude": longitude,
            "hasCurrents": node.get("currents") == "y",
        }
    return stations


def parse_latest_water_temperatures(text: str, now: datetime) -> dict[str, dict]:
    """Water temperature (WTMP) per station from NDBC's latest-observation table."""
    lines = text.splitlines()
    header = next((line for line in lines if line.startswith("#")), "").lstrip("#").split()
    if "WTMP" not in header or "STN" not in header:
        return {}
    station_column, time_column, temperature_column = header.index("STN"), header.index("YYYY"), header.index("WTMP")
    readings = {}
    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        fields = line.split()
        if len(fields) <= temperature_column:
            continue
        temperature = _number(fields[temperature_column])
        observed = _timestamp(fields[time_column:time_column + 5])
        if temperature is None or observed is None or not -5 <= temperature <= 40 or now - observed > MAX_OBSERVATION_AGE:
            continue
        readings[fields[station_column].upper()] = {"temperatureC": temperature, "observedAt": _iso(observed)}
    return readings


def parse_latest_waves(text: str, now: datetime) -> dict[str, dict]:
    """Measured waves per station: height (WVHT), dominant period (DPD), and direction waves come from (MWD)."""
    lines = text.splitlines()
    header = next((line for line in lines if line.startswith("#")), "").lstrip("#").split()
    if "WVHT" not in header or "STN" not in header:
        return {}
    columns = {name: header.index(name) for name in ("STN", "YYYY", "WVHT", "DPD", "MWD") if name in header}
    readings = {}
    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        fields = line.split()
        if len(fields) <= columns["WVHT"]:
            continue
        height = _number(fields[columns["WVHT"]])
        observed = _timestamp(fields[columns["YYYY"]:columns["YYYY"] + 5])
        if height is None or observed is None or not 0 <= height <= 15 or now - observed > MAX_OBSERVATION_AGE:
            continue
        period = _number(fields[columns["DPD"]]) if "DPD" in columns and len(fields) > columns["DPD"] else None
        direction = _number(fields[columns["MWD"]]) if "MWD" in columns and len(fields) > columns["MWD"] else None
        readings[fields[columns["STN"]].upper()] = {
            "heightMeters": height,
            "periodSeconds": period,
            "directionDegrees": direction % 360 if direction is not None else None,
            "observedAt": _iso(observed),
        }
    return readings


def parse_adcp(text: str, now: datetime) -> dict | None:
    """Most recent current profile from an NDBC ``.adcp`` realtime file.

    NDBC reports direction as the bearing the water flows *toward*.
    """
    for line in text.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        fields = line.split()
        observed = _timestamp(fields)
        if observed is None or now - observed > MAX_OBSERVATION_AGE:
            return None
        values = []
        for offset in range(5, len(fields) - 2, 3):
            depth, direction, speed = (_number(value) for value in fields[offset:offset + 3])
            if depth is None or direction is None or speed is None or speed < 0:
                continue
            values.append({"depthMeters": depth, "directionDegrees": direction % 360, "speedMetersPerSecond": speed / 100})
        return {"observedAt": _iso(observed), "values": values} if values else None
    return None


def _current_profile(station_id: str, now: datetime) -> dict | None:
    try:
        return parse_adcp(_get(f"{NDBC}/data/realtime2/{station_id}.adcp", ADCP_HEAD_BYTES), now)
    except Exception:
        return None


def _build_payload() -> dict:
    now = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=2) as executor:
        stations_future = executor.submit(_get, ACTIVE_STATIONS_URL)
        latest_future = executor.submit(_get, LATEST_OBSERVATIONS_URL)
        stations = parse_active_stations(stations_future.result())
        try:
            latest = latest_future.result()
            temperatures = parse_latest_water_temperatures(latest, now)
            wave_readings = parse_latest_waves(latest, now)
        except Exception:
            temperatures, wave_readings = {}, {}
    current_ids = [station_id for station_id, station in stations.items() if station["hasCurrents"]]
    currents: dict[str, dict | None] = {}
    if current_ids:
        with ThreadPoolExecutor(max_workers=min(8, len(current_ids))) as executor:
            currents = dict(zip(current_ids, executor.map(lambda station_id: _current_profile(station_id, now), current_ids)))
    results = []
    for station_id, station in stations.items():
        temperature, current, measured_waves = temperatures.get(station_id), currents.get(station_id), wave_readings.get(station_id)
        if not temperature and not current and not measured_waves:
            continue
        results.append({
            "id": station_id,
            "name": station["name"],
            "owner": station["owner"],
            "type": station["type"],
            "latitude": station["latitude"],
            "longitude": station["longitude"],
            "url": f"{NDBC}/station_page.php?station={station_id.lower()}",
            "waterTemperature": temperature,
            "current": current,
            "waves": measured_waves,
        })
    results.sort(key=lambda item: item["id"])
    return {"generatedAt": _iso(now), "source": "NOAA National Data Buoy Center", "stations": results}


def _read_cached_payload() -> dict | None:
    saved = cache.read_json(cache.path_for(OBSERVATIONS_CACHE_FILE))
    if not isinstance(saved, dict) or not isinstance(saved.get("payload"), dict):
        return None
    return saved


def _is_fresh(saved: dict, now: float) -> bool:
    return now - float(saved.get("savedAt", 0)) < OBSERVATIONS_CACHE_TTL_SECONDS


def _serve_cached(saved: dict, *, stale: bool = False) -> dict:
    payload = saved["payload"]
    return {**payload, "stale": True} if stale else payload


def great_lakes_observations() -> dict:
    """Reuse one shared NOAA snapshot and keep serving it during provider outages."""
    now = time.time()
    saved = _read_cached_payload()
    if saved and _is_fresh(saved, now):
        return _serve_cached(saved)
    if saved and now - float(saved.get("checkedAt", 0)) < OBSERVATIONS_FAILURE_BACKOFF_SECONDS:
        return _serve_cached(saved, stale=True)

    with _refresh_lock:
        now = time.time()
        saved = _read_cached_payload()
        if saved and _is_fresh(saved, now):
            return _serve_cached(saved)
        if saved and now - float(saved.get("checkedAt", 0)) < OBSERVATIONS_FAILURE_BACKOFF_SECONDS:
            return _serve_cached(saved, stale=True)

        process_lock = cache.LeaderLock(cache.path_for(OBSERVATIONS_LOCK_FILE))
        if not process_lock.acquire():
            if saved:
                return _serve_cached(saved, stale=True)
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                time.sleep(0.2)
                saved = _read_cached_payload()
                if saved:
                    return _serve_cached(saved, stale=not _is_fresh(saved, time.time()))
            raise RuntimeError("NOAA station refresh is already in progress")

        try:
            now = time.time()
            saved = _read_cached_payload()
            if saved and _is_fresh(saved, now):
                return _serve_cached(saved)
            try:
                payload = _build_payload()
            except Exception:
                if saved:
                    saved["checkedAt"] = now
                    try:
                        cache.write_json(cache.path_for(OBSERVATIONS_CACHE_FILE), saved)
                    except OSError:
                        pass
                    return _serve_cached(saved, stale=True)
                raise

            snapshot = {"savedAt": time.time(), "checkedAt": time.time(), "payload": payload}
            try:
                cache.write_json(cache.path_for(OBSERVATIONS_CACHE_FILE), snapshot)
            except OSError:
                pass
            return payload
        finally:
            process_lock.release()
