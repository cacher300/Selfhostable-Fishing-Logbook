from __future__ import annotations

import json
import uuid
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_STORED, ZipFile

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
    convert_heif_upload,
    create_upload_preview,
    delete_upload_file,
    extract_image_metadata,
    cleanup_orphaned_uploads,
    orphaned_upload_items,
    read_upload_metadata,
    referenced_uploads,
    scrub_private_photo_metadata,
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
from backend.great_lakes_service import MODELS, great_lakes_payload, great_lakes_temperature_profile, great_lakes_temperature_rasters, great_lakes_temperature_value, great_lakes_thermocline_rasters


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
        return jsonify({"ok": True})

    @app.get("/api/archive")
    def export_archive() -> Response:
        """Portable desktop/mobile archive. Existing web UI is intentionally unchanged."""
        logbook = read_logbook()
        archive = BytesIO()
        with ZipFile(archive, "w", ZIP_STORED) as bundle:
            bundle.writestr("manifest.json", json.dumps({
                "archiveVersion": 1,
                "format": "fishing-logbook-archive",
                "schemaVersion": logbook.get("schemaVersion", 1),
            }, separators=(",", ":")))
            bundle.writestr("logbook.json", json.dumps(logbook, separators=(",", ":")))
            for category in UPLOAD_CATEGORIES:
                directory = upload_category_path(category)
                for item in directory.rglob("*"):
                    if item.is_file():
                        bundle.write(item, f"media/{category}/{item.relative_to(directory).as_posix()}")
        archive.seek(0)
        return Response(archive.getvalue(), mimetype="application/zip", headers={"Content-Disposition": "attachment; filename=fishing-logbook-archive.zip"})

    @app.post("/api/archive")
    def import_archive() -> tuple[Response, int] | Response:
        upload = request.files.get("archive")
        if upload is None:
            return jsonify({"error": "Choose an archive file."}), 400
        try:
            with ZipFile(upload.stream) as bundle:
                names = bundle.namelist()
                if "logbook.json" not in names or "manifest.json" not in names:
                    return jsonify({"error": "Archive is missing its manifest or logbook."}), 400
                manifest = json.loads(bundle.read("manifest.json"))
                if manifest.get("archiveVersion") != 1:
                    return jsonify({"error": "This archive version is not supported."}), 400
                payload = json.loads(bundle.read("logbook.json"))
                is_valid, error = validate_logbook(payload)
                if not is_valid:
                    return jsonify({"error": error}), 400
                media_names: set[str] = set()
                for name in names:
                    if not name.startswith("media/") or name.endswith("/"):
                        continue
                    parts = Path(name).parts
                    if len(parts) < 3 or parts[1] not in UPLOAD_CATEGORIES or any(part in {".", ".."} for part in parts):
                        return jsonify({"error": "Archive contains an invalid media path."}), 400
                    if name in media_names:
                        return jsonify({"error": "Archive contains duplicate media paths."}), 400
                    media_names.add(name)
                with TemporaryDirectory(dir=DATA_DIR) as temporary_directory:
                    temporary_root = Path(temporary_directory)
                    staged_files: list[tuple[str, Path, Path]] = []
                    for name in names:
                        if not name.startswith("media/") or name.endswith("/"):
                            continue
                        _, category, *relative = Path(name).parts
                        root = upload_category_path(category).resolve()
                        target = (root / Path(*relative)).resolve()
                        if root not in target.parents:
                            return jsonify({"error": "Archive media path escapes its category."}), 400
                        staged = temporary_root / "staged" / category / Path(*relative)
                        staged.parent.mkdir(parents=True, exist_ok=True)
                        staged.write_bytes(bundle.read(name))
                        staged_files.append((category, staged, target))

                    promoted: list[tuple[Path, Path | None]] = []
                    try:
                        for category, staged, target in staged_files:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            backup = None
                            if target.is_file():
                                backup = temporary_root / "backup" / category / target.relative_to(upload_category_path(category).resolve())
                                backup.parent.mkdir(parents=True, exist_ok=True)
                                target.replace(backup)
                            promoted.append((target, backup))
                            staged.replace(target)
                        write_logbook(normalize_logbook(payload))
                    except Exception:
                        for target, backup in reversed(promoted):
                            if target.is_file():
                                target.unlink()
                            if backup and backup.is_file():
                                backup.parent.mkdir(parents=True, exist_ok=True)
                                backup.replace(target)
                        raise
        except Exception:
            app.logger.exception("Archive import failed")
            return jsonify({"error": "Could not read the archive."}), 400
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
            settings = read_logbook().get("settings", {})
            result = lookup_depth(latitude, longitude, settings.get("bathymetryLakeCalibrationsFeet"))
        except Exception:
            app.logger.exception("Depth lookup failed for catch coordinates.")
            return jsonify({"error": "Depth lookup unavailable."}), 503
        catch = {}
        apply_depth_result(catch, result)
        return jsonify(catch)

    @app.get("/api/great-lakes/temperature-value")
    def great_lakes_temperature_value_at_point() -> Response:
        try:
            forecast_hour = min((0, 6, 12, 24, 48), key=lambda value: abs(value - int(request.args.get("forecastHour", 0))))
            depth = max(0, min(500, int(request.args.get("depth", 0))))
            resolution = max(128, min(512, int(request.args.get("resolution", 320))))
            latitude, longitude = float(request.args["latitude"]), float(request.args["longitude"])
        except (KeyError, ValueError):
            abort(400, "forecastHour, depth, resolution, latitude, and longitude must be numeric")
        models = tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS
        return jsonify(great_lakes_temperature_value(forecast_hour, depth, resolution, latitude, longitude, models))

    @app.get("/api/great-lakes/profile")
    def great_lakes_profile() -> Response:
        try:
            forecast_hour = min((0, 6, 12, 24, 48), key=lambda value: abs(value - int(request.args.get("forecastHour", 0))))
            latitude, longitude = float(request.args["latitude"]), float(request.args["longitude"])
        except (KeyError, ValueError):
            abort(400, "forecastHour, latitude, and longitude must be numeric")
        models = tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS
        return jsonify(great_lakes_temperature_profile(forecast_hour, latitude, longitude, models))

    @app.get("/api/great-lakes/<layer>")
    def great_lakes(layer: str) -> Response:
        if layer not in {"temperature", "currents"}:
            abort(404)
        try:
            forecast_hour = min((0, 6, 12, 24, 48), key=lambda value: abs(value - int(request.args.get("forecastHour", 0))))
            depth = max(0, min(500, int(request.args.get("depth", 0))))
        except ValueError:
            abort(400, "forecastHour and depth must be numeric")
        models = tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS
        response = jsonify(great_lakes_payload(layer, forecast_hour, depth, models))
        response.headers["Cache-Control"] = "private, max-age=600"
        return response

    @app.get("/api/great-lakes/temperature-raster")
    def great_lakes_temperature_raster() -> Response:
        try:
            forecast_hour = min((0, 6, 12, 24, 48), key=lambda value: abs(value - int(request.args.get("forecastHour", 0))))
            depth = max(0, min(500, int(request.args.get("depth", 0))))
            resolution = max(128, min(512, int(request.args.get("resolution", 320))))
        except ValueError:
            abort(400, "forecastHour, depth, and resolution must be numeric")
        models = tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS
        response = jsonify(great_lakes_temperature_rasters(forecast_hour, depth, resolution, models))
        response.headers["Cache-Control"] = "private, max-age=600"
        return response

    @app.get("/api/great-lakes/thermocline-raster")
    def great_lakes_thermocline_raster() -> Response:
        try:
            forecast_hour = min((0, 6, 12, 24, 48), key=lambda value: abs(value - int(request.args.get("forecastHour", 0))))
            resolution = max(128, min(512, int(request.args.get("resolution", 320))))
        except ValueError:
            abort(400, "forecastHour and resolution must be numeric")
        models = tuple(model for model in request.args.get("models", "").split(",") if model in MODELS) or MODELS
        response = jsonify(great_lakes_thermocline_rasters(forecast_hour, resolution, models))
        response.headers["Cache-Control"] = "private, max-age=600"
        return response

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
        try:
            stored_name = convert_heif_upload(category, stored_name)
        except ValueError as error:
            if destination.is_file():
                destination.unlink()
            return jsonify({"error": str(error)}), 400
        converted_heif = suffix in {".heic", ".heif"}
        preview_filename = create_upload_preview(category, stored_name) if media_type == "image" else ""
        metadata = request.form.get("metadata")
        try:
            metadata_payload = json.loads(metadata) if metadata else {}
        except json.JSONDecodeError:
            metadata_payload = {}
        if media_type == "image":
            metadata_payload = scrub_private_photo_metadata({
                **extract_image_metadata(category, stored_name),
                **metadata_payload,
            })
        metadata_payload = {
            **metadata_payload,
            "name": filename,
            "mimeType": "image/jpeg" if converted_heif else upload.mimetype,
            "mediaType": media_type,
            "previewFilename": preview_filename,
            **({"convertedFrom": suffix.removeprefix(".").upper()} if converted_heif else {}),
            **({"_heifMetadataVersion": 1} if converted_heif else {}),
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
        return jsonify({"media": orphaned_upload_items()})

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
        metadata = read_upload_metadata("queue", filename)
        media_type = metadata.get("mediaType") or upload_media_type(metadata.get("mimeType", ""), suffix)
        preview_filename = metadata.get("previewFilename") or ""
        source_metadata = upload_metadata_path("queue", filename)
        source_preview = upload_category_path("queue") / PREVIEW_DIRNAME / (
            preview_filename or upload_preview_path("queue", filename).name
        )
        target_preview = upload_preview_path(target_category, target_name)
        target_metadata = upload_metadata_path(target_category, target_name)
        preview_promoted = False
        try:
            source.replace(destination)
            if preview_filename and source_preview.exists():
                source_preview.replace(target_preview)
                preview_promoted = True
                preview_filename = target_preview.name
            else:
                preview_filename = create_upload_preview(target_category, target_name) if media_type == "image" else ""
            metadata["mediaType"] = media_type or "image"
            metadata["previewFilename"] = preview_filename
            write_upload_metadata(target_category, target_name, metadata)
            if source_metadata.exists():
                source_metadata.unlink()
        except Exception:
            if target_metadata.is_file():
                target_metadata.unlink()
            if target_preview.is_file():
                if preview_promoted:
                    source_preview.parent.mkdir(parents=True, exist_ok=True)
                    target_preview.replace(source_preview)
                else:
                    target_preview.unlink()
            if destination.is_file():
                destination.replace(source)
            raise
        return jsonify(upload_payload(target_category, target_name, metadata))

    @app.delete("/api/photo-queue/<filename>")
    def delete_photo_queue_item(filename: str) -> Response:
        safe_name = secure_filename(filename)
        photo = upload_category_path("queue") / safe_name
        metadata = upload_metadata_path("queue", safe_name)
        metadata_payload = read_upload_metadata("queue", safe_name)
        preview = upload_category_path("queue") / PREVIEW_DIRNAME / (
            metadata_payload.get("previewFilename") or upload_preview_path("queue", safe_name).name
        )
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
    @app.get("/expeditions")
    @app.get("/bests")
    @app.get("/stats")
    @app.get("/leaderboard")
    @app.get("/map")
    @app.get("/gear")
    @app.get("/boat")
    @app.get("/gallery")
    @app.get("/settings")
    def app_page() -> Response:
        theme = read_logbook().get("settings", {}).get("theme")
        initial_theme = "dark" if theme == "dark" else "light"
        document = (ROOT / "index.html").read_text(encoding="utf-8")
        document = document.replace(
            '<html lang="en">',
            f'<html lang="en" data-theme="{initial_theme}">',
            1,
        )
        return Response(document, mimetype="text/html")

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
