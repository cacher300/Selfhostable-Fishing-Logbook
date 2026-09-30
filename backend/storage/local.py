"""Local storage: SQLite logbook plus an on-disk uploads tree."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import uuid
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable
from zipfile import ZipFile

from flask import Response, send_from_directory
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from .. import logbook_repository
from ..backend_config import ALLOWED_MEDIA_EXTENSIONS, DEFAULT_LOGBOOK, PREVIEW_DIRNAME, UPLOAD_CATEGORIES
from ..logbook_changes import LogbookChangeError, apply_changes
from ..logbook_store import COLLECTION_KEYS, OBJECT_COLLECTION_KEYS, OPTIONAL_COLLECTION_KEYS, LogbookStorageError, validate_logbook
from ..media_service import (
    MediaNotFound,
    UploadLibrary,
    convert_heif_upload,
    extract_image_metadata,
    orphaned_items,
    scrub_private_photo_metadata,
    upload_media_type,
    upload_payload,
)
from ..shared_trip_archive import ArchiveMedia, SharedTripArchiveError
from .base import LogbookSnapshot, MediaRequestError, RevisionConflict, archive_media_entries
from .media_transaction import MediaTransaction


logger = logging.getLogger(__name__)


def revision_tag(revision: int) -> str:
    return f'"{revision}"'


def parse_revision_tag(tag: str | None) -> int | None:
    """Parse an ``If-Match`` value; ``None`` means the write is unconditional."""
    value = str(tag or "").strip()
    if not value or value == "*":
        return None
    value = value.removeprefix("W/").strip().strip('"')
    try:
        return int(value)
    except ValueError as error:
        raise LogbookChangeError("If-Match must contain a logbook revision") from error


class LocalLogbookStore:
    def __init__(self, database_file: Path):
        self.database_file = Path(database_file)
        self._lock = threading.Lock()
        # (revision, file identity, document). The identity guards against the
        # database file being replaced by another process at the same revision.
        self._cache: tuple[int, tuple[int, int] | None, dict] | None = None

    def exists(self) -> bool:
        return self.database_file.is_file()

    def initialize(self) -> None:
        self.database_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.exists():
            self.write(deepcopy(DEFAULT_LOGBOOK), None)
        else:
            # Validate an existing file without running schema-creation SQL
            # against a possibly legacy or corrupt database. Explicit archive
            # import is the only path that replaces incompatible storage.
            self.read()

    def _file_identity(self) -> tuple[int, int] | None:
        try:
            stat = self.database_file.stat()
        except OSError:
            return None
        return stat.st_ino, stat.st_ctime_ns

    def _remember(self, revision: int, document: dict) -> None:
        identity = self._file_identity()
        with self._lock:
            self._cache = (revision, identity, document)

    def _read_revision(self) -> int | None:
        try:
            return logbook_repository.current_revision(self.database_file)
        except Exception as error:
            raise LogbookStorageError(f"Could not open the stored logbook database: {error}") from error

    def read(self) -> LogbookSnapshot:
        revision = self._read_revision()
        if revision is None:
            return LogbookSnapshot(deepcopy(DEFAULT_LOGBOOK), revision_tag(0))
        with self._lock:
            cached = self._cache
        if cached and cached[0] == revision and cached[1] == self._file_identity():
            return LogbookSnapshot(cached[2], revision_tag(revision))
        try:
            loaded, revision = logbook_repository.read_with_revision(self.database_file, COLLECTION_KEYS)
        except Exception as error:
            raise LogbookStorageError(f"Could not open the stored logbook database: {error}") from error
        if loaded is None:
            return LogbookSnapshot(deepcopy(DEFAULT_LOGBOOK), revision_tag(revision))
        try:
            is_valid, error = validate_logbook(loaded)
        except Exception as validation_error:
            raise LogbookStorageError(f"Stored logbook could not be validated: {validation_error}") from validation_error
        if not is_valid:
            raise LogbookStorageError(f"Stored logbook is invalid: {error}")
        self._remember(revision, loaded)
        return LogbookSnapshot(loaded, revision_tag(revision))

    def write(self, document: dict, expected_revision: str | None) -> str:
        is_valid, error = validate_logbook(document)
        if not is_valid:
            raise ValueError(error)
        expected = parse_revision_tag(expected_revision)
        try:
            revision = logbook_repository.write(
                self.database_file,
                document,
                COLLECTION_KEYS,
                OBJECT_COLLECTION_KEYS,
                expected_revision=expected,
            )
        except logbook_repository.RevisionConflict as conflict:
            raise RevisionConflict(revision_tag(conflict.current_revision)) from conflict
        self._remember(revision, document)
        return revision_tag(revision)

    def apply_changes(self, changes: list, expected_revision: str | None) -> str:
        snapshot = self.read()
        base_revision = parse_revision_tag(snapshot.revision)
        expected = parse_revision_tag(expected_revision)
        if expected is not None and expected != base_revision:
            raise RevisionConflict(snapshot.revision)
        document = deepcopy(snapshot.document)
        plan = apply_changes(
            document,
            changes,
            collection_keys=COLLECTION_KEYS,
            object_collection_keys=OBJECT_COLLECTION_KEYS,
        )
        is_valid, error = validate_logbook(document)
        if not is_valid:
            raise LogbookChangeError(error or "The changed logbook is invalid")
        try:
            if self._read_revision() is None:
                revision = logbook_repository.write(
                    self.database_file, document, COLLECTION_KEYS, OBJECT_COLLECTION_KEYS,
                    expected_revision=base_revision,
                )
            else:
                metadata: dict[str, object] = {
                    # "extra" is rewritten so collections promoted out of it
                    # cannot shadow their new rows.
                    "extra": {
                        key: value for key, value in document.items()
                        if key not in {*COLLECTION_KEYS, "schemaVersion", "settings"}
                    },
                    "optionalCollectionsPresent": [
                        key for key in COLLECTION_KEYS
                        if key in OPTIONAL_COLLECTION_KEYS and key in document
                    ],
                }
                if plan.settings_changed:
                    metadata["settings"] = document["settings"]
                rewritten_collections = set(plan.rewritten_collections)
                rewritten_collections.update(
                    key for key in OPTIONAL_COLLECTION_KEYS
                    if key in document
                )
                revision = logbook_repository.write_partial(
                    self.database_file,
                    expected_revision=base_revision,
                    object_collection_keys=OBJECT_COLLECTION_KEYS,
                    collections={name: document[name] for name in rewritten_collections},
                    record_updates=plan.record_updates(document),
                    metadata=metadata,
                )
        except logbook_repository.RevisionConflict as conflict:
            raise RevisionConflict(revision_tag(conflict.current_revision)) from conflict
        self._remember(revision, document)
        return revision_tag(revision)

    def install(self, document: dict) -> str:
        is_valid, error = validate_logbook(document)
        if not is_valid:
            raise ValueError(error)
        try:
            revision = logbook_repository.write(self.database_file, document, COLLECTION_KEYS, OBJECT_COLLECTION_KEYS)
        except (OSError, sqlite3.Error) as write_error:
            # Archive import is the explicit recovery action. If the existing
            # SQLite file cannot accept SQL at all, install the validated
            # archive into a fresh database instead of failing against the
            # old schema.
            logger.warning("Could not update the existing database during archive import; replacing it: %s", write_error)
            with self._lock:
                previous = self._cache[0] if self._cache else 0
            revision = logbook_repository.replace(
                self.database_file, document, COLLECTION_KEYS, OBJECT_COLLECTION_KEYS,
                previous_revision=previous,
            )
        self._remember(revision, document)
        return revision_tag(revision)


@dataclass(frozen=True)
class StoredUpload:
    category: str
    filename: str
    original_name: str
    mimetype: str
    metadata: dict
    media_path: Path
    preview_path: Path | None

    @property
    def payload(self) -> dict:
        return upload_payload(self.category, self.filename, self.metadata)


class LocalMediaStore:
    def __init__(self, uploads_dir: Path, scratch_dir: Path, logbook_reader: Callable[[], dict]):
        self.library = UploadLibrary(uploads_dir, logbook_reader)
        self.scratch_dir = Path(scratch_dir)

    def _transaction(self) -> MediaTransaction:
        return MediaTransaction(self.scratch_dir)

    def store_upload(self, category: str, upload: FileStorage | None, metadata_json: str | None, logbook: Callable[[], dict]) -> StoredUpload:
        """Validate, convert, preview, and write one upload with its sidecar."""
        directory = self.library.category_path(category)
        if upload is None or not upload.filename:
            raise MediaRequestError("No file uploaded")

        filename = secure_filename(upload.filename) or "upload.jpg"
        suffix = Path(filename).suffix.lower() or ".jpg"
        media_type = upload_media_type(upload.mimetype or "", suffix)
        if not media_type or suffix not in ALLOWED_MEDIA_EXTENSIONS:
            raise MediaRequestError("Only photo and video uploads are supported")

        destination = directory / f"{uuid.uuid4().hex}{suffix}"
        upload.save(destination)
        stored = destination
        preview_filename = ""
        try:
            try:
                stored = convert_heif_upload(destination)
            except ValueError as error:
                raise MediaRequestError(str(error)) from error
            converted_heif = suffix in {".heic", ".heif"}
            preview_filename = self.library.create_preview(category, stored.name) if media_type == "image" else ""
            try:
                metadata = json.loads(metadata_json) if metadata_json else {}
            except json.JSONDecodeError:
                metadata = {}
            if not isinstance(metadata, dict):
                metadata = {}
            if media_type == "image":
                metadata = scrub_private_photo_metadata({**extract_image_metadata(stored), **metadata}, logbook())
            metadata = {
                **metadata,
                "name": filename,
                "mimeType": "image/jpeg" if converted_heif else upload.mimetype,
                "mediaType": media_type,
                "previewFilename": preview_filename,
                **({"convertedFrom": suffix.removeprefix(".").upper()} if converted_heif else {}),
                **({"_heifMetadataVersion": 1} if converted_heif else {}),
            }
            self.library.write_metadata(category, stored.name, metadata)
        except Exception:
            # Never leave a half-processed upload behind.
            self.library.delete_file(category, stored.name, {"previewFilename": preview_filename})
            raise
        preview_path = self.library.preview_dir(category) / preview_filename if preview_filename else None
        return StoredUpload(category, stored.name, filename, upload.mimetype or "", metadata, stored, preview_path)

    def save_upload(self, category: str, upload: FileStorage | None, metadata_json: str | None, logbook: Callable[[], dict]) -> dict:
        return self.store_upload(category, upload, metadata_json, logbook).payload

    def list_queue(self) -> list[dict]:
        queue_dir = self.library.category_path("queue")
        items = []
        for file_path in queue_dir.iterdir():
            if not file_path.is_file() or file_path.suffix == ".json":
                continue
            metadata = self.library.read_metadata("queue", file_path.name)
            items.append({
                **upload_payload("queue", file_path.name, metadata),
                "modified": file_path.stat().st_mtime,
            })
        items.sort(key=lambda item: item["modified"], reverse=True)
        return items

    def list_gallery(self, categories: Iterable[str], single_category: str | None) -> list[dict]:
        items: list[dict] = []
        for category in categories:
            items.extend(self.library.gallery_items(category))
        return items

    def list_orphans(self, references: set[tuple[str, str]]) -> list[dict]:
        items: list[dict] = []
        for category in sorted(UPLOAD_CATEGORIES - {"queue"}):
            items.extend(self.library.gallery_items(category))
        return orphaned_items(items, references)

    def delete(self, category: str, filename: str) -> None:
        media_path = self.library.category_path(category) / filename
        if not media_path.is_file():
            raise MediaNotFound("Upload not found")
        self.library.delete_file(category, filename)

    def _queue_source(self, filename: str) -> Path:
        source = self.library.category_path("queue") / filename
        if not filename or not source.is_file():
            raise MediaNotFound("Queued photo not found")
        return source

    def _transfer_queue_item(self, filename: str, target_category: str, *, move: bool) -> dict:
        source = self._queue_source(filename)
        suffix = source.suffix.lower() or ".jpg"
        target_name = f"{uuid.uuid4().hex}{suffix}"
        destination = self.library.category_path(target_category) / target_name
        metadata = self.library.read_metadata("queue", filename)
        media_type = metadata.get("mediaType") or upload_media_type(metadata.get("mimeType", ""), suffix)
        preview_filename = metadata.get("previewFilename") or ""
        source_preview = self.library.preview_dir("queue") / (
            preview_filename or self.library.preview_path("queue", filename).name
        )
        target_preview = self.library.preview_path(target_category, target_name)
        # A claim only reuses a preview the sidecar names; a copy reuses any
        # preview found for the queued file.
        reuse_preview = source_preview.exists() and (bool(preview_filename) or not move)

        with self._transaction() as transaction:
            if move:
                transaction.move(source, destination)
                if reuse_preview:
                    transaction.move(source_preview, target_preview)
                transaction.remove(self.library.metadata_path("queue", filename))
            else:
                transaction.copy(source, destination)
                if reuse_preview:
                    transaction.copy(source_preview, target_preview)
            transaction.promote()

            if reuse_preview:
                preview_filename = target_preview.name
            else:
                transaction.created(target_preview)
                preview_filename = self.library.create_preview(target_category, target_name) if media_type == "image" else ""
            metadata["mediaType"] = media_type or "image"
            metadata["previewFilename"] = preview_filename
            transaction.created(self.library.metadata_path(target_category, target_name))
            self.library.write_metadata(target_category, target_name, metadata)
        return upload_payload(target_category, target_name, metadata)

    def claim_queue_item(self, filename: str, target_category: str) -> dict:
        return self._transfer_queue_item(filename, target_category, move=True)

    def copy_queue_item(self, filename: str, target_category: str) -> dict:
        return self._transfer_queue_item(filename, target_category, move=False)

    def delete_queue_item(self, filename: str) -> None:
        photo = self.library.category_path("queue") / filename
        metadata_path = self.library.metadata_path("queue", filename)
        metadata = self.library.read_metadata("queue", filename)
        preview = self.library.category_path("queue") / PREVIEW_DIRNAME / (
            metadata.get("previewFilename") or self.library.preview_path("queue", filename).name
        )
        for path in (photo, metadata_path, preview):
            if path.is_file():
                path.unlink()

    def serve(self, category: str, filename: str, *, preview: bool) -> Response:
        directory = self.library.category_path(category)
        return send_from_directory(directory / PREVIEW_DIRNAME if preview else directory, filename)

    def write_archive_media(self, bundle: ZipFile) -> None:
        for category in UPLOAD_CATEGORIES:
            directory = self.library.category_path(category)
            for item in directory.rglob("*"):
                if item.is_file():
                    bundle.write(item, f"media/{category}/{item.relative_to(directory).as_posix()}")

    def import_archive(self, bundle: ZipFile, names: list[str], install_logbook: Callable[[], None]) -> None:
        with self._transaction() as transaction:
            for name in archive_media_entries(names):
                _, category, *relative = Path(name).parts
                root = self.library.category_path(category).resolve()
                target = (root / Path(*relative)).resolve()
                if root not in target.parents:
                    raise MediaRequestError("Archive media path escapes its category.")
                with bundle.open(name) as source:
                    transaction.stage_stream(target, source, overwrite=True)
            transaction.promote()
            install_logbook()

    def shared_archive_item(self, category: str, filename: str) -> ArchiveMedia | None:
        source = self.library.category_path(category) / filename
        if not source.is_file():
            return None
        metadata = self.library.read_metadata(category, filename)
        preview_name = str(metadata.get("previewFilename") or "")
        preview = None
        if preview_name:
            preview_path = self.library.category_path(category) / PREVIEW_DIRNAME / preview_name
            if preview_path.is_file():
                preview = preview_path.read_bytes()
        return ArchiveMedia(category, filename, source.read_bytes(), metadata, preview)

    def import_shared_media(self, media: list[ArchiveMedia], commit_logbook: Callable[[], str]) -> str:
        collision = "A generated imported-media filename already exists. Please import the ZIP again."
        with self._transaction() as transaction:
            for item in media:
                target = self.library.category_path(item.category) / item.filename
                if target.exists():
                    raise SharedTripArchiveError(collision)
                transaction.stage_bytes(target, item.content)
                transaction.stage_bytes(
                    self.library.metadata_path(item.category, item.filename),
                    json.dumps(item.metadata, allow_nan=False).encode("utf-8"),
                )
                preview_name = str(item.metadata.get("previewFilename") or "")
                if item.preview and preview_name:
                    transaction.stage_bytes(self.library.preview_dir(item.category) / preview_name, item.preview)
            try:
                transaction.promote()
            except FileExistsError as error:
                raise SharedTripArchiveError(collision) from error
            return commit_logbook()
