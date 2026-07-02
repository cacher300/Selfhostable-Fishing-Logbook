from __future__ import annotations

import hmac
import secrets
import time
from collections import defaultdict, deque
from threading import Lock

from flask import Flask, Response, jsonify, request, session


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class FixedWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            expired_keys = [
                request_key
                for request_key, timestamps in self._requests.items()
                if timestamps and timestamps[-1] <= cutoff
            ]
            for request_key in expired_keys:
                del self._requests[request_key]

            requests = self._requests[key]
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self.limit:
                return False
            requests.append(now)
            return True


def configure_request_security(app: Flask) -> None:
    limiter = FixedWindowRateLimiter(app.config["RATE_LIMIT_PER_MINUTE"])

    @app.before_request
    def protect_request() -> Response | tuple[Response, int] | None:
        if request.path == "/favicon.ico" or request.path.startswith("/static/"):
            return None

        client = request.remote_addr or "unknown"
        if not limiter.allow(client):
            return jsonify({"error": "Too many requests. Try again shortly."}), 429

        username = app.config["LOGBOOK_USERNAME"]
        password = app.config["LOGBOOK_PASSWORD"]
        if not username or not password:
            return jsonify({"error": "Server authentication is not configured"}), 503

        credentials = request.authorization
        authenticated = (
            credentials is not None
            and hmac.compare_digest(credentials.username or "", username)
            and hmac.compare_digest(credentials.password or "", password)
        )
        if not authenticated:
            response = jsonify({"error": "Authentication required"})
            response.status_code = 401
            response.headers["WWW-Authenticate"] = 'Basic realm="Fishing Logbook"'
            return response

        if request.method not in SAFE_METHODS:
            expected = session.get("csrf_token", "")
            supplied = request.headers.get("X-CSRF-Token", "")
            if not expected or not supplied or not hmac.compare_digest(expected, supplied):
                return jsonify({"error": "Invalid or missing CSRF token"}), 403
        return None


def csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token
