"""Flask application factory."""

from __future__ import annotations

from flask import Flask, Response, jsonify, request

from . import cloud_storage
from .config import PROJECT_ROOT, AppConfig
from .frontend_assets import asset_url
from .logbook_changes import LogbookChangeError
from .logbook_store import LogbookStorageError
from .media_service import MediaNotFound
from .request_security import configure_request_security
from .routes import environment, logbook, media, pages
from .storage import MediaInventoryIncomplete, MediaRequestError, RevisionConflict, Storage, create_storage


SELF_CACHED_ENDPOINTS = {"pages.static_files", *environment.CACHEABLE_ENDPOINTS}


def create_app(config: AppConfig | None = None, *, storage: Storage | None = None) -> Flask:
    config = config or AppConfig.from_env()
    app = Flask(__name__, static_folder=None, template_folder=str(PROJECT_ROOT / "templates"))
    app.config.update(
        SECRET_KEY=config.secret_key,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        # Enabled by the production deployment once Cloudflare/Nginx enforce
        # HTTPS. Keep the default off for the documented local HTTP workflow.
        SESSION_COOKIE_SECURE=config.session_cookie_secure,
        TESTING=config.testing,
    )
    app.extensions["fish.config"] = config
    app.extensions["fish.storage"] = storage or create_storage(config)
    app.jinja_env.globals["asset_url"] = asset_url
    configure_request_security(app)
    _register_error_handlers(app)

    @app.after_request
    def add_no_store_header(response: Response) -> Response:
        # Only successful responses from endpoints with their own policy keep it;
        # everything else, including private uploads, stays no-store.
        if request.endpoint not in SELF_CACHED_ENDPOINTS or response.status_code >= 400:
            response.headers["Cache-Control"] = "no-store"
        return response

    for module in (pages, logbook, media, environment):
        app.register_blueprint(module.blueprint)
    return app


def _register_error_handlers(app: Flask) -> None:
    def error(message: str, status: int, **extra) -> tuple[Response, int]:
        return jsonify({"error": message, **extra}), status

    @app.errorhandler(cloud_storage.CloudStorageError)
    def cloud_storage_error(exception: cloud_storage.CloudStorageError) -> tuple[Response, int]:
        app.logger.error("Cloud storage request failed: %s", exception)
        return error(str(exception), exception.status)

    @app.errorhandler(LogbookStorageError)
    def logbook_storage_error(exception: LogbookStorageError) -> tuple[Response, int]:
        """Keep an unreadable local database from turning the API into an HTML 500."""
        app.logger.error("Stored logbook could not be loaded: %s", exception)
        return error(str(exception), 503, databaseUnavailable=True)

    @app.errorhandler(RevisionConflict)
    def revision_conflict(exception: RevisionConflict) -> tuple[Response, int]:
        response, status = error(str(exception), 412, revisionConflict=True)
        response.headers["ETag"] = exception.current_revision
        return response, status

    @app.errorhandler(LogbookChangeError)
    def logbook_change_error(exception: LogbookChangeError) -> tuple[Response, int]:
        return error(str(exception), 400)

    @app.errorhandler(MediaRequestError)
    def media_request_error(exception: MediaRequestError) -> tuple[Response, int]:
        return error(str(exception), 400)

    @app.errorhandler(MediaNotFound)
    def media_not_found(exception: MediaNotFound) -> tuple[Response, int]:
        return error(str(exception) or "Not found", 404)

    @app.errorhandler(MediaInventoryIncomplete)
    def media_inventory_incomplete(exception: MediaInventoryIncomplete) -> tuple[Response, int]:
        return error(str(exception), 503)
