"""Whole-logbook archive (ZIP) export and import validation."""

from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

from .backend_config import UPLOAD_CATEGORIES
from .logbook_store import validate_logbook
from .media_service import referenced_uploads
from .storage import MediaStore


ARCHIVE_MANIFEST = {
    "archiveVersion": 2,
    "format": "fishing-logbook-archive",
    "schemaVersion": 2,
}


class ArchiveImportError(ValueError):
    """The archive is not a valid, complete v2 logbook archive."""


def write_archive(path: Path, document: dict, media: MediaStore) -> None:
    with ZipFile(path, "w", ZIP_STORED, allowZip64=True) as bundle:
        bundle.writestr("manifest.json", json.dumps(ARCHIVE_MANIFEST, separators=(",", ":")))
        bundle.writestr("logbook.json", json.dumps(document, separators=(",", ":")))
        media.write_archive_media(bundle)


def read_import_bundle(bundle: ZipFile) -> tuple[dict, list[str]]:
    """Validate an archive's manifest, logbook, and media paths.

    Returns the logbook document and the archive's entry names.
    """
    names = bundle.namelist()
    if len(names) != len(set(names)):
        raise ArchiveImportError("Archive contains duplicate file paths.")
    if "manifest.json" not in names:
        raise ArchiveImportError("Archive is missing its manifest or logbook.")
    manifest = json.loads(bundle.read("manifest.json"))
    if not isinstance(manifest, dict) or any(manifest.get(key) != value for key, value in ARCHIVE_MANIFEST.items()):
        raise ArchiveImportError("This archive version is not supported.")
    if "logbook.json" not in names:
        raise ArchiveImportError("Archive is missing its manifest or logbook.")
    payload = json.loads(bundle.read("logbook.json"))
    is_valid, error = validate_logbook(payload)
    if not is_valid:
        raise ArchiveImportError(error or "The archived logbook is invalid.")

    media_names: set[str] = set()
    for name in names:
        if not name.startswith("media/") or name.endswith("/"):
            continue
        parts = Path(name).parts
        if len(parts) < 3 or parts[1] not in UPLOAD_CATEGORIES or any(part in {".", ".."} for part in parts):
            raise ArchiveImportError("Archive contains an invalid media path.")
        media_names.add(name)
    missing_media = sorted(
        f"media/{category}/{filename}"
        for category, filename in referenced_uploads(payload)
        if f"media/{category}/{filename}" not in media_names
    )
    if missing_media:
        raise ArchiveImportError(f"Archive is missing referenced media: {missing_media[0]}.")
    return payload, names
