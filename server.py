from __future__ import annotations

import json
import uuid
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

from backend.backend_config import (
    ALLOWED_MEDIA_EXTENSIONS,
    DATA_DIR,
    DATABASE_FILE,
    DEFAULT_LOGBOOK,
    HOST,
    PORT,
    PREVIEW_DIRNAME,
    ROOT,
    SECRET_KEY,
    UPLOAD_CATEGORIES,
)
from backend.logbook_store import (
    database_exists,
    initialize_database,
    normalize_logbook,
    read_logbook,
    validate_logbook,
    write_logbook,
)
from backend.bathymetry_service import (
    apply_depth_result,
    lookup_depth,
    preserve_existing_depth_fields,
    valid_coordinates,
)
from backend.request_security import configure_request_security, csrf_token
from backend.media_service import (
    create_upload_preview,
    delete_upload_file,
    cleanup_orphaned_uploads,
    read_upload_metadata,
    referenced_uploads,
    upload_captions,
    upload_category_path,
    upload_gallery_items,
    upload_media_type,
    upload_metadata_path,
    upload_payload,
    upload_preview_path,
    write_upload_metadata,
)
from backend.weather_service import (
    astronomy_payload,
    marine_weather_payload,
    weather_archive_payload,
    weather_forecast_payload,
)


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=SECRET_KEY,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
    )
    if config:
        app.config.update(config)
    configure_request_security(app)

    @app.after_request
    def add_no_store_header(response: Response) -> Response:
        if request.endpoint != "static_files":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/logbook")
    def get_logbook() -> Response:
        return jsonify(read_logbook())

    @app.get("/api/csrf-token")
    def get_csrf_token() -> Response:
        return jsonify({"csrfToken": csrf_token()})

    @app.put("/api/logbook")
    def update_logbook() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True)
        is_valid, error = validate_logbook(payload)
        if not is_valid:
            return jsonify({"error": error}), 400

        normalized = normalize_logbook(payload)
        preserve_existing_depth_fields(normalized, read_logbook())
        write_logbook(normalized)
        cleanup_orphaned_uploads()
        return jsonify({"ok": True})

    @app.get("/api/weather/archive")
    def weather_archive() -> tuple[Response, int]:
        payload, status = weather_archive_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/weather/forecast")
    def weather_forecast() -> tuple[Response, int]:
        payload, status = weather_forecast_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/weather/marine")
    def marine_weather() -> tuple[Response, int]:
        payload, status = marine_weather_payload(request.args)
        return jsonify(payload), status

    @app.get("/api/bathymetry/depth")
    def catch_depth() -> tuple[Response, int]:
        coordinates = valid_coordinates({
            "latitude": request.args.get("latitude"),
            "longitude": request.args.get("longitude"),
        })
        if coordinates is None:
            return jsonify({"error": "Catch coordinates are invalid."}), 400
        latitude, longitude = coordinates
        try:
            result = lookup_depth(latitude, longitude)
        except Exception:
            app.logger.exception("Depth lookup failed for catch coordinates.")
            return jsonify({"error": "Depth lookup unavailable."}), 503
        catch = {}
        apply_depth_result(catch, result)
        return jsonify(catch)

    @app.get("/api/astronomy")
    def astronomy() -> tuple[Response, int]:
        payload, status = astronomy_payload(request.args)
        return jsonify(payload), status

    @app.post("/api/uploads/<category>")
    def upload_photo(category: str) -> tuple[Response, int] | Response:
        upload_category_path(category)
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return jsonify({"error": "No file uploaded"}), 400

        filename = secure_filename(upload.filename) or "upload.jpg"
        suffix = Path(filename).suffix.lower() or ".jpg"
        media_type = upload_media_type(upload.mimetype or "", suffix)
        if not media_type or suffix not in ALLOWED_MEDIA_EXTENSIONS:
            return jsonify({"error": "Only photo and video uploads are supported"}), 400

        stored_name = f"{uuid.uuid4().hex}{suffix}"
        destination = upload_category_path(category) / stored_name
        upload.save(destination)
        preview_filename = create_upload_preview(category, stored_name) if media_type == "image" else ""
        metadata = request.form.get("metadata")
        try:
            metadata_payload = json.loads(metadata) if metadata else {}
        except json.JSONDecodeError:
            metadata_payload = {}
        metadata_payload = {
            **metadata_payload,
            "name": filename,
            "mimeType": upload.mimetype,
            "mediaType": media_type,
            "previewFilename": preview_filename,
        }
        write_upload_metadata(category, stored_name, metadata_payload)

        return jsonify(upload_payload(category, stored_name, metadata_payload))

    @app.get("/api/photo-queue")
    def list_photo_queue() -> Response:
        queue_dir = upload_category_path("queue")
        items = []
        for file_path in queue_dir.iterdir():
            if not file_path.is_file() or file_path.suffix == ".json":
                continue
            metadata = read_upload_metadata("queue", file_path.name)
            items.append({
                **upload_payload("queue", file_path.name, metadata),
                "modified": file_path.stat().st_mtime,
            })
        items.sort(key=lambda item: item["modified"], reverse=True)
        return jsonify({"photos": items})

    @app.get("/api/gallery")
    def list_gallery() -> Response | tuple[Response, int]:
        category = request.args.get("category", "all")
        categories = sorted(UPLOAD_CATEGORIES) if category == "all" else [category]
        if any(item not in UPLOAD_CATEGORIES for item in categories):
            return jsonify({"error": "Invalid upload category"}), 400
        items = []
        for item_category in categories:
            items.extend(upload_gallery_items(item_category))
        captions = upload_captions(read_logbook())
        for item in items:
            item_captions = captions.get((item["category"], item["filename"]), [])
            if item_captions:
                item["captions"] = item_captions
        items.sort(key=lambda item: item["modified"], reverse=True)
        return jsonify({"media": items})

    @app.get("/api/orphaned-media")
    def list_orphaned_media() -> Response:
        return jsonify({"media": [], "deleted": cleanup_orphaned_uploads()})

    @app.delete("/api/uploads/<category>/<filename>")
    def delete_upload(category: str, filename: str) -> tuple[Response, int] | Response:
        if category not in UPLOAD_CATEGORIES or category == "queue":
            return jsonify({"error": "Invalid upload category"}), 400
        safe_name = secure_filename(filename)
        media_path = upload_category_path(category) / safe_name
        if not safe_name or not media_path.exists() or not media_path.is_file():
            return jsonify({"error": "Upload not found"}), 404
        if (category, safe_name) in referenced_uploads(read_logbook()):
            return jsonify({"error": "This upload is still attached to the logbook"}), 409

        delete_upload_file(category, safe_name)
        return jsonify({"ok": True})

    @app.post("/api/photo-queue/claim")
    def claim_photo_queue_item() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True) or {}
        filename = secure_filename(str(payload.get("filename", "")))
        target_category = str(payload.get("targetCategory", ""))
        if target_category not in UPLOAD_CATEGORIES or target_category == "queue":
            return jsonify({"error": "Invalid target category"}), 400
        source = upload_category_path("queue") / filename
        if not filename or not source.exists() or not source.is_file():
            return jsonify({"error": "Queued photo not found"}), 404

        suffix = source.suffix.lower() or ".jpg"
        target_name = f"{uuid.uuid4().hex}{suffix}"
        destination = upload_category_path(target_category) / target_name
        source.replace(destination)

        metadata = read_upload_metadata("queue", filename)
        media_type = metadata.get("mediaType") or upload_media_type(metadata.get("mimeType", ""), suffix)
        preview_filename = metadata.get("previewFilename") or ""
        if preview_filename:
            source_preview = upload_preview_path("queue", filename)
            target_preview = upload_preview_path(target_category, target_name)
            if source_preview.exists():
                source_preview.replace(target_preview)
                preview_filename = target_preview.name
            else:
                preview_filename = create_upload_preview(target_category, target_name)
        else:
            preview_filename = create_upload_preview(target_category, target_name) if media_type == "image" else ""
        metadata["mediaType"] = media_type or "image"
        metadata["previewFilename"] = preview_filename
        source_metadata = upload_metadata_path("queue", filename)
        if source_metadata.exists():
            source_metadata.unlink()
        write_upload_metadata(target_category, target_name, metadata)
        return jsonify(upload_payload(target_category, target_name, metadata))

    @app.delete("/api/photo-queue/<filename>")
    def delete_photo_queue_item(filename: str) -> Response:
        safe_name = secure_filename(filename)
        photo = upload_category_path("queue") / safe_name
        metadata = upload_metadata_path("queue", safe_name)
        preview = upload_preview_path("queue", safe_name)
        if photo.exists() and photo.is_file():
            photo.unlink()
        if metadata.exists():
            metadata.unlink()
        if preview.exists():
            preview.unlink()
        return jsonify({"ok": True})

    @app.get("/uploads/<category>/_previews/<filename>")
    def uploaded_preview_file(category: str, filename: str) -> Response:
        return send_from_directory(upload_category_path(category) / PREVIEW_DIRNAME, filename)

    @app.get("/uploads/<category>/<filename>")
    def uploaded_file(category: str, filename: str) -> Response:
        return send_from_directory(upload_category_path(category), filename)

    @app.get("/favicon.ico")
    def favicon() -> tuple[str, int]:
        return "", 204

    @app.get("/trips")
    @app.get("/")
    @app.get("/bests")
    @app.get("/stats")
    @app.get("/map")
    @app.get("/gear")
    @app.get("/gallery")
    @app.get("/settings")
    def app_page() -> Response:
        return send_file(ROOT / "index.html")

    @app.get("/static/<path:filename>")
    def static_files(filename: str) -> Response:
        if filename.startswith(".") or "/." in filename:
            abort(404)
        static_root = (ROOT / "static").resolve()
        requested = (static_root / filename).resolve()
        if static_root not in requested.parents or requested.suffix.lower() not in {".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp"}:
            abort(404)
        return send_from_directory(static_root, filename)

    return app


app = create_app()


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if not database_exists():
        write_logbook(DEFAULT_LOGBOOK)
    else:
        initialize_database()

    print(f"Selfhostable Fishing Logbook running at http://{HOST}:{PORT}")
    print(f"Database: {DATABASE_FILE}")
    app.run(host=HOST, port=PORT, threaded=True)


if __name__ == "__main__":
    main()
