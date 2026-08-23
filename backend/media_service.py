from __future__ import annotations

import json
import math
import re
from pathlib import Path

from flask import abort
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from .backend_config import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    PREVIEW_DIRNAME,
    PREVIEW_MAX_SIZE,
    UPLOAD_CATEGORIES,
    UPLOADS_DIR,
)
from .logbook_store import read_logbook


register_heif_opener()


def upload_category_path(category: str) -> Path:
    if category not in UPLOAD_CATEGORIES:
        abort(404)
    path = UPLOADS_DIR / category
    path.mkdir(parents=True, exist_ok=True)
    return path


def upload_metadata_path(category: str, filename: str) -> Path:
    return upload_category_path(category) / f"{filename}.json"


def upload_preview_path(category: str, filename: str) -> Path:
    preview_dir = upload_category_path(category) / PREVIEW_DIRNAME
    preview_dir.mkdir(parents=True, exist_ok=True)
    return preview_dir / f"{Path(filename).stem}.jpg"


def write_upload_metadata(category: str, filename: str, metadata: dict) -> None:
    upload_metadata_path(category, filename).write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def read_upload_metadata(category: str, filename: str) -> dict:
    metadata_path = upload_metadata_path(category, filename)
    if not metadata_path.exists():
        return {}
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if metadata.get("convertedFrom") in {"HEIC", "HEIF"} and metadata.get("_heifMetadataVersion") != 1:
        metadata = scrub_private_photo_metadata({
            **extract_image_metadata(category, filename),
            **metadata,
            "_heifMetadataVersion": 1,
        })
        write_upload_metadata(category, filename, metadata)
    return metadata


def delete_upload_file(category: str, filename: str, metadata: dict | None = None) -> None:
    metadata = metadata or read_upload_metadata(category, filename)
    media_path = upload_category_path(category) / filename
    metadata_path = upload_metadata_path(category, filename)
    preview_filename = metadata.get("previewFilename") or upload_preview_path(category, filename).name
    preview_path = upload_category_path(category) / PREVIEW_DIRNAME / preview_filename
    for path in (media_path, metadata_path, preview_path):
        if path.is_file():
            path.unlink()


def media_key_from_reference(value: object) -> tuple[str, str] | None:
    if not isinstance(value, dict):
        return None

    path = str(value.get("path") or "")
    if "/" in path:
        category, stored_name = path.split("/", 1)
        return category, stored_name

    for field in ("url", "image"):
        media_path = str(value.get(field) or "")
        if not media_path.startswith("/uploads/"):
            continue
        parts = media_path.removeprefix("/uploads/").split("/")
        if len(parts) >= 2:
            return parts[0], parts[1]

    return None


def referenced_uploads(value: object) -> set[tuple[str, str]]:
    references: set[tuple[str, str]] = set()
    if isinstance(value, list):
        for item in value:
            references.update(referenced_uploads(item))
    elif isinstance(value, dict):
        media_key = media_key_from_reference(value)
        if media_key:
            references.add(media_key)
        elif value.get("filename"):
            filename = str(value.get("filename") or "")
            for category in UPLOAD_CATEGORIES:
                if (upload_category_path(category) / filename).is_file():
                    references.add((category, filename))
        for item in value.values():
            references.update(referenced_uploads(item))
    return references


def upload_captions(value: object) -> dict[tuple[str, str], list[str]]:
    captions: dict[tuple[str, str], list[str]] = {}

    def add_caption(media_key: tuple[str, str] | None, caption: object) -> None:
        text = str(caption or "").strip()
        if not media_key or not text:
            return
        values = captions.setdefault(media_key, [])
        if text not in values:
            values.append(text)

    def walk(item: object) -> None:
        if isinstance(item, list):
            for child in item:
                walk(child)
            return
        if not isinstance(item, dict):
            return
        add_caption(media_key_from_reference(item), item.get("caption"))
        for child in item.values():
            walk(child)

    walk(value)
    return captions


def create_upload_preview(category: str, filename: str) -> str:
    source = upload_category_path(category) / filename
    preview = upload_preview_path(category, filename)
    try:
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail(PREVIEW_MAX_SIZE)
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(preview, "JPEG", quality=78, optimize=True)
    except (OSError, UnidentifiedImageError):
        return ""
    return preview.name


def convert_heif_upload(category: str, filename: str) -> str:
    """Convert a browser-incompatible HEIC/HEIF upload to a displayable JPEG."""
    source = upload_category_path(category) / filename
    if source.suffix.lower() not in {".heic", ".heif"}:
        return filename

    converted_name = f"{source.stem}.jpg"
    converted = source.with_name(converted_name)
    try:
        with Image.open(source) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            exif = image.getexif()
            if image.mode != "RGB":
                image = image.convert("RGB")
            save_options = {"quality": 92, "optimize": True}
            if exif:
                save_options["exif"] = exif.tobytes()
            image.save(converted, "JPEG", **save_options)
    except (OSError, UnidentifiedImageError):
        if converted.is_file():
            converted.unlink()
        raise ValueError("The HEIC/HEIF photo could not be converted.")

    source.unlink()
    return converted_name


def _exif_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip("\x00 ")
    return str(value or "").strip()


