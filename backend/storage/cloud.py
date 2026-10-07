"""Cloud storage through the Cloudflare Worker API.

This module only relocates the cloud branches that previously lived inline in
``server.py``; behaviour is unchanged. The HTTP client is
:mod:`backend.cloud_storage`, which is intentionally left untouched.
"""

from __future__ import annotations

import json
import mimetypes
import uuid
from pathlib import Path
from typing import Callable, Iterable
from zipfile import ZipFile

from flask import Response
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from .. import cloud_storage
from ..backend_config import PREVIEW_DIRNAME, UPLOAD_CATEGORIES
from ..logbook_store import validate_logbook
from ..media_service import MediaNotFound, upload_media_type, upload_payload
from ..shared_trip_archive import ArchiveMedia
from .base import LogbookSnapshot, MediaInventoryIncomplete, archive_media_entries
from .local import LocalMediaStore


class CloudLogbookStore:
    def exists(self) -> bool:
        return True

    def initialize(self) -> None:
        return None

    def read(self) -> LogbookSnapshot:
        payload, revision = cloud_storage.get_logbook()
        is_valid, error = validate_logbook(payload)
        if not is_valid:
            raise cloud_storage.CloudStorageError(f"Cloud logbook is invalid: {error}", 500)
        return LogbookSnapshot(payload, revision)

    def write(self, document: dict, expected_revision: str | None) -> str:
        return cloud_storage.put_logbook(document, expected_revision or "")

    def install(self, document: dict) -> str:
        return cloud_storage.put_logbook(document)


def _inventory_metadata(item: dict) -> dict:
    return dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})


