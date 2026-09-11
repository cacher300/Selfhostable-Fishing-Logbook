#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend import cloud_storage
from backend.backend_config import PREVIEW_DIRNAME, UPLOAD_CATEGORIES
from backend.logbook_store import read_logbook
from backend.media_service import read_upload_metadata, upload_category_path, upload_media_type


def totals(logbook: dict) -> tuple[int, int]:
    trips = logbook.get("trips") if isinstance(logbook.get("trips"), list) else []
    catches = sum(
        len(trip.get("catches") or [])
        for trip in trips
        if isinstance(trip, dict)
    )
    return len(trips), catches


def migrate_media() -> tuple[int, int]:
    count = 0
    byte_total = 0
    for category in sorted(UPLOAD_CATEGORIES):
        directory = upload_category_path(category)
        for item in sorted(directory.iterdir()):
            if not item.is_file() or item.name.endswith(".json"):
                continue
            metadata = read_upload_metadata(category, item.name)
            content_type = metadata.get("mimeType") or mimetypes.guess_type(item.name)[0] or ""
            media_type = upload_media_type(content_type, item.suffix.lower())
            if not media_type:
                continue
            if not content_type:
                content_type = "image/jpeg" if media_type == "image" else "video/mp4"
            content = item.read_bytes()
            cloud_storage.put_media(
                category,
                item.name,
                content,
                content_type,
                metadata.get("name") or item.name,
                metadata,
            )
            preview_filename = metadata.get("previewFilename") or ""
            if preview_filename:
                preview = directory / PREVIEW_DIRNAME / preview_filename
                if preview.is_file():
                    cloud_storage.put_preview(category, preview_filename, preview.read_bytes())
            count += 1
            byte_total += len(content)
    return count, byte_total


def main() -> int:
    if not cloud_storage.enabled():
        raise SystemExit("Set FISH_STORAGE_BACKEND=cloud and configure the cloud API URL/token first.")

    local_logbook = read_logbook()
    local_trips, local_catches = totals(local_logbook)
    media_count, media_bytes = migrate_media()
    revision = cloud_storage.put_logbook(local_logbook)

    cloud_logbook, verified_revision = cloud_storage.get_logbook()
    cloud_trips, cloud_catches = totals(cloud_logbook)
    inventory = cloud_storage.list_media()
    inventory_bytes = sum(int(item.get("byte_size") or 0) for item in inventory)

    if (cloud_trips, cloud_catches) != (local_trips, local_catches):
        raise SystemExit("Cloud logbook verification failed.")
    if len(inventory) != media_count or inventory_bytes != media_bytes:
        raise SystemExit("Cloud media inventory verification failed.")

    print(json.dumps({
        "ok": True,
        "revision": verified_revision or revision,
        "trips": cloud_trips,
        "catches": cloud_catches,
        "mediaObjects": len(inventory),
        "mediaBytes": inventory_bytes,
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
