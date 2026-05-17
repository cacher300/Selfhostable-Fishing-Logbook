from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "logbook.json"
UPLOADS_DIR = ROOT / "data" / "uploads"
TRIP_PHOTO_DIR = UPLOADS_DIR / "trip-photos"

EXIF_DATETIME_TAGS = (36867, 36868, 306)


def parse_exif_datetime(value: object) -> dict[str, str] | None:
    text = str(value or "").strip()
    if len(text) < 16 or text[4:5] != ":" or text[7:8] != ":":
        return None

    date_part, _, time_part = text.partition(" ")
    if not time_part:
        return None

    year, month, day = date_part.split(":")
    pieces = time_part.split(":")
    if len(pieces) < 2:
        return None

    hour, minute = pieces[:2]
    second = pieces[2] if len(pieces) > 2 else "00"
    if not all(part.isdigit() for part in (year, month, day, hour, minute, second)):
        return None

    return {
        "captureDate": f"{year}-{month}-{day}",
        "captureTime": f"{hour}:{minute}",
        "capturedAt": f"{year}-{month}-{day}T{hour}:{minute}:{second}",
    }


def read_image_exif_time(path: Path) -> dict[str, str] | None:
    try:
        with Image.open(path) as image:
            exif = image.getexif()
    except (OSError, UnidentifiedImageError):
        return None

    for tag in EXIF_DATETIME_TAGS:
        parsed = parse_exif_datetime(exif.get(tag))
        if parsed:
            return parsed
    return None


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def trip_photo_path(photo: dict[str, Any]) -> Path | None:
    path_value = str(photo.get("path") or photo.get("imagePath") or "").strip()
    filename = str(photo.get("filename") or photo.get("imageFilename") or "").strip()
    url = str(photo.get("url") or photo.get("image") or "").strip()

    candidates = []
    if path_value:
        candidates.append(UPLOADS_DIR / path_value)
    if filename:
        candidates.append(TRIP_PHOTO_DIR / filename)
    if "/uploads/trip-photos/" in url:
        candidates.append(TRIP_PHOTO_DIR / url.rsplit("/", 1)[-1])

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def sidecar_path(photo_path: Path) -> Path:
    return photo_path.with_name(f"{photo_path.name}.json")


def backfill_photo_time(photo: dict[str, Any], dry_run: bool) -> bool:
    if photo.get("captureTime") and photo.get("capturedAt"):
        return False

    photo_path = trip_photo_path(photo)
    if not photo_path:
        return False

    sidecar = read_json(sidecar_path(photo_path))
    metadata = {
        key: sidecar.get(key)
        for key in ("captureDate", "captureTime", "capturedAt")
        if sidecar.get(key)
    }
    if not metadata.get("captureTime"):
        metadata = read_image_exif_time(photo_path) or {}
    if not metadata.get("captureTime"):
        return False

    photo.update(metadata)
    sidecar.update(metadata)
    if not dry_run:
        write_json(sidecar_path(photo_path), sidecar)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill EXIF capture times for old trip photos.")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing logbook.json or sidecar metadata.")
    args = parser.parse_args()

    logbook = read_json(DATA_FILE)
    changed = 0
    for trip in logbook.get("trips", []):
        for photo in trip.get("notePhotos", []):
            if backfill_photo_time(photo, args.dry_run):
                changed += 1

    if changed and not args.dry_run:
        write_json(DATA_FILE, logbook)

    action = "would update" if args.dry_run else "updated"
    print(f"{action} {changed} trip photo record{'s' if changed != 1 else ''}")


if __name__ == "__main__":
    main()