class CloudMediaStore:
    def __init__(self, scratch: LocalMediaStore):
        # Uploads are validated and processed on local disk first, exactly as
        # before, then pushed to the Worker and removed locally.
        self.scratch = scratch

    def save_upload(self, category: str, upload: FileStorage | None, metadata_json: str | None, logbook: Callable[[], dict]) -> dict:
        stored = self.scratch.store_upload(category, upload, metadata_json, logbook)
        original_uploaded = False
        try:
            cloud_storage.put_media(
                category,
                stored.filename,
                stored.media_path.read_bytes(),
                stored.metadata.get("mimeType") or stored.mimetype or "application/octet-stream",
                stored.original_name,
                stored.metadata,
            )
            original_uploaded = True
            if stored.preview_path and stored.preview_path.is_file():
                cloud_storage.put_preview(category, stored.preview_path.name, stored.preview_path.read_bytes())
        except Exception:
            if original_uploaded:
                cloud_storage.delete_object(category, stored.filename, missing_ok=True)
            raise
        finally:
            self.scratch.library.delete_file(category, stored.filename, stored.metadata)
        return stored.payload

    def list_queue(self) -> list[dict]:
        items = [cloud_storage.payload_from_inventory(item) for item in cloud_storage.list_media("queue")]
        items.sort(key=lambda item: item["modified"], reverse=True)
        return items

    def list_gallery(self, categories: Iterable[str], single_category: str | None) -> list[dict]:
        inventory = cloud_storage.list_media(single_category)
        return [cloud_storage.payload_from_inventory(item) for item in inventory]

    def list_orphans(self, references: set[tuple[str, str]]) -> list[dict]:
        inventory = cloud_storage.list_media()
        if len(inventory) >= 500:
            inventory = []
            for category in sorted(UPLOAD_CATEGORIES - {"queue"}):
                category_items = cloud_storage.list_media(category)
                if len(category_items) >= 500:
                    raise MediaInventoryIncomplete(
                        f"Cloud {category} inventory reached its 500-item limit; the orphan scan cannot verify all uploads."
                    )
                inventory.extend(category_items)
        items = [
            cloud_storage.payload_from_inventory(item)
            for item in inventory
            if item.get("category") != "queue"
            and (item.get("category"), item.get("filename")) not in references
        ]
        items.sort(key=lambda item: item["modified"], reverse=True)
        return items

    def delete(self, category: str, filename: str) -> None:
        item = cloud_storage.inventory_item(category, filename)
        if not item:
            raise MediaNotFound("Upload not found")
        preview_filename = _inventory_metadata(item).get("previewFilename") or ""
        if preview_filename:
            cloud_storage.delete_object(category, preview_filename, preview=True, missing_ok=True)
        cloud_storage.delete_object(category, filename)

    def _copy_queue_item(self, filename: str, target_category: str, *, move: bool) -> dict:
        item = cloud_storage.inventory_item("queue", filename)
        if not item:
            raise cloud_storage.CloudStorageError("Queued photo not found", 404)
        suffix = Path(filename).suffix.lower() or ".jpg"
        target_name = f"{uuid.uuid4().hex}{suffix}"
        metadata = _inventory_metadata(item)
        source_preview = str(metadata.get("previewFilename") or "")
        target_preview = f"{Path(target_name).stem}.jpg" if source_preview else ""
        metadata["previewFilename"] = target_preview
        metadata["mediaType"] = metadata.get("mediaType") or (
            "video" if str(item.get("content_type") or "").startswith("video/") else "image"
        )
        body, headers = cloud_storage.get_object("queue", filename)
        uploaded = False
        try:
            cloud_storage.put_media(
                target_category,
                target_name,
                body,
                headers.get("content-type") or item.get("content_type") or "application/octet-stream",
                item.get("original_name") or filename,
                metadata,
            )
            uploaded = True
            if source_preview:
                preview_body, _ = cloud_storage.get_object("queue", source_preview, preview=True)
                cloud_storage.put_preview(target_category, target_preview, preview_body)
        except Exception:
            if uploaded:
                cloud_storage.delete_object(target_category, target_name, missing_ok=True)
                if target_preview:
                    cloud_storage.delete_object(target_category, target_preview, preview=True, missing_ok=True)
            raise
        if move:
            if source_preview:
                cloud_storage.delete_object("queue", source_preview, preview=True, missing_ok=True)
            cloud_storage.delete_object("queue", filename)
        return upload_payload(target_category, target_name, metadata)

    def claim_queue_item(self, filename: str, target_category: str) -> dict:
        return self._copy_queue_item(filename, target_category, move=True)

    def copy_queue_item(self, filename: str, target_category: str) -> dict:
        return self._copy_queue_item(filename, target_category, move=False)

    def delete_queue_item(self, filename: str) -> None:
        item = cloud_storage.inventory_item("queue", filename)
        if item:
            preview_filename = _inventory_metadata(item).get("previewFilename") or ""
            if preview_filename:
                cloud_storage.delete_object("queue", preview_filename, preview=True, missing_ok=True)
            cloud_storage.delete_object("queue", filename, missing_ok=True)

    def serve(self, category: str, filename: str, *, preview: bool) -> Response:
        if category not in UPLOAD_CATEGORIES or secure_filename(filename) != filename:
            raise MediaNotFound("Upload not found")
        body, headers = cloud_storage.get_object(category, filename, preview=preview)
        if preview:
            response = Response(body, mimetype=headers.get("content-type", "image/jpeg"))
        else:
            response = Response(body, mimetype=headers.get("content-type", "application/octet-stream"))
            response.headers["Content-Disposition"] = headers.get("content-disposition", f'inline; filename="{filename}"')
        if headers.get("etag"):
            response.headers["ETag"] = headers["etag"]
        return response

    def write_archive_media(self, bundle: ZipFile) -> None:
        for item in cloud_storage.list_media():
            category = item.get("category")
            filename = item.get("filename")
            if category not in UPLOAD_CATEGORIES or not filename:
                continue
            body, _ = cloud_storage.get_object(category, filename)
            bundle.writestr(f"media/{category}/{filename}", body)
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            bundle.writestr(
                f"media/{category}/{filename}.json",
                json.dumps(metadata, separators=(",", ":")),
            )
            preview_filename = metadata.get("previewFilename") or ""
            if preview_filename:
                try:
                    preview, _ = cloud_storage.get_object(category, preview_filename, preview=True)
                    bundle.writestr(f"media/{category}/{PREVIEW_DIRNAME}/{preview_filename}", preview)
                except cloud_storage.CloudStorageError as error:
                    if error.status != 404:
                        raise

    def import_archive(self, bundle: ZipFile, names: list[str], install_logbook: Callable[[], None]) -> None:
        for name in archive_media_entries(names):
            _, category, *relative = Path(name).parts
            if relative[0] == PREVIEW_DIRNAME:
                if len(relative) == 2:
                    cloud_storage.put_preview(category, relative[1], bundle.read(name))
                continue
            filename = relative[0]
            if len(relative) != 1 or filename.endswith(".json"):
                continue
            metadata_name = f"media/{category}/{filename}.json"
            try:
                metadata = json.loads(bundle.read(metadata_name)) if metadata_name in names else {}
            except json.JSONDecodeError:
                metadata = {}
            content_type = metadata.get("mimeType") or mimetypes.guess_type(filename)[0] or ""
            media_type = upload_media_type(content_type, Path(filename).suffix.lower())
            if not media_type:
                continue
            if not content_type:
                content_type = f"{media_type}/jpeg" if media_type == "image" else "video/mp4"
            cloud_storage.put_media(
                category,
                filename,
                bundle.read(name),
                content_type,
                metadata.get("name") or filename,
                metadata,
            )
        install_logbook()

    def shared_archive_item(self, category: str, filename: str) -> ArchiveMedia | None:
        item = cloud_storage.inventory_item(category, filename)
        if not item:
            return None
        metadata = _inventory_metadata(item)
        content, _ = cloud_storage.get_object(category, filename)
        preview = None
        preview_name = str(metadata.get("previewFilename") or "")
        if preview_name:
            try:
                preview, _ = cloud_storage.get_object(category, preview_name, preview=True)
            except cloud_storage.CloudStorageError as error:
                if error.status != 404:
                    raise
        return ArchiveMedia(category, filename, content, metadata, preview)

    def import_shared_media(self, media: list[ArchiveMedia], commit_logbook: Callable[[], str]) -> str:
        for item in media:
            content_type = str(item.metadata.get("mimeType") or mimetypes.guess_type(item.filename)[0] or "application/octet-stream")
            cloud_storage.put_media(
                item.category,
                item.filename,
                item.content,
                content_type,
                str(item.metadata.get("name") or item.filename),
                item.metadata,
            )
            preview_name = str(item.metadata.get("previewFilename") or "")
            if item.preview and preview_name:
                cloud_storage.put_preview(item.category, preview_name, item.preview)
        return commit_logbook()
