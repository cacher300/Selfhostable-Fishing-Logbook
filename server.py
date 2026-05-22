from __future__ import annotations

import json
import os
import uuid
from copy import deepcopy
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.utils import secure_filename


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "logbook.json"
UPLOADS_DIR = DATA_DIR / "uploads"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
UPLOAD_CATEGORIES = {"catch-photos", "trip-photos", "lures", "flashers", "queue"}
ALLOWED_IMAGE_EXTENSIONS = {".avif", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".webm", ".avi", ".mpeg", ".mpg", ".3gp"}
ALLOWED_MEDIA_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
PREVIEW_DIRNAME = "_previews"
PREVIEW_MAX_SIZE = (1200, 1200)


DEFAULT_LOGBOOK = {
    "species": [
        "Lake Trout",
        "Largemouth Bass",
        "Smallmouth Bass",
        "Chinook Salmon",
        "Coho Salmon",
        "Rainbow Trout",
        "Brown Trout",
        "Walleye",
        "Northern Pike",
        "Muskie",
        "Rock Bass",
        "Perch",
        "Crappie",
        "Bluegill",
    ],
    "methods": [
        "Trolling",
        "Casting",
        "Jigging",
        "Fly Fishing",
        "Bait Fishing",
        "Ice Fishing",
        "Shore Fishing",
    ],
    "lureTypes": [
        "Spoon",
        "Fly",
        "Meat Rig",
        "Crankbait",
        "Spinner",
        "Jig",
        "Soft Plastic",
        "Plug",
        "Swimbait",
        "Flasher/Fly",
        "Jerkbait",
        "Topwater",
        "Blade Bait",
        "Other",
    ],
    "flasherTypes": [
        "Paddle",
        "Spin Doctor",
    ],
    "lures": [],
    "flashers": [],
    "people": [],
    "locations": [],
    "trips": [],
}


def normalize_logbook(payload: dict | None = None) -> dict:
    normalized = deepcopy(DEFAULT_LOGBOOK)
    if isinstance(payload, dict):
        normalized.update(payload)

    normalized["methods"] = deepcopy(DEFAULT_LOGBOOK["methods"])
    normalized.pop("tripTypes", None)

    list_keys = ("species", "lureTypes", "flasherTypes", "lures", "flashers", "people", "locations", "trips")
    for key in list_keys:
        if not isinstance(normalized.get(key), list):
            normalized[key] = deepcopy(DEFAULT_LOGBOOK[key])

    known_people = {
        person.get("id"): person
        for person in normalized["people"]
        if isinstance(person, dict) and person.get("id")
    }
    for trip in normalized["trips"]:
        if not isinstance(trip, dict):
            continue
        for person in trip.get("people", []):
            if (
                isinstance(person, dict)
                and person.get("id")
                and person.get("name")
                and person.get("id") not in known_people
            ):
                known_people[person["id"]] = {"id": person["id"], "name": person["name"]}
    normalized["people"] = list(known_people.values())

    known_locations = {
        str(location).strip().lower(): str(location).strip()
        for location in normalized["locations"]
        if str(location).strip()
    }
    for trip in normalized["trips"]:
        if isinstance(trip, dict) and str(trip.get("location", "")).strip():
            location = str(trip["location"]).strip()
            known_locations.setdefault(location.lower(), location)
    normalized["locations"] = list(known_locations.values())

    return normalized


def read_logbook() -> dict:
    if not DATA_FILE.exists():
        return normalize_logbook()

    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
    except json.JSONDecodeError:
        return normalize_logbook()

    return normalize_logbook(loaded)

def write_logbook(payload: dict) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(normalize_logbook(payload), file, indent=2)


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
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def delete_upload_file(category: str, filename: str, metadata: dict | None = None) -> None:
    metadata = metadata or read_upload_metadata(category, filename)
    media_path = upload_category_path(category) / filename
    metadata_path = upload_metadata_path(category, filename)
    preview_filename = metadata.get("previewFilename") or upload_preview_path(category, filename).name
    preview_path = upload_category_path(category) / PREVIEW_DIRNAME / preview_filename
    for path in (media_path, metadata_path, preview_path):
        if path.exists():
            path.unlink()


def update_media_reference(value: object, replacement_payloads: dict[tuple[str, str], dict]) -> object:
    if isinstance(value, list):
        return [update_media_reference(item, replacement_payloads) for item in value]
    if not isinstance(value, dict):
        return value

    media_key = None
    path = str(value.get("path") or "")
    filename = str(value.get("filename") or "")
    if "/" in path:
        category, stored_name = path.split("/", 1)
        media_key = (category, stored_name)
    if media_key is None:
        for field in ("url", "image"):
            media_path = str(value.get(field) or "")
            if not media_path.startswith("/uploads/"):
                continue
            parts = media_path.removeprefix("/uploads/").split("/", 1)
            if len(parts) == 2:
                media_key = (parts[0], parts[1])
                break
    if media_key is None and filename:
        for category in UPLOAD_CATEGORIES:
            if (category, filename) in replacement_payloads:
                media_key = (category, filename)
                break

    updated = {key: update_media_reference(item, replacement_payloads) for key, item in value.items()}
    if media_key in replacement_payloads:
        updated.update(replacement_payloads[media_key])
        if "caption" in value:
            updated["caption"] = value["caption"]
        if "id" in value:
            updated["id"] = value["id"]
    return updated


