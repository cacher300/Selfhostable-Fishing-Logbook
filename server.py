from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "logbook.json"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))


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
