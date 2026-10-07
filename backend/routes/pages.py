"""The single-page app shell, static assets, health, and CSRF token."""

from __future__ import annotations

from flask import Blueprint, Response, abort, current_app, jsonify, render_template, send_from_directory

from ..config import PROJECT_ROOT
from ..request_security import csrf_token
from . import read_document


blueprint = Blueprint("pages", __name__)

APP_ROUTES = (
    "/", "/trips", "/expeditions", "/bests", "/stats", "/leaderboard",
    "/map", "/gear", "/gallery", "/checklists", "/wiki", "/settings",
)
STATIC_SUFFIXES = {".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".woff", ".woff2", ".map"}
PUBLIC_STATIC_JSON_ASSETS = {"data/bathymetry/manifest.json"}


@blueprint.get("/healthz")
def healthcheck() -> Response:
    """Report process health without requiring the persisted logbook to be valid."""
    return jsonify({"ok": True})


@blueprint.get("/api/csrf-token")
def get_csrf_token() -> Response:
    return jsonify({"csrfToken": csrf_token()})


@blueprint.get("/favicon.ico")
def favicon() -> tuple[str, int]:
    return "", 204


def app_page() -> Response:
    database_error = ""
    try:
        theme = read_document().get("settings", {}).get("theme")
    except Exception as error:
        # Keep the complete shell available so cached browser data, the empty
        # v2 defaults, and the archive tools can still be used. The bad
        # database is not rewritten here.
        database_error = str(error) or "The stored logbook database could not be opened."
        current_app.logger.error("Stored logbook could not be loaded; serving degraded app shell: %s", database_error)
        theme = None
    return Response(
        render_template(
            "index.html",
            initial_theme="dark" if theme == "dark" else "light",
            database_error=database_error,
        ),
        mimetype="text/html",
    )


for _route in APP_ROUTES:
    blueprint.add_url_rule(_route, "app_page", app_page, methods=["GET"])


@blueprint.get("/static/<path:filename>")
def static_files(filename: str) -> Response:
    if filename.startswith(".") or "/." in filename:
        abort(404)
    static_root = (PROJECT_ROOT / "static").resolve()
    requested = (static_root / filename).resolve()
    if (
        static_root not in requested.parents
        or (requested.suffix.lower() not in STATIC_SUFFIXES and filename not in PUBLIC_STATIC_JSON_ASSETS)
    ):
        abort(404)
    return send_from_directory(static_root, filename)