def dedupe_upload_category(category: str) -> dict[tuple[str, str], dict]:
    directory = upload_category_path(category)
    seen: dict[tuple[str, int], tuple[str, dict]] = {}
    replacements: dict[tuple[str, str], dict] = {}

    for file_path in sorted(directory.iterdir(), key=lambda path: path.stat().st_mtime):
        if not file_path.is_file() or file_path.suffix == ".json" or file_path.parent.name == PREVIEW_DIRNAME:
            continue
        suffix = file_path.suffix.lower()
        if suffix not in ALLOWED_MEDIA_EXTENSIONS:
            continue

        metadata = read_upload_metadata(category, file_path.name)
        original_name = str(metadata.get("name") or file_path.name).strip().lower()
        duplicate_key = (original_name, file_path.stat().st_size)
        if duplicate_key not in seen:
            seen[duplicate_key] = (file_path.name, metadata)
            continue

        kept_filename, kept_metadata = seen[duplicate_key]
        replacements[(category, file_path.name)] = upload_payload(category, kept_filename, kept_metadata)
        delete_upload_file(category, file_path.name, metadata)

    return replacements


def dedupe_duplicate_uploads() -> int:
    if not UPLOADS_DIR.exists():
        return 0

    replacements: dict[tuple[str, str], dict] = {}
    for category in sorted(UPLOAD_CATEGORIES):
        replacements.update(dedupe_upload_category(category))

    if replacements and DATA_FILE.exists():
        logbook = read_logbook()
        updated_logbook = update_media_reference(logbook, replacements)
        write_logbook(updated_logbook)

    return len(replacements)


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
    preview_filename = metadata.get("previewFilename") or ""
    return {
        **metadata,
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


def validate_logbook(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, "Logbook must be a JSON object"

    required_lists = ("trips", "lures", "flashers")
    if any(not isinstance(payload.get(key), list) for key in required_lists):
        return False, "Logbook must include trips, lures, and flashers lists"

    if not isinstance(payload.get("people", []), list):
        return False, "Logbook people must be a list"

    return True, None


def create_app() -> Flask:
    removed_duplicates = dedupe_duplicate_uploads()
    if removed_duplicates:
        print(f"Removed {removed_duplicates} duplicate upload{'s' if removed_duplicates != 1 else ''}.")

    app = Flask(__name__, static_folder=None)

    @app.after_request
    def add_no_store_header(response: Response) -> Response:
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/logbook")
    def get_logbook() -> Response:
        return jsonify(read_logbook())

    @app.put("/api/logbook")
    def update_logbook() -> tuple[Response, int] | Response:
        payload = request.get_json(silent=True)
        is_valid, error = validate_logbook(payload)
        if not is_valid:
            return jsonify({"error": error}), 400

        write_logbook(normalize_logbook(payload))
        return jsonify({"ok": True})

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
    def list_gallery() -> Response:
        category = request.args.get("category", "all")
        categories = sorted(UPLOAD_CATEGORIES) if category == "all" else [category]
        if any(item not in UPLOAD_CATEGORIES for item in categories):
            return jsonify({"error": "Invalid upload category"}), 400
        items = []
        for item_category in categories:
            items.extend(upload_gallery_items(item_category))
        items.sort(key=lambda item: item["modified"], reverse=True)
        return jsonify({"media": items})

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

    @app.get("/api/export")
    def export_logbook() -> Response:
        body = json.dumps(read_logbook(), indent=2)
        return Response(
            body,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment; filename=fishing-logbook.json"},
        )

    @app.get("/favicon.ico")
    def favicon() -> tuple[str, int]:
        return "", 204

    @app.get("/")
    def index() -> Response:
        return send_file(ROOT / "index.html")

    @app.get("/<path:filename>")
    def static_files(filename: str) -> Response:
        requested = (ROOT / filename).resolve()
        if ROOT not in requested.parents or not requested.is_file():
            abort(404)
        return send_from_directory(ROOT, filename)

    return app


app = create_app()


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        write_logbook(DEFAULT_LOGBOOK)

    print(f"Fishing Logbook running at http://{HOST}:{PORT}")
    print(f"Data file: {DATA_FILE}")
    app.run(host=HOST, port=PORT, threaded=True)


if __name__ == "__main__":
    main()
