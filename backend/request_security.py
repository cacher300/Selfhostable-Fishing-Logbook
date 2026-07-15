from __future__ import annotations

import secrets

from flask import Flask, Response, jsonify, request, session


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def configure_request_security(app: Flask) -> None:
    @app.before_request
    def protect_request() -> Response | tuple[Response, int] | None:
        if request.path == "/favicon.ico" or request.path.startswith("/static/"):
            return None

        if request.method not in SAFE_METHODS:
            expected = session.get("csrf_token", "")
            supplied = request.headers.get("X-CSRF-Token", "")
            if not expected or not supplied or not secrets.compare_digest(expected, supplied):
                return jsonify({"error": "Invalid or missing CSRF token"}), 403
        return None


def csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token
