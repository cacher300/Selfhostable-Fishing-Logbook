"""Entry point: ``python server.py`` for local runs, ``server:app`` for gunicorn.

Environment variables are read once here via :meth:`AppConfig.from_env`.
Run through the project virtual environment (``scripts/run-local.ps1``).
"""

from __future__ import annotations

import sys

from backend.app_factory import create_app
from backend.config import AppConfig
from backend.frontend_assets import frontend_build_is_stale, frontend_is_built


config = AppConfig.from_env()
app = create_app(config)


def main() -> None:
    if not frontend_is_built():
        print(
            "The browser bundle has not been built (static/dist is missing), so every page would be empty.\n"
            "Run `npm ci` and `npm run build` (scripts/run-local.ps1 does both), then start the server again.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if frontend_build_is_stale():
        print("Warning: static/js or static/css changed since the last build; run `npm run build` to see the changes.", file=sys.stderr)
    try:
        app.extensions["fish.storage"].logbook.initialize()
    except Exception as error:
        # Startup must remain available for recovery and read-only inspection
        # when the existing SQLite file is corrupt, legacy, or incompatible.
        app.logger.exception("Could not initialize the stored logbook database; starting in degraded mode.")
        print(f"Warning: the logbook database could not be initialized; starting in degraded mode: {error}", file=sys.stderr)

    print(f"Selfhostable Fishing Logbook running at http://{config.host}:{config.port}")
    print(f"Database: {config.database_file}")
    app.run(host=config.host, port=config.port, threaded=True)


if __name__ == "__main__":
    main()
