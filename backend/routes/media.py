"""Uploads, gallery, orphan cleanup, and the photo queue."""

from __future__ import annotations

from flask import Blueprint, Response, jsonify, request
from werkzeug.utils import secure_filename

from ..backend_config import UPLOAD_CATEGORIES
from ..media_service import referenced_uploads, upload_captions
from . import read_document, storage


blueprint = Blueprint("media", __name__)


@blueprint.post("/api/uploads/<category>")
def upload_photo(category: str) -> Response:
    payload = storage().media.save_upload(
        category,
        request.files.get("file"),
        request.form.get("metadata"),
        read_document,
    )
    return jsonify(payload)


@blueprint.get("/api/photo-queue")
def list_photo_queue() -> Response:
    return jsonify({"photos": storage().media.list_queue()})


@blueprint.get("/api/gallery")
def list_gallery() -> tuple[Response, int] | Response:
    category = request.args.get("category", "all")
    categories = sorted(UPLOAD_CATEGORIES) if category == "all" else [category]
    if any(item not in UPLOAD_CATEGORIES for item in categories):
        return jsonify({"error": "Invalid upload category"}), 400
    items = storage().media.list_gallery(categories, None if category == "all" else category)
    captions = upload_captions(read_document())
    for item in items:
        item_captions = captions.get((item["category"], item["filename"]), [])
        if item_captions:
            item["captions"] = item_captions
    items.sort(key=lambda item: item["modified"], reverse=True)
    return jsonify({"media": items})


@blueprint.get("/api/orphaned-media")
def list_orphaned_media() -> Response:
    references = referenced_uploads(read_document())
    return jsonify({"media": storage().media.list_orphans(references)})


@blueprint.delete("/api/uploads/<category>/<filename>")
def delete_upload(category: str, filename: str) -> tuple[Response, int] | Response:
    if category not in UPLOAD_CATEGORIES or category == "queue":
        return jsonify({"error": "Invalid upload category"}), 400
    safe_name = secure_filename(filename)
    if not safe_name:
        return jsonify({"error": "Upload not found"}), 404
    if (category, safe_name) in referenced_uploads(read_document()):
        return jsonify({"error": "This upload is still attached to the logbook"}), 409
    storage().media.delete(category, safe_name)
    return jsonify({"ok": True})


def _queue_request() -> tuple[str, str] | tuple[Response, int]:
    payload = request.get_json(silent=True) or {}
    filename = secure_filename(str(payload.get("filename", "")))
    target_category = str(payload.get("targetCategory", ""))
    if target_category not in UPLOAD_CATEGORIES or target_category == "queue":
        return jsonify({"error": "Invalid target category"}), 400
    return filename, target_category


@blueprint.post("/api/photo-queue/claim")
def claim_photo_queue_item() -> tuple[Response, int] | Response:
    parsed = _queue_request()
    if isinstance(parsed[0], Response):
        return parsed  # type: ignore[return-value]
    filename, target_category = parsed
    return jsonify(storage().media.claim_queue_item(filename, target_category))


@blueprint.post("/api/photo-queue/copy")
def copy_photo_queue_item() -> tuple[Response, int] | Response:
    """Copy a queued photo for autofill while keeping the queue original for review."""
    parsed = _queue_request()
    if isinstance(parsed[0], Response):
        return parsed  # type: ignore[return-value]
    filename, target_category = parsed
    return jsonify(storage().media.copy_queue_item(filename, target_category))


@blueprint.delete("/api/photo-queue/<filename>")
def delete_photo_queue_item(filename: str) -> Response:
    storage().media.delete_queue_item(secure_filename(filename))
    return jsonify({"ok": True})


@blueprint.get("/uploads/<category>/_previews/<filename>")
def uploaded_preview_file(category: str, filename: str) -> Response:
    return storage().media.serve(category, filename, preview=True)


@blueprint.get("/uploads/<category>/<filename>")
def uploaded_file(category: str, filename: str) -> Response:
    return storage().media.serve(category, filename, preview=False)
