"""Logbook document, record changes, archives, and Shared Trip ZIPs."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from flask import Blueprint, Response, current_app, jsonify, request
from werkzeug.utils import secure_filename

from ..archive_service import ArchiveImportError, read_import_bundle, write_archive
from ..cloud_storage import CloudStorageError
from ..logbook_store import LogbookStorageError, validate_logbook
from ..media_service import scrub_private_photo_metadata
from ..shared_trip_archive import (
    ArchiveMedia,
    SharedTripArchiveError,
    archive_preview,
    create_shared_archive,
    merge_shared_archive,
    read_shared_archive,
)
from ..storage import MediaRequestError
from . import app_config, read_document, storage


blueprint = Blueprint("logbook", __name__)


def _with_revision(response: Response, revision: str) -> Response:
    if revision:
        response.headers["ETag"] = revision
    return response


@blueprint.get("/api/logbook")
def get_logbook() -> Response:
    snapshot = storage().logbook.read()
    return _with_revision(jsonify(snapshot.document), snapshot.revision)


def _refuse_unreadable_storage() -> tuple[Response, int] | None:
    # A normal save must never replace an unreadable database with the
    # browser's fallback state. Archive import is the explicit recovery path
    # and is allowed to replace the stored document.
    try:
        storage().logbook.read()
    except LogbookStorageError:
        return jsonify({
            "error": "The stored logbook database is unavailable. Restore a valid archive before saving changes.",
            "databaseUnavailable": True,
        }), 503
    return None


@blueprint.put("/api/logbook")
def update_logbook() -> tuple[Response, int] | Response:
    payload = request.get_json(silent=True)
    is_valid, error = validate_logbook(payload)
    if not is_valid:
        return jsonify({"error": error}), 400
    refused = _refuse_unreadable_storage()
    if refused:
        return refused
    revision = storage().logbook.write(payload, request.headers.get("If-Match"))
    return _with_revision(jsonify({"ok": True}), revision)


@blueprint.get("/api/archive")
def export_archive() -> tuple[Response, int] | Response:
    """Download the canonical logbook and uploaded media as a portable archive."""
    stores = storage()
    if not stores.logbook.exists():
        return jsonify({"error": "The local SQLite database does not exist yet."}), 404
    document = stores.logbook.read().document
    data_dir = app_config().data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(prefix="logbook-export-", suffix=".zip", dir=data_dir, delete=False) as temporary:
        archive_path = Path(temporary.name)
    try:
        write_archive(archive_path, document, stores.media)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise

    def chunks():
        try:
            with archive_path.open("rb") as stream:
                while block := stream.read(1024 * 1024):
                    yield block
        finally:
            archive_path.unlink(missing_ok=True)

    return Response(
        chunks(),
        mimetype="application/zip",
        headers={"Content-Disposition": "attachment; filename=fishing-logbook-archive.zip"},
    )


@blueprint.post("/api/archive")
def import_archive() -> tuple[Response, int] | Response:
    upload = request.files.get("archive")
    if upload is None:
        return jsonify({"error": "Choose an archive file."}), 400
    stores = storage()
    try:
        with ZipFile(upload.stream) as bundle:
            payload, names = read_import_bundle(bundle)
            stores.media.import_archive(bundle, names, lambda: stores.logbook.install(payload))
    except (ArchiveImportError, MediaRequestError) as error:
        return jsonify({"error": str(error)}), 400
    except CloudStorageError:
        raise
    except Exception:
        current_app.logger.exception("Archive import failed")
        return jsonify({"error": "Could not read the archive."}), 400
    return jsonify({"ok": True})


@blueprint.get("/api/trips/<trip_id>/shared-archive")
def export_shared_trip_archive(trip_id: str) -> tuple[Response, int] | Response:
    try:
        document = read_document()
        archive = create_shared_archive(document, trip_id, storage().media.shared_archive_item)
        trip = next((item for item in document.get("trips", []) if str(item.get("id") or "") == trip_id), None)
        title = secure_filename(str((trip or {}).get("title") or "trip")) or "trip"
        date = secure_filename(str((trip or {}).get("date") or ""))
        suffix = f"-{date}" if date else ""
        return Response(
            archive.getvalue(),
            mimetype="application/zip",
            headers={"Content-Disposition": f'attachment; filename="shared-trip{suffix}-{title}.zip"'},
        )
    except SharedTripArchiveError as error:
        return jsonify({"error": str(error)}), 400


@blueprint.post("/api/shared-trip-archive/preview")
def preview_shared_trip_archive() -> tuple[Response, int] | Response:
    upload = request.files.get("archive")
    if upload is None:
        return jsonify({"error": "Choose a Shared Trip ZIP file."}), 400
    try:
        archive = read_shared_archive(upload.stream)
        return jsonify(archive_preview(archive, read_document()))
    except SharedTripArchiveError as error:
        return jsonify({"error": str(error)}), 400


@blueprint.post("/api/shared-trip-archive/import")
def import_shared_trip_archive() -> tuple[Response, int] | Response:
    upload = request.files.get("archive")
    if upload is None:
        return jsonify({"error": "Choose a Shared Trip ZIP file."}), 400
    stores = storage()
    try:
        person_mappings = json.loads(request.form.get("personMappings", "{}"))
        if not isinstance(person_mappings, dict) or any(
            not isinstance(key, str) or not isinstance(value, str) for key, value in person_mappings.items()
        ):
            raise SharedTripArchiveError("Person mappings must be valid selections.")
        action = str(request.form.get("duplicateAction") or "")
        replacement_trip_id = str(request.form.get("replacementTripId") or "")
        archive = read_shared_archive(upload.stream)
        snapshot = stores.logbook.read()
        merged, discarded_media, trip_id = merge_shared_archive(
            archive,
            deepcopy(snapshot.document),
            person_mappings,
            action,
            replacement_trip_id,
        )
        if action == "keep-local":
            return jsonify({"ok": True, "cancelled": True})
        prepared = [
            ArchiveMedia(item.category, item.filename, item.content, scrub_private_photo_metadata(dict(item.metadata), merged), item.preview)
            for item in archive.media.values()
        ]
        expected_revision = request.headers.get("If-Match") or snapshot.revision
        revision = stores.media.import_shared_media(
            prepared,
            lambda: stores.logbook.write(merged, expected_revision),
        )
        response = jsonify({"ok": True, "tripId": trip_id, "discardedMedia": discarded_media})
        return _with_revision(response, revision)
    except SharedTripArchiveError as error:
        return jsonify({"error": str(error)}), 400
    except (TypeError, ValueError, json.JSONDecodeError):
        return jsonify({"error": "Shared trip import selections are invalid."}), 400