def _decimal_exif_coordinate(value: object, reference: object) -> float | None:
    try:
        degrees, minutes, seconds = (float(part) for part in value)
    except (TypeError, ValueError):
        return None
    coordinate = degrees + minutes / 60 + seconds / 3600
    if _exif_text(reference).upper() in {"S", "W"}:
        coordinate *= -1
    return coordinate


def extract_image_metadata(category: str, filename: str) -> dict:
    """Read capture time and GPS from an uploaded image's EXIF data."""
    source = upload_category_path(category) / filename
    try:
        with Image.open(source) as image:
            exif = image.getexif()
            exif_ifd = exif.get_ifd(0x8769)
            gps_ifd = exif.get_ifd(0x8825)
    except (OSError, UnidentifiedImageError):
        return {}

    metadata: dict = {}
    captured = _exif_text(
        exif_ifd.get(0x9003)
        or exif_ifd.get(0x9004)
        or exif.get(0x9003)
        or exif.get(0x9004)
        or exif.get(0x0132)
    )
    match = re.match(r"^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?", captured)
    if match:
        year, month, day, hour, minute, second = match.groups()
        second = second or "00"
        metadata.update({
            "captureDate": f"{year}-{month}-{day}",
            "captureTime": f"{hour}:{minute}",
            "capturedAt": f"{year}-{month}-{day}T{hour}:{minute}:{second}",
        })

    latitude = _decimal_exif_coordinate(gps_ifd.get(2), gps_ifd.get(1))
    longitude = _decimal_exif_coordinate(gps_ifd.get(4), gps_ifd.get(3))
    if latitude is not None and longitude is not None and -90 <= latitude <= 90 and -180 <= longitude <= 180:
        metadata["coordinates"] = {"latitude": latitude, "longitude": longitude}
    return metadata


def scrub_private_photo_metadata(metadata: dict) -> dict:
    """Apply the same private-location rule used by the browser metadata reader."""
    coordinates = metadata.get("coordinates")
    try:
        latitude = float(coordinates["latitude"])
        longitude = float(coordinates["longitude"])
    except (KeyError, TypeError, ValueError):
        return metadata

    for location in read_logbook().get("settings", {}).get("privatePhotoLocations", []):
        private_coordinates = location.get("coordinates") or {}
        try:
            private_latitude = float(private_coordinates["latitude"])
            private_longitude = float(private_coordinates["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        radius = max(25, min(10000, float(location.get("radiusMeters") or 400)))
        earth_radius = 6371000
        delta_latitude = math.radians(private_latitude - latitude)
        delta_longitude = math.radians(private_longitude - longitude)
        value = (
            math.sin(delta_latitude / 2) ** 2
            + math.cos(math.radians(latitude))
            * math.cos(math.radians(private_latitude))
            * math.sin(delta_longitude / 2) ** 2
        )
        value = max(0, min(1, value))
        distance = earth_radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))
        if distance <= radius:
            scrubbed = {
                key: value
                for key, value in metadata.items()
                if key not in {"captureDate", "captureTime", "capturedAt"}
            }
            scrubbed["coordinates"] = None
            scrubbed["gpsIgnoredReason"] = "home"
            return scrubbed
    return metadata


def upload_media_type(mimetype: str, suffix: str) -> str:
    if suffix in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if suffix in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    if mimetype.startswith("image/"):
        return "image"
    if mimetype.startswith("video/"):
        return "video"
    return ""


def upload_payload(category: str, filename: str, metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    public_metadata = {
        key: value for key, value in metadata.items() if not key.startswith("_")
    }
    preview_filename = metadata.get("previewFilename") or ""
    return {
        **public_metadata,
        "filename": filename,
        "name": metadata.get("name") or filename,
        "path": f"{category}/{filename}",
        "url": f"/uploads/{category}/{filename}",
        "image": f"/uploads/{category}/{filename}",
        "mediaType": metadata.get("mediaType") or "image",
        "previewFilename": preview_filename,
        "previewPath": f"{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
        "previewUrl": f"/uploads/{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
        "previewImage": f"/uploads/{category}/{PREVIEW_DIRNAME}/{preview_filename}" if preview_filename else "",
    }


def upload_gallery_items(category: str) -> list[dict]:
    directory = upload_category_path(category)
    items = []
    for file_path in directory.iterdir():
        if not file_path.is_file() or file_path.suffix == ".json":
            continue
        metadata = read_upload_metadata(category, file_path.name)
        items.append({
            **upload_payload(category, file_path.name, metadata),
            "category": category,
            "size": file_path.stat().st_size,
            "modified": file_path.stat().st_mtime,
            "downloadUrl": f"/uploads/{category}/{file_path.name}",
        })
    return items


def orphaned_upload_items() -> list[dict]:
    references = referenced_uploads(read_logbook())
    items = []
    for category in sorted(UPLOAD_CATEGORIES - {"queue"}):
        for item in upload_gallery_items(category):
            if (category, item["filename"]) not in references:
                items.append(item)
    items.sort(key=lambda item: item["modified"], reverse=True)
    return items


def cleanup_orphaned_uploads() -> int:
    items = orphaned_upload_items()
    for item in items:
        delete_upload_file(item["category"], item["filename"], item)
    return len(items)
