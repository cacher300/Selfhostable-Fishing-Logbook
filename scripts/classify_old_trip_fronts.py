"""Explicit, one-time Open-Meteo backfill. Never run during app startup.

Dry run by default. --apply creates a matching SQLite/uploads backup before a
revision-checked write. Existing manual classifications are always preserved.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import logbook_repository
from backend.config import AppConfig
from backend.logbook_store import validate_logbook
from backend.storage.local import LocalLogbookStore


def coordinates_for(document: dict, trip: dict) -> dict | None:
    location = next((x for x in document.get("locations", []) if x.get("id") == trip.get("locationId") or (trip.get("location") and x.get("name") == trip["location"])), {})
    launch = next((x for x in location.get("launches", []) if x.get("id") == trip.get("launchId") or (trip.get("launch") and x.get("name") == trip["launch"])), {})
    for point in [trip.get("coordinates"), launch.get("coordinates"), location.get("coordinates"), (trip.get("weatherData") or {}).get("source", {}).get("coordinates") if isinstance((trip.get("weatherData") or {}).get("source"), dict) else None]:
        if not isinstance(point, dict):
            continue
        lat, lon = point.get("latitude"), point.get("longitude")
        if type(lat) in (int, float) and type(lon) in (int, float) and -90 <= lat <= 90 and -180 <= lon <= 180 and (lat, lon) != (0, 0):
            return {"latitude": lat, "longitude": lon}
    return None


def fetch_context(trip: dict, point: dict) -> dict:
    target = date.fromisoformat(trip["date"])
    start_clock = trip.get("launchTime") or trip.get("linesSetTime") or "00:00"
    end_clock = trip.get("linesPulledTime") or "23:59"
    end = target + timedelta(days=int(end_clock < start_clock))
    endpoint = "https://archive-api.open-meteo.com/v1/archive" if end + timedelta(days=1) < date.today() - timedelta(days=5) else "https://api.open-meteo.com/v1/forecast"
    params = {"latitude": point["latitude"], "longitude": point["longitude"], "start_date": (target - timedelta(days=1)).isoformat(), "end_date": (end + timedelta(days=1)).isoformat(), "timezone": "auto", "temperature_unit": "celsius", "wind_speed_unit": "kmh", "hourly": "temperature_2m,pressure_msl,wind_direction_10m,wind_speed_10m"}
    for attempt in range(4):
        try:
            with urlopen(endpoint + "?" + urlencode(params), timeout=30) as response:
                payload = json.load(response)
            if payload.get("error"):
                raise ValueError("Open-Meteo returned an error")
            return payload
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(min(20, 2 ** (attempt + 1)))
    raise RuntimeError("Weather lookup failed")


def assessments(inputs: list[dict]) -> list[dict]:
    rules = (ROOT / "static/js/generated/weather-front-rules.js").as_uri()
    code = "import { classifyWeatherFront } from " + json.dumps(rules) + "; import { readFileSync } from 'node:fs'; const inputs=JSON.parse(readFileSync(0,'utf8')); process.stdout.write(JSON.stringify(inputs.map(x=>classifyWeatherFront(x.trip,x.bundle))));"
    process = subprocess.run(["node", "--input-type=module", "-e", code], input=json.dumps(inputs), capture_output=True, text=True, check=True, cwd=ROOT)
    return json.loads(process.stdout)


def backfill(document: dict, fetch=fetch_context, progress=None) -> tuple[dict, dict]:
    updated = deepcopy(document)
    inputs, indexes = [], []
    counts = Counter()
    for index, trip in enumerate(updated.get("trips", [])):
        if trip.get("weatherFrontSource") == "manual" or trip.get("weatherFront"):
            counts["preserved"] += 1
            continue
        point = coordinates_for(document, trip)
        if not point or not trip.get("date"):
            counts["missing_date_or_coordinates"] += 1
            continue
        try:
            bundle = fetch(trip, point)
            inputs.append({"trip": {key: trip.get(key) for key in ("date", "launchTime", "linesSetTime", "linesPulledTime")}, "bundle": bundle})
            indexes.append(index)
        except Exception:
            # Do not print provider URLs: they include private coordinates.
            counts["lookup_failed"] += 1
        if progress:
            progress(index + 1, len(updated["trips"]))
    for index, assessment in zip(indexes, assessments(inputs), strict=True):
        if not assessment["value"]:
            counts["insufficient_weather"] += 1
            continue
        trip = updated["trips"][index]
        trip["weatherFront"] = assessment["value"]
        trip["weatherFrontSource"] = "automatic"
        trip["weatherData"] = {**(trip.get("weatherData") or {}), "frontAssessment": {**assessment, "provider": "Open-Meteo", "fetchedAt": datetime.now(timezone.utc).isoformat()}}
        counts[assessment["value"]] += 1
    valid, error = validate_logbook(updated)
    if not valid:
        raise ValueError(error)
    return updated, dict(counts)


def backup_pair(database: Path, uploads: Path, expected_revision: str) -> Path:
    backup = database.parent / "backups" / ("weather-front-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    backup.mkdir(parents=True, exist_ok=False)
    logbook_repository.backup(database, backup / database.name)
    if LocalLogbookStore(backup / database.name).read().revision != expected_revision:
        raise RuntimeError("Database changed before backup; nothing was written. Run again.")
    if uploads.exists():
        shutil.copytree(uploads, backup / "uploads")
    else:
        (backup / "uploads").mkdir()
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = AppConfig.from_env()
    database = (args.database or config.database_file).resolve()
    if not database.is_file():
        raise SystemExit("Database does not exist; no database will be created.")
    if args.apply:
        try:
            with socket.create_connection(("127.0.0.1", config.port), timeout=0.5):
                raise SystemExit("Stop the local app before applying this one-time backfill, then run again.")
        except OSError:
            pass
    store = LocalLogbookStore(database)
    original = store.read()
    print(f"Reading {len(original.document.get('trips', []))} trips. Fetching Open-Meteo context.", flush=True)
    def progress(done, total):
        print(f"Weather checked: {done}/{total}", flush=True)
        time.sleep(0.5)
    updated, counts = backfill(original.document, progress=progress)
    print(json.dumps(counts, sort_keys=True), flush=True)
    if not args.apply:
        print("Dry run; database unchanged. Use --apply to back up and write.")
        return
    if updated == original.document:
        print("No changes to apply.")
        return
    if store.read().revision != original.revision:
        raise SystemExit("Database changed during weather lookups; nothing written. Run again.")
    backup = backup_pair(database, database.parent / "uploads", original.revision)
    revision = store.write(updated, original.revision)
    if store.read().document != updated:
        raise RuntimeError("Read-back verification failed; backup was retained.")
    (backup / "classification-summary.json").write_text(json.dumps({"counts": counts, "previousRevision": original.revision, "newRevision": revision}, indent=2), encoding="utf-8")
    print(f"Applied and verified. Matching database/media backup: {backup}")


if __name__ == "__main__":
    main()
