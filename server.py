"""Entry point: ``python server.py`` for local runs, ``server:app`` for gunicorn.

Environment variables are read once here via :meth:`AppConfig.from_env`.
Run through the project virtual environment (``scripts/run-local.ps1``).
"""

from __future__ import annotations

import sys

from backend.app_factory import create_app
from backend.config import AppConfig


config = AppConfig.from_env()
app = create_app(config)


def main() -> None:
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
